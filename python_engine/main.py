from fastapi import (
    FastAPI,
    Security,
    status,
    WebSocket,
    WebSocketDisconnect,
    Query,
    HTTPException,
    Body,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from typing import Optional, List, Dict
import yfinance as yf
import ta
import os
import gc
from dotenv import load_dotenv

# --- Alpaca Trade API Imports ---
from alpaca.data.live import StockDataStream
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.timeframe import TimeFrame
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import (
    MarketOrderRequest,
    LimitOrderRequest,
    GetOrdersRequest,
)
from alpaca.trading.enums import OrderSide, TimeInForce, OrderStatus
from alpaca.data.enums import DataFeed

# --- Rare Source Imports ---
import uuid
import re
from cachetools import TTLCache

try:
    from scraper import SearchAggregator
except ImportError:
    SearchAggregator = None
from db_manager import DBManager
import asyncio
from datetime import datetime
from supabase import create_client, Client
import pandas as pd
import numpy as np
from webhook_manager import WebhookManager
from paper_engine import PaperTradingManager, INITIAL_CAPITAL
from utils import PartNormalizer

# from backtester import run_backtest (Removed for modern TS engine)
from cache_manager import get_cache_manager
from inventory_service import inventory_service

webhook = WebhookManager()
# PaperTradingManager 인스턴스 (Supabase가 초기화된 후 설정)
paper_engine = None


def is_market_hours() -> bool:
    """US 시장 개장 여부 (ET 기준 평일 09:30~16:00). DST 자동 처리."""
    from zoneinfo import ZoneInfo

    now_et = datetime.now(ZoneInfo("America/New_York"))
    if now_et.weekday() >= 5:
        return False
    open_min = 9 * 60 + 30
    close_min = 16 * 60
    cur_min = now_et.hour * 60 + now_et.minute
    return open_min <= cur_min < close_min


# .env 파일에서 환경변수 로드
load_dotenv()

# --- Alpaca Clients Initialization ---
APCA_API_KEY = os.getenv("APCA_API_KEY_ID")
APCA_API_SECRET = os.getenv("APCA_API_SECRET_KEY")
APCA_PAPER = os.getenv("APCA_PAPER", "true").lower() == "true"

trading_client = None
if APCA_API_KEY and APCA_API_SECRET:
    trading_client = TradingClient(APCA_API_KEY, APCA_API_SECRET, paper=APCA_PAPER)

app = FastAPI(
    title="MuzeBIZ Technical Analysis API",
    description="Unified Python Platform for Stock Analysis & Discovery",
    version="2.1.0",
)

# Security Configuration
API_KEY_NAME = "X-Admin-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


# --- Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


async def get_api_key(header_value: str = Security(api_key_header)):
    """ADMIN_SECRET_KEY 환경변수와 헤더 값을 비교하여 인증"""
    admin_key = os.getenv("ADMIN_SECRET_KEY") or os.getenv("VITE_ADMIN_SECRET_KEY")
    if not admin_key:
        # 보안을 위해 키가 설정되지 않은 경우 모든 요청 거부
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin secret key not configured on server",
        )

    if header_value == admin_key:
        return header_value

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Could not validate credentials"
    )


# --- [STATEFUL DATA QUEUE] ---
class TickerDataState:
    """실시간 지표 계산을 위한 1분봉 히스토리 유지 클래스"""

    def __init__(self, max_bars: int = 150):
        self.max_bars = max_bars
        self.history: Dict[str, pd.DataFrame] = {}
        # [Opt-1] IEX는 전체 시장 거래량의 2~5%만 반영 → yfinance 비율로 교정
        self.volume_multiplier: Dict[str, float] = {}
        # [Fix-RVOL] 30일 일봉 평균 거래량 (1분봉 rolling 대신 사용)
        self.avg_daily_volume: Dict[str, float] = {}

    def update(self, ticker: str, bar) -> pd.DataFrame:
        """새로운 캔들을 히스토리에 병합 (거래량 교정 포함)"""
        # [Opt-1] IEX 거래량에 교정 배수 적용
        raw_vol = float(bar.volume)
        multiplier = self.volume_multiplier.get(ticker, 1.0)
        calibrated_vol = raw_vol * multiplier

        new_row = {
            "Open": float(bar.open),
            "High": float(bar.high),
            "Low": float(bar.low),
            "Close": float(bar.close),
            "Volume": calibrated_vol,  # 교정된 거래량 사용
            "_raw_iex_volume": raw_vol,  # 원본 IEX 거래량 디버깅용 보존
        }
        # Alpaca bar.timestamp는 timezone-aware (UTC)
        df_new = pd.DataFrame([new_row], index=[pd.to_datetime(bar.timestamp)])

        if ticker not in self.history:
            self.history[ticker] = df_new
        else:
            # 중복 체크 (동일 타임스탬프면 업데이트)
            if df_new.index[0] in self.history[ticker].index:
                self.history[ticker].loc[df_new.index[0]] = new_row
            else:
                self.history[ticker] = pd.concat([self.history[ticker], df_new])

            # 최신 N개만 유지
            if len(self.history[ticker]) > self.max_bars:
                self.history[ticker] = self.history[ticker].iloc[-self.max_bars :]

        return self.history[ticker]

    async def warm_up(self, tickers: List[str]):
        """시스템 시작 시 최근 1분봉 100개를 Alpaca에서 가져와 채우고
        [Opt-1] yfinance 전일 총거래량과의 비율로 Volume Multiplier 계산"""
        # Try Alpaca first if credentials exist
        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")

        if api_key and api_secret:
            try:
                from alpaca.data.requests import StockBarsRequest

                client = StockHistoricalDataClient(api_key, api_secret)
                for ticker in tickers:
                    request_params = StockBarsRequest(
                        symbol_or_symbols=ticker,
                        timeframe=TimeFrame.Minute,
                        limit=self.max_bars,
                        feed=DataFeed.IEX,  # Paper keys typically only have access to IEX feed
                    )
                    bars = await asyncio.to_thread(
                        client.get_stock_bars, request_params
                    )
                    df = bars.df
                    if not df.empty:
                        if isinstance(df.index, pd.MultiIndex):
                            df = df.xs(ticker, level=0)
                        df = df[["open", "high", "low", "close", "volume"]].rename(
                            columns={
                                "open": "Open",
                                "high": "High",
                                "low": "Low",
                                "close": "Close",
                                "volume": "Volume",
                            }
                        )

                        # [Opt-1] Volume Calibration: IEX vs yfinance 총거래량 비율 계산
                        try:
                            iex_total_vol = df["Volume"].sum()
                            tk = yf.Ticker(ticker)
                            yf_hist = await asyncio.to_thread(
                                tk.history, period="1d", interval="1m"
                            )
                            yf_total_vol = (
                                yf_hist["Volume"].sum() if not yf_hist.empty else 0
                            )
                            if iex_total_vol > 0 and yf_total_vol > 0:
                                multiplier = min(yf_total_vol / iex_total_vol, 20.0)
                                self.volume_multiplier[ticker] = multiplier
                                # 히스토리 거래량에도 소급 적용
                                df["Volume"] = df["Volume"] * multiplier
                                print(
                                    f"📊 [VolMul] {ticker}: {multiplier:.1f}x calibrated (IEX→Full Market)"
                                )
                            else:
                                self.volume_multiplier[ticker] = 1.0
                                print(
                                    f"⚠️ [VolMul] {ticker}: calibration skipped (vol=0), using 1.0x"
                                )
                        except Exception as e:
                            self.volume_multiplier[ticker] = 1.0
                            print(f"⚠️ [VolMul] {ticker}: calibration error: {e}")

                        self.history[ticker] = df
                        print(
                            f"✅ [Alpaca/IEX] {ticker} warmed up ({len(df)} bars, data_source=alpaca_iex)."
                        )
                if len(self.history) >= len(tickers):
                    pass  # fall through to daily volume fetch step
            except Exception as e:
                print(f"⚠️ Alpaca warm-up interrupted: {e}")

        # Fallback to yfinance for remaining or all
        print("🌐 [Warm-up] Falling back to yfinance (1m interval)...")
        for ticker in tickers:
            if ticker in self.history and len(self.history[ticker]) >= 35:
                continue
            try:
                tk = yf.Ticker(ticker)
                # yfinance 1m is available for last 7 days
                df = await asyncio.to_thread(tk.history, period="5d", interval="1m")
                if not df.empty:
                    df = df.tail(self.max_bars)
                    self.history[ticker] = df
                    # [Opt-1] yfinance 폴백 시 배수 1.0 (이미 전체 시장 데이터)
                    self.volume_multiplier[ticker] = 1.0
                    print(
                        f"✅ [yfinance] {ticker} warmed up (data_source=yfinance_1m)."
                    )
            except Exception as e:
                print(f"⚠️ {ticker} yfinance warm-up failed: {e}")

        # [Fix-RVOL] 30일 일봉 평균 거래량 계산 (1분봉 rolling(30) 대체)
        # 390분/일 기준으로 나눠 분봉 단위 기대 거래량 계산에 사용
        print("📊 [Warm-up] Fetching 30d avg daily volume for RVOL correction...")
        for ticker in tickers:
            if ticker in self.avg_daily_volume:
                continue
            try:
                tk = yf.Ticker(ticker)
                daily = await asyncio.to_thread(tk.history, period="30d", interval="1d")
                if not daily.empty:
                    self.avg_daily_volume[ticker] = float(daily["Volume"].mean())
                    print(
                        f"📈 [AvgVol] {ticker}: {self.avg_daily_volume[ticker]:,.0f} avg daily shares"
                    )
            except Exception as e:
                print(f"⚠️ [AvgVol] {ticker}: {e}")


# 전역 상태 인스턴스
candle_state = TickerDataState(max_bars=100)


# Global instances
db = DBManager()
SYSTEM_ARMED = False  # 자동 매매 활성화 상태 (Default: False)

# Penny scan auto-scheduler state
last_penny_scan_at: Optional[datetime] = None
penny_scan_results_cache: List[dict] = []
_current_stream_task: Optional[asyncio.Task] = None  # 장 중 스캔 후 즉시 재시작에 사용

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    ticker: str
    period: str = "1mo"


class PanicSellRequest(BaseModel):
    confirm: bool


class ArmRequest(BaseModel):
    arm: bool


class OrderRequest(BaseModel):
    ticker: str
    side: str  # 'buy' or 'sell'
    quantity: float
    type: str = "market"  # 'market' or 'limit'
    price: Optional[float] = None


class ClosePositionRequest(BaseModel):
    ticker: str


class PaperSellRequest(BaseModel):
    ticker: str


class TechnicalIndicators(BaseModel):
    ticker: str
    period: str
    current_price: float
    rsi_14: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_12: Optional[float] = None
    ema_26: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_diff: Optional[float] = None
    signal: str
    strength: str = "NORMAL"
    reasoning: str


@app.get("/")
def root():
    return {"message": "MuzeBIZ Unified Python Platform is running!"}


@app.get("/api/pulse/status")
async def get_pulse_status():
    """Pulse 엔진의 실시간 상태 및 데이터 축적 현황 반환"""
    stats = {}
    for ticker, df in candle_state.history.items():
        stats[ticker] = {
            "bars": len(df),
            "last_update": df.index[-1].isoformat() if not df.empty else None,
            "is_ready": len(df) >= 35,
        }

    return {
        "engine": "Alpaca-Stream-Hybrid",
        "market_status": "CLOSED" if datetime.now().weekday() >= 5 else "OPEN/PENDING",
        "active_monitors": len(stats),
        "ticker_states": stats,
    }


@app.get("/api/pulse/history")
async def get_pulse_history(limit: int = 20):
    """최근 생성된 실시간 신호 목록 반환 (대시보드 초기화용)"""
    if not supabase:
        return []

    try:
        res = await asyncio.to_thread(
            supabase.table("realtime_signals")
            .select("*")
            .order("timestamp", desc=True)
            .limit(limit)
            .execute
        )
        return res.data
    except Exception as e:
        print(f"❌ Pulse History Fetch Error: {e}")
        return []


@app.get("/api/pulse/strong-buy-log")
async def get_strong_buy_log(limit: int = 50):
    """STRONG BUY 발동 이력 조회 — 실제 트리거된 신호만 필터링"""
    if not supabase:
        return {"events": [], "total": 0}

    try:
        res = await asyncio.to_thread(
            supabase.table("realtime_signals")
            .select("ticker,timestamp,rsi,adx,rvol,price,signal,strength,ai_metadata")
            .eq("signal", "BUY")
            .eq("strength", "STRONG")
            .order("timestamp", desc=True)
            .limit(limit)
            .execute
        )
        events = []
        for row in res.data or []:
            # dna_score: ai_metadata JSON에서 추출 (컬럼 없어도 동작)
            ai_meta = row.get("ai_metadata") or {}
            if isinstance(ai_meta, str):
                import json as _json

                try:
                    ai_meta = _json.loads(ai_meta)
                except Exception:
                    ai_meta = {}
            dna = ai_meta.get("dna_score")
            events.append(
                {
                    "ticker": row.get("ticker"),
                    "timestamp": row.get("timestamp"),
                    "price": row.get("price"),
                    "dna_score": dna,
                    "rsi": row.get("rsi"),
                    "adx": row.get("adx"),
                    "rvol": row.get("rvol"),
                }
            )
        return {"events": events, "total": len(events)}
    except Exception as e:
        print(f"❌ Strong Buy Log Error: {e}")
        return {"events": [], "total": 0, "error": str(e)}


@app.get("/api/pulse/indicators")
async def get_indicator_snapshot():
    """
    모든 모니터링 종목의 실시간 지표 스냅샷 + STRONG BUY 근접도(proximity).
    각 조건 충족 여부와 임계값까지의 거리를 반환해 '발동까지 몇 단계 남았는지' 파악 가능.
    """
    if not candle_state.history:
        return {"tickers": {}, "armed": SYSTEM_ARMED}

    result = {}
    for ticker, df_raw in candle_state.history.items():
        if len(df_raw) < 35:
            result[ticker] = {"status": "warming_up", "bars": len(df_raw)}
            continue

        try:
            avg_daily_vol = candle_state.avg_daily_volume.get(ticker, 0.0)
            df = calculate_advanced_signals(
                df_raw.copy(), avg_daily_volume=avg_daily_vol
            )
            latest = df.iloc[-1]
            prev = df.iloc[-2] if len(df) >= 2 else latest

            rsi = float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0
            macd_diff = (
                float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
            )
            macd_diff_prev = (
                float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
            )
            adx = (
                float(latest["ADX"])
                if "ADX" in latest and not pd.isna(latest["ADX"])
                else 0.0
            )
            rvol = (
                float(latest["RVOL"])
                if "RVOL" in latest and not pd.isna(latest["RVOL"])
                else 1.0
            )
            is_extended = (
                bool(latest["Is_Extended"]) if "Is_Extended" in latest else False
            )
            price = float(latest["Close"])

            # 각 STRONG BUY 조건 충족 여부 및 임계값까지의 거리
            cond_rsi = {
                "value": round(rsi, 2),
                "threshold": 45,
                "met": rsi < 45,
                "gap": round(max(0.0, rsi - 45), 2),
            }
            cond_macd = {
                "value": round(macd_diff, 4),
                "threshold": 0,
                "met": macd_diff > 0 and macd_diff_prev <= 0,
                "bullish_territory": macd_diff > 0,
                "gap": round(max(0.0, -macd_diff), 4),
            }
            cond_adx = {
                "value": round(adx, 2),
                "threshold": 20,
                "met": adx > 20,
                "gap": round(max(0.0, 20 - adx), 2),
            }
            cond_rvol = {
                "value": round(rvol, 2),
                "threshold": 3.0,
                "met": rvol >= 3.0,
                "gap": round(max(0.0, 3.0 - rvol), 2),
            }
            cond_extended = {"value": is_extended, "met": not is_extended}

            conditions_met = sum(
                [
                    cond_rsi["met"],
                    cond_macd["met"],
                    cond_adx["met"],
                    cond_rvol["met"],
                    cond_extended["met"],
                ]
            )

            dna_score = calculate_dna_score(
                rsi, macd_diff, macd_diff_prev, adx, rvol, is_extended
            )
            strong_buy_active = (
                bool(latest["Strong_Buy"]) if "Strong_Buy" in latest else False
            )

            result[ticker] = {
                "price": round(price, 2),
                "dna_score": dna_score,
                "strong_buy_active": strong_buy_active,
                "conditions_met": conditions_met,
                "conditions_total": 5,
                "proximity_pct": round(conditions_met / 5 * 100),
                "conditions": {
                    "rsi": cond_rsi,
                    "macd_golden_cross": cond_macd,
                    "adx": cond_adx,
                    "rvol": cond_rvol,
                    "not_extended": cond_extended,
                },
                "bars": len(df_raw),
                "last_update": (
                    df_raw.index[-1].isoformat() if not df_raw.empty else None
                ),
            }
        except Exception as e:
            result[ticker] = {"status": "error", "error": str(e)}

    # 근접도 내림차순 정렬
    sorted_result = dict(
        sorted(
            result.items(), key=lambda x: x[1].get("proximity_pct", -1), reverse=True
        )
    )
    return {"tickers": sorted_result, "armed": SYSTEM_ARMED, "monitored": len(result)}


# --- Rare Source Schemas & Engine ---
class StandardPart(BaseModel):
    id: str
    mpn: str
    manufacturer: str
    distributor: str
    source_type: str
    stock: int
    price: float
    price_history: List[float]
    currency: str
    delivery: str
    condition: str
    date_code: str
    is_eol: bool
    risk_level: str
    risk_score: Optional[int] = 0
    market_notes: Optional[str] = ""
    lifecycle: Optional[str] = "Unknown"
    is_alternative: Optional[bool] = False
    relevance_score: Optional[int] = 0
    updated_at: datetime
    datasheet: Optional[str] = ""
    description: Optional[str] = ""
    product_url: Optional[str] = ""
    package: Optional[str] = "N/A"
    voltage: Optional[str] = "N/A"
    temperature: Optional[str] = "N/A"
    rohs: Optional[bool] = True
    specs: Dict[str, str] = {}


# from utils import PartNormalizer (Already imported at top)


class SourcingEngine:
    def __init__(self):
        self.exchange_rate = 1450.0
        # Results cache: max 100 queries, 5 min (300s) TTL
        self.search_cache = TTLCache(maxsize=100, ttl=300)

    def _generate_price_history(self, current_price: float):
        """Returns actual current price only — no mock/fake history."""
        if current_price > 0:
            return [round(float(current_price), 2)]
        return []

    def _calculate_risk_score(
        self, stock: int, distributors: List[str], is_eol: bool
    ) -> int:
        """
        Deterministic Risk Calculation (0-100)
        Based on availability, distribution breadth, and lifecycle.
        """
        score = 0

        # 1. Stock Risk (0-40 pts)
        if stock == 0:
            score += 40
        elif stock < 100:
            score += 25
        elif stock < 1000:
            score += 10

        # 2. Source Diversity Risk (0-30 pts)
        unique_dists = len(set(distributors))
        if unique_dists <= 1:
            score += 30
        elif unique_dists <= 3:
            score += 15

        # 3. Lifecycle Risk (0-30 pts)
        if is_eol:
            score += 30

        return min(score, 100)

    async def _fetch_from_provider(
        self, provider_name: str, provider_instance, q: str
    ) -> List[StandardPart]:
        """
        Generic wrapper for each sourcing provider (Mouser, DigiKey, Scraper, etc.)
        """
        try:
            print(f"🚀 [ENGINE] Calling provider: {provider_name}")
            # SearchAggregator now supports depth for family search internally or via specific call
            results = (
                await provider_instance.search_market_intel(q)
                if hasattr(provider_instance, "search_market_intel")
                else await provider_instance.search_mpn(q)
            )

            standardized = []
            for ext in results:
                try:
                    price = ext.get("price", 0.0)
                    stock = ext.get("stock", 0)
                    is_eol = (
                        ext.get("lifecycle") == "NRND"
                        or ext.get("risk_level") == "High"
                    )

                    # Calculate deterministic risk score
                    # Note: We don't have historical distributor list here easily,
                    # but we can use current result's context or mock it for now.
                    risk_score = self._calculate_risk_score(
                        stock, [ext.get("distributor", "Unknown")], is_eol
                    )

                    # Extract specs: everything else in ext that isn't a standard field
                    standard_fields = {
                        "id",
                        "mpn",
                        "manufacturer",
                        "distributor",
                        "source_type",
                        "stock",
                        "price",
                        "currency",
                        "delivery",
                        "condition",
                        "date_code",
                        "is_eol",
                        "risk_level",
                        "risk_score",
                        "lifecycle",
                        "is_alternative",
                        "updated_at",
                        "datasheet",
                        "product_url",
                        "description",
                        "market_notes",
                        "package",
                        "voltage",
                        "temperature",
                        "rohs",
                    }
                    specs = {
                        k: str(v)
                        for k, v in ext.items()
                        if k not in standard_fields and v is not None
                    }

                    part = StandardPart(
                        id=f"ext-{provider_name.lower()}-{uuid.uuid4().hex[:6]}",
                        mpn=ext["mpn"],
                        manufacturer=ext.get("manufacturer", "Unknown"),
                        distributor=PartNormalizer.normalize_distributor(
                            ext["distributor"]
                        ),
                        source_type=ext.get("source_type", "External"),
                        stock=stock,
                        price=price,
                        price_history=self._generate_price_history(price),
                        currency=ext.get("currency", "USD"),
                        delivery=ext.get("delivery", "3-5 Days"),
                        condition="New",
                        date_code="2023+",
                        is_eol=is_eol,
                        risk_level=(
                            "High"
                            if risk_score > 70
                            else ("Medium" if risk_score > 30 else "Low")
                        ),
                        risk_score=ext.get("risk_score", risk_score),
                        lifecycle=ext.get("lifecycle", "Active"),
                        is_alternative=ext.get("is_alternative", False),
                        relevance_score=ext.get("relevance_score", 0),
                        updated_at=datetime.now(),
                        datasheet=ext.get("datasheet", ""),
                        product_url=ext.get("product_url", ""),
                        description=ext.get("description", ""),
                        market_notes=ext.get(
                            "market_notes",
                            f"Stock availability score: {100-risk_score}/100",
                        ),
                        specs=specs,
                    )
                    standardized.append(part)
                except Exception as e:
                    print(
                        f"⚠️ [ENGINE] Individual item normalization error in {provider_name}: {e}"
                    )
            return standardized
        except Exception as e:
            print(f"❌ [ENGINE] Provider {provider_name} failed: {e}")
            return []

    async def aggregate_intel(self, q: str) -> List[StandardPart]:
        """
        Aggregates results from multiple channels in parallel with intelligent deduplication and caching.
        """
        # 1. Check Cache
        q_norm = q.strip().upper()
        if q_norm in self.search_cache:
            print(f"⚡ [ENGINE] Cache Hit for: {q_norm}")
            return self.search_cache[q_norm]

        # 2. Start parallel fetching with timeouts
        print(f"📡 [ENGINE] Triggering parallel scouting for: {q}...", flush=True)
        aggregator = SearchAggregator()

        # Parallel tasks with individual timeouts
        tasks = [
            asyncio.wait_for(
                self._fetch_from_provider("Market Aggregator", aggregator, q),
                timeout=10.0,
            ),
            asyncio.wait_for(self._fetch_from_local(q), timeout=5.0),
        ]

        # Gather results (ignore failures to keep the engine resilient)
        results_nested = await asyncio.gather(*tasks, return_exceptions=True)
        results = []
        for res in results_nested:
            if isinstance(res, list):
                results.extend(res)
            elif isinstance(res, Exception):
                print(f"⚠️ [ENGINE] Source timeout or failure: {res}")

        # 3. Parametric Match Fallback (if results are weak)
        is_weak = len(results) < 3 or all((p.risk_score or 0) > 70 for p in results)
        if is_weak:
            try:
                base_family = PartNormalizer.get_base_family(q)
                if base_family and base_family.upper() != q.upper():
                    print(
                        f"🧬 [ENGINE] Initial results weak. Triggering Parametric Match for: {base_family}"
                    )
                    alt_results = await self._fetch_from_provider(
                        "Parametric Engine", aggregator, base_family
                    )
                    for alt in alt_results:
                        if PartNormalizer.clean_mpn(
                            alt.mpn
                        ) != PartNormalizer.clean_mpn(q):
                            alt.is_alternative = True
                            alt.relevance_score = (
                                alt.relevance_score or 200
                            ) - 100  # Penalize fallback
                            results.append(alt)
            except Exception as e:
                print(f"⚠️ [ENGINE] Parametric fallback failed: {e}")

        # 4. Deduplication & Merging
        merged_parts = {}
        for part in results:
            norm_mpn = PartNormalizer.clean_mpn(part.mpn)
            key = f"{norm_mpn}@{part.distributor}"

            existing = merged_parts.get(key)
            if not existing:
                merged_parts[key] = part
            else:
                # Merge logic: take highest stock, lowest price
                if part.stock > existing.stock:
                    existing.stock = part.stock
                if part.price > 0 and (
                    existing.price == 0 or part.price < existing.price
                ):
                    existing.price = part.price
                if part.relevance_score > (existing.relevance_score or 0):
                    existing.relevance_score = part.relevance_score

        # 5. Expert Grading & Final Sort
        final_list = list(merged_parts.values())

        # Relevance -> Availability -> Price
        final_list.sort(
            key=lambda x: (
                -getattr(x, "relevance_score", 0),
                x.stock == 0,
                x.price if x.price > 0 else float("inf"),
            )
        )

        # 6. Store in Cache
        self.search_cache[q_norm] = final_list
        return final_list

    async def _fetch_from_local(self, q: str) -> List[StandardPart]:
        """Internal helper for local inventory fetch"""
        local_parts = []
        try:
            local_results = await inventory_service.search_inventory(q)
            for item in local_results:
                try:
                    part = StandardPart(
                        id=item.get("id", str(uuid.uuid4())[:12]),
                        mpn=item.get("mpn", q.upper()),
                        manufacturer=item.get("manufacturer", "Unknown"),
                        distributor=PartNormalizer.normalize_distributor(
                            item.get("distributor", "Internal")
                        ),
                        source_type="Member Inventory",
                        stock=item.get("stock", 0),
                        price=item.get("price", 0.0),
                        price_history=self._generate_price_history(
                            item.get("price", 0.0)
                        ),
                        currency=item.get("currency", "USD"),
                        delivery="Direct",
                        condition=item.get("condition", "New"),
                        date_code=item.get("date_code", "N/A"),
                        is_eol=item.get("is_eol", False),
                        risk_level=item.get("risk_level", "Low"),
                        risk_score=item.get("risk_score", 0),
                        market_notes=item.get("market_notes", ""),
                        updated_at=datetime.now(),
                        datasheet=item.get("datasheet", ""),
                        description=item.get("description", ""),
                        product_url=item.get("product_url", ""),
                    )
                    local_parts.append(part)
                except Exception:
                    continue
        except Exception as e:
            print(f"⚠️ Local Inventory Search Error: {e}")
        return local_parts


sourcing_engine = SourcingEngine()


@app.get("/api/parts/search", response_model=List[StandardPart])
async def search_parts(
    q: str = Query(..., min_length=1),
    category: Optional[str] = None,
    package: Optional[str] = None,
    min_voltage: Optional[float] = None,
    max_voltage: Optional[float] = None,
    rohs_compliant: Optional[bool] = None,
):
    try:
        cache_manager = get_cache_manager()
        cache_key = (
            f"{q}_{category}_{package}_{min_voltage}_{max_voltage}_{rohs_compliant}"
        )

        # 1. Cache 조회 (Skip for internal test queries or explicitly requested real-time)
        cached_results = await cache_manager.get_cached_results(cache_key)
        if cached_results:
            print(f"⚡ [API] Cache Hit for {q}")
            return [StandardPart(**item) for item in cached_results]

        print(f"📡 [API] Real-time Scouting for {q}...")
        # 2. 실시간 검색 실행
        results = await sourcing_engine.aggregate_intel(q)

        # ... (deduplication logic if needed, but aggregator should handle it)

        # 3. 데이터 필터링 (패키지)
        if package:
            results = [
                r for r in results if r.package and package.lower() in r.package.lower()
            ]

        # 4. 파라메트릭 필터링 (전압)
        if min_voltage is not None or max_voltage is not None:

            def extract_v(v_str: Optional[str]) -> Optional[float]:
                if not v_str:
                    return None
                try:
                    matches = re.findall(r"[-+]?\d*\.\d+|\d+", v_str)
                    return float(matches[0]) if matches else None
                except (ValueError, IndexError):
                    return None

            if min_voltage is not None:
                results = [
                    r
                    for r in results
                    if (v := extract_v(r.voltage)) is not None and v >= min_voltage
                ]
            if max_voltage is not None:
                results = [
                    r
                    for r in results
                    if (v := extract_v(r.voltage)) is not None and v <= max_voltage
                ]

        # 5. RoHS 준수 여부
        if rohs_compliant is not None:
            results = [
                r for r in results if r.rohs is not None and r.rohs == rohs_compliant
            ]

        # 6. 결과 캐싱
        results_dict = [item.model_dump(mode="json") for item in results]
        await cache_manager.set_cache(cache_key, results_dict)

        return results

    except Exception as e:
        import traceback

        print(f"❌ [API] Search error: {e}")
        print(traceback.format_exc())
        return []  # 에러 발생 시 빈 리스트 반환하여 프론트엔드 크래시 방지


@app.get("/api/parts/details")
async def get_part_details(url: str = Query(...)):
    """
    [LAZY LOADING] Fetches extended specs from a specific product URL.
    """
    try:
        from scraper import SearchAggregator

        aggregator = SearchAggregator()
        details = await aggregator.get_part_details(url)
        return details
    except Exception as e:
        print(f"❌ [API] Detail fetch error: {e}")
        return {}


@app.websocket("/ws/pulse")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# --- Procurement and Market Stats Endpoints ---


@app.get("/api/market/stats")
async def get_market_stats():
    """
    Returns market statistics based on global search aggregates
    """
    from datetime import datetime

    return {
        "market_temperature": 78,
        "global_stock_index": 1250000,
        "active_brokers": 145,
        "price_drift": "+2.4%",
        "last_sync": datetime.now().isoformat(),
    }


class ProcurementLockRequest(BaseModel):
    part_id: str
    quantity: int


@app.post("/procurement/lock")
async def create_procurement_lock(req: ProcurementLockRequest):
    """
    Locks a procurement attempt for a specific part.
    """
    import uuid

    return {
        "tracking_id": f"LOCK-{uuid.uuid4().hex[:8].upper()}",
        "status": "locked",
        "part_id": req.part_id,
        "quantity": req.quantity,
    }


analyze_cache = TTLCache(maxsize=100, ttl=900)


@app.get("/api/portfolio")
async def get_portfolio():
    """가상 계좌 잔고 및 보유 포지션 데이터 반환"""
    if not supabase:
        raise HTTPException(status_code=500, detail="DB connection not initialized")

    try:
        acc_task = asyncio.to_thread(
            supabase.table("paper_account").select("*").limit(1).execute
        )
        pos_task = asyncio.to_thread(
            supabase.table("paper_positions").select("*").execute
        )

        acc_res, pos_res = await asyncio.gather(acc_task, pos_task)

        acc = (
            acc_res.data[0]
            if acc_res.data
            else {"total_assets": INITIAL_CAPITAL, "cash_available": INITIAL_CAPITAL}
        )
        positions = pos_res.data

        invested_capital = await paper_engine.calculate_invested_capital(
            positions=positions
        )
        current_total = float(acc.get("cash_available") or 0) + invested_capital

        # 오늘 실현 손익: paper_history 당일 레코드 합산
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        history_res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("profit_amt")
            .gte("created_at", today_start.isoformat())
            .execute
        )
        daily_pnl = sum(
            float(r.get("profit_amt") or 0) for r in (history_res.data or [])
        )
        daily_pnl_pct = (
            (daily_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )

        return {
            "totalAssets": round(float(current_total), 2),
            "cashAvailable": round(float(acc["cash_available"]), 2),
            "investedCapital": round(float(invested_capital), 2),
            "dailyPnL": round(daily_pnl, 2),
            "dailyPnLPct": round(daily_pnl_pct, 2),
            "positions": [
                {
                    "ticker": p["ticker"],
                    "status": p["status"],
                    "weight": round(p["weight"], 4),
                    "entryPrice": p["entry_price"],
                    "currentPrice": p["current_price"],
                    "tsThreshold": p["ts_threshold"],
                    "pnlPct": round(
                        float(p["current_price"] / p["entry_price"] - 1) * 100, 2
                    ),
                }
                for p in positions
            ],
        }
    except Exception as e:
        print(f"❌ Portfolio Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- [NEW] Broker (Alpaca) Control Endpoints ---


@app.post("/api/analyze", response_model=TechnicalIndicators)
def analyze_stock(request: AnalyzeRequest):
    """지표 계산 API (기본 기능 - 인메모리 캐시)"""
    cache_key = f"{request.ticker}_{request.period}"
    if cache_key in analyze_cache:
        return analyze_cache[cache_key]

    try:
        ticker = yf.Ticker(request.ticker)
        df = ticker.history(period=request.period)
        if df is None or df.empty:

            raise HTTPException(status_code=404, detail=f"No data for {request.ticker}")

        close = df["Close"]
        rsi = (
            ta.momentum.RSIIndicator(close=close).rsi().iloc[-1]
            if len(close) >= 14
            else None
        )
        sma_20 = (
            ta.trend.SMAIndicator(close=close, window=20).sma_indicator().iloc[-1]
            if len(close) >= 20
            else None
        )
        sma_50 = (
            ta.trend.SMAIndicator(close=close, window=50).sma_indicator().iloc[-1]
            if len(close) >= 50
            else None
        )
        ema_12 = (
            ta.trend.EMAIndicator(close=close, window=12).ema_indicator().iloc[-1]
            if len(close) >= 12
            else None
        )
        ema_26 = (
            ta.trend.EMAIndicator(close=close, window=26).ema_indicator().iloc[-1]
            if len(close) >= 26
            else None
        )
        macd_ind = ta.trend.MACD(close=close)
        macd = macd_ind.macd().iloc[-1] if len(close) >= 26 else None
        macd_signal = macd_ind.macd_signal().iloc[-1] if len(close) >= 26 else None

        current_price = close.iloc[-1]

        # Simple signal logic
        signal = "HOLD"
        reasoning = []
        if rsi and rsi < 30:
            signal, reasoning.append("RSI 과매도")
        elif rsi and rsi > 70:
            signal, reasoning.append("RSI 과매수")

        result = TechnicalIndicators(
            ticker=request.ticker.upper(),
            period=request.period,
            current_price=round(float(current_price), 2),
            rsi_14=round(float(rsi), 2) if rsi else None,
            sma_20=round(float(sma_20), 2) if sma_20 else None,
            sma_50=round(float(sma_50), 2) if sma_50 else None,
            ema_12=round(float(ema_12), 2) if ema_12 else None,
            ema_26=round(float(ema_26), 2) if ema_26 else None,
            macd=round(float(macd), 4) if macd else None,
            macd_signal=round(float(macd_signal), 4) if macd_signal else None,
            signal=signal,
            reasoning=" ".join(reasoning) if reasoning else "지표 분석 완료",
        )
        analyze_cache[cache_key] = result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ValidateRequest(BaseModel):
    tickers: List[str]


@app.post("/api/validate_candidates")
async def validate_candidates(
    request: ValidateRequest, api_key: str = Security(get_api_key)
):
    """
    스크래퍼가 발굴한 후보군을 퀀트 지표(RSI, ADX, RVOL)로 정밀 검증
    """
    valid_tickers = []

    # 병렬 처리를 위해 asyncio.gather 고려 가능하나, yfinance 속도 제한 방지를 위해 순차 혹은 소규모 그룹 처리
    for ticker in request.tickers:
        try:
            # 최근 30일치 데이터 (RVOL 20MA + RSI 14일 확보용)
            df = yf.download(ticker, period="1mo", progress=False)
            if df.empty or len(df) < 20:
                continue

            # 1. RSI(2) 계산
            df["RSI2"] = ta.momentum.RSIIndicator(df["Close"], window=2).rsi()

            # 2. 이격도 (MA5) 계산
            df["MA5"] = df["Close"].rolling(window=5).mean()
            df["Deviation"] = (df["Close"] - df["MA5"]) / df["MA5"]

            # 3. RVOL (상대 거래량, 당일 제외 20일 median 기준)
            df["Vol_Avg"] = (
                df["Volume"].shift(1).rolling(window=20, min_periods=1).median()
            )
            df["RVOL"] = df["Volume"] / (df["Vol_Avg"] + 1e-9)

            latest = df.iloc[-1]

            # 퀀트 검증 필터 (Mean Reversion 최적화 수치)
            # 1. RSI2 < 10 (극심한 과매도)
            # 2. Deviation < -7% (이격도 낙폭과대)
            # 3. RVOL > 3.0 (투매 또는 바닥 수급 확인)
            cond1 = latest["RSI2"] < 10
            cond2 = latest["Deviation"] < -0.07
            cond3 = latest["RVOL"] > 3.0

            if cond1 and cond2 and cond3:
                valid_tickers.append(ticker.upper())
                print(
                    f"🎯 [VALIDATED] {ticker} 통과 (RSI2: {latest['RSI2']:.1f}, Dev: {latest['Deviation']:.2%})"
                )

        except Exception as e:
            print(f"⚠️ {ticker} 검증 중 오류: {e}")
            continue

    return valid_tickers


@app.get("/api/broker/account")
async def get_broker_account(api_key: str = Security(get_api_key)):
    """Alpaca 계좌 현황 조회 (Buying Power, PnL 등)"""
    if not trading_client:
        return {"error": "Trading client not initialized"}

    try:
        acc = await asyncio.to_thread(trading_client.get_account)

        # PnL 및 자산 정보 추출
        equity = float(acc.equity)
        last_equity = float(acc.last_equity)
        today_pnl = equity - last_equity
        today_pnl_pct = (today_pnl / last_equity * 100) if last_equity > 0 else 0

        # 하락폭 (Drawdown) 계산 (임시: 당일 기준)
        drawdown = 0.0
        if equity < last_equity:
            drawdown = round(((last_equity - equity) / last_equity) * 100, 2)

        return {
            "buying_power": float(acc.buying_power),
            "equity": equity,
            "today_pnl": round(today_pnl, 2),
            "today_pnl_pct": round(today_pnl_pct, 2),
            "current_drawdown": drawdown,
            "currency": acc.currency,
            "status": acc.status,
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/broker/liquidate-all")
async def liquidate_all_positions(
    req: PanicSellRequest, api_key: str = Security(get_api_key)
):
    """🚨 Master Kill Switch: Cancels all orders and liquidates all positions"""
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")

    try:
        if not trading_client:
            raise HTTPException(
                status_code=500, detail="Trading client not initialized"
            )

        # 1. Cancel all open orders
        await asyncio.to_thread(trading_client.cancel_orders)

        # 2. Liquidate all positions
        liquidate_result = await asyncio.to_thread(
            trading_client.close_all_positions, cancel_orders=True
        )

        await webhook.send_alert(
            title="🚨 [DEFCON 1] PANIC LIQUIDATE TRIGGERED",
            description="사령관의 명령으로 모든 미체결 주문이 취소되고 포지션 청산이 시작되었습니다.",
            color=0xFF0000,
        )

        return {
            "status": "success",
            "message": "All orders cancelled and positions liquidation initiated.",
            "details": str(liquidate_result),
        }

    except Exception as e:
        print(f"❌ Panic Sell Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/broker/status")
async def get_broker_status(api_key: str = Security(get_api_key)):
    """Returns Alpaca connection status and current system ARM state"""
    if not trading_client:
        return {
            "status": "DISCONNECTED",
            "is_armed": SYSTEM_ARMED,
            "error": "Trading client not initialized",
        }

    try:
        acc = await asyncio.to_thread(trading_client.get_account)
        return {
            "status": "ALIVE",
            "is_armed": SYSTEM_ARMED,
            "account_status": acc.status,
            "buying_power": float(acc.buying_power),
            "equity": float(acc.equity),
            "currency": acc.currency,
        }
    except Exception as e:
        return {"status": "ERROR", "is_armed": SYSTEM_ARMED, "error": str(e)}


@app.get("/api/broker/paper/account")
async def get_paper_account(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 계좌 정보 조회"""
    if not paper_engine:
        return {"error": "Paper engine not initialized"}
    try:
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        acc, invested_capital, history_res = await asyncio.gather(
            paper_engine.get_account(),
            paper_engine.calculate_invested_capital(),
            asyncio.to_thread(
                supabase.table("paper_history")
                .select("profit_amt")
                .gte("created_at", today_start.isoformat())
                .execute
            ),
        )
        if not acc:
            return {"error": "Account not found"}

        cash_available = float(acc.get("cash_available") or INITIAL_CAPITAL)
        total_assets = cash_available + invested_capital

        total_pnl = total_assets - INITIAL_CAPITAL
        total_pnl_pct = (
            (total_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )
        current_drawdown = round(min(total_pnl_pct, 0), 2)

        today_pnl = sum(
            float(r.get("profit_amt") or 0) for r in (history_res.data or [])
        )
        today_pnl_pct = (
            (today_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )

        return {
            "cash_available": round(cash_available, 2),
            "total_assets": round(total_assets, 2),
            "invested_capital": round(invested_capital, 2),
            "today_pnl": round(today_pnl, 2),
            "today_pnl_pct": round(today_pnl_pct, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "current_drawdown": current_drawdown,
            "currency": "USD",
            "status": "ACTIVE",
            "is_paper_trading": True,
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/broker/paper/positions")
async def get_paper_positions(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 현재 포지션 조회"""
    if not paper_engine:
        return []
    try:
        res = await asyncio.to_thread(
            supabase.table("paper_positions").select("*").execute
        )
        return res.data
    except Exception:
        return []


@app.get("/api/broker/paper/history")
async def get_paper_history(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 매매 이력 조회"""
    if not paper_engine:
        return []
    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("*")
            .order("created_at", desc=True)
            .limit(30)
            .execute
        )
        # 익숙한 구조로 변환
        history = []
        for item in res.data:
            pnl_pct = item.get("pnl_pct", 0)
            history.append(
                {
                    "id": str(item.get("id")),
                    "ticker": item.get("ticker"),
                    "side": "sell",
                    "type": item.get("exit_reason") or "trailing_stop",
                    "quantity": "--",
                    "filled_qty": "--",
                    "filled_avg_price": item.get("exit_price"),
                    "pnl_pct": round(float(pnl_pct or 0), 2),
                    "profit_amt": round(float(item.get("profit_amt") or 0), 2),
                    "status": "filled",
                    "created_at": item.get("closed_at") or item.get("created_at"),
                }
            )
        return history
    except Exception:
        return []


@app.post("/api/broker/paper/sell")
async def manual_paper_sell(
    req: PaperSellRequest, api_key: str = Security(get_api_key)
):
    """사령관 수동 페이퍼 트레이딩 포지션 청산"""
    if not paper_engine:
        raise HTTPException(status_code=503, detail="Paper engine not initialized")

    ticker = req.ticker.upper()

    pos = await paper_engine.get_position(ticker)
    if not pos:
        raise HTTPException(status_code=404, detail=f"No open position for {ticker}")

    entry_price = float(pos["entry_price"])
    units = float(pos["units"])

    # 현재가: yfinance 우선, fallback → stored current_price
    current_price = float(pos.get("current_price") or entry_price)
    try:
        tick = yf.Ticker(ticker)
        hist = tick.history(period="1d", interval="1m")
        if not hist.empty:
            current_price = float(hist["Close"].iloc[-1])
    except Exception:
        pass

    pnl_pct = (current_price / entry_price - 1) * 100
    profit_amt = (current_price - entry_price) * units
    proceeds = current_price * units

    acc = await paper_engine.get_account()
    if acc:
        new_cash = float(acc["cash_available"]) + proceeds
        await asyncio.to_thread(
            supabase.table("paper_account")
            .update({"cash_available": new_cash})
            .eq("id", acc["id"])
            .execute
        )

    history_data = {
        "ticker": ticker,
        "entry_price": entry_price,
        "exit_price": current_price,
        "pnl_pct": round(pnl_pct, 2),
        "profit_amt": round(profit_amt, 2),
        "exit_reason": "Manual Sell",
    }
    await asyncio.to_thread(
        supabase.table("paper_history").insert(history_data).execute
    )

    await asyncio.to_thread(
        supabase.table("paper_positions").delete().eq("ticker", ticker).execute
    )

    # BUG-4 fix: sync watchlist status to EXITED on manual sell
    await paper_engine._sync_watchlist_exit(ticker)

    status_emoji = "✅" if pnl_pct > 0 else "🛑"
    await paper_engine.webhook.send_alert(
        title=f"{status_emoji} [PAPER MANUAL EXIT] {ticker}",
        description=f"수동 청산가: ${current_price:.2f} | 수익률: {pnl_pct:.2f}%\n사유: 사령관 수동 매도",
        color=0x2ECC71 if pnl_pct > 0 else 0xE74C3C,
    )

    return {
        "status": "success",
        "ticker": ticker,
        "exit_price": round(current_price, 2),
        "pnl_pct": round(pnl_pct, 2),
        "profit_amt": round(profit_amt, 2),
    }


@app.post("/api/broker/arm")
async def toggle_arm_system(req: ArmRequest, api_key: str = Security(get_api_key)):
    """Toggles the global SYSTEM_ARMED state and persists to DB."""
    global SYSTEM_ARMED
    SYSTEM_ARMED = req.arm

    # Supabase에 영속 저장 — 서버 재시작 후에도 상태 복원 가능
    if supabase:
        try:
            await asyncio.to_thread(
                supabase.table("system_settings")
                .update({"is_armed": SYSTEM_ARMED})
                .eq("id", 1)
                .execute
            )
        except Exception as e:
            print(f"⚠️ [ARM] DB persist failed: {e}")

    status_text = "ARMED (Combat Mode)" if SYSTEM_ARMED else "DISARMED (Safe Mode)"
    print(f"📡 [SYSTEM] {status_text} by administrator.")

    await webhook.send_alert(
        title=f"📡 SYSTEM {status_text}",
        description=f"사령관이 시스템을 {'무장' if SYSTEM_ARMED else '해제'}했습니다. {'자동 매수/매도가 활성화됩니다.' if SYSTEM_ARMED else '자동 매매가 중지됩니다.'}",
        color=0xFF00FF if SYSTEM_ARMED else 0x5D3FD3,
    )

    return {
        "status": "success",
        "is_armed": SYSTEM_ARMED,
        "message": f"System {status_text}",
    }


@app.post("/api/broker/order")
async def execute_manual_order(req: OrderRequest, api_key: str = Security(get_api_key)):
    """Executes a manual market or limit order via Alpaca"""
    print(f"📥 [Manual Order] {req.side} {req.quantity} {req.ticker}")
    if not trading_client:
        raise HTTPException(status_code=503, detail="Trading client not initialized")

    try:
        side = OrderSide.BUY if req.side.lower() == "buy" else OrderSide.SELL
        symbol = req.ticker.upper()

        if req.type.lower() == "market":
            order_data = MarketOrderRequest(
                symbol=symbol,
                qty=req.quantity,
                side=side,
                time_in_force=TimeInForce.GTC,
            )
        else:
            if not req.price:
                raise HTTPException(
                    status_code=400, detail="Limit price is required for limit orders"
                )
            order_data = LimitOrderRequest(
                symbol=symbol,
                qty=req.quantity,
                side=side,
                limit_price=req.price,
                time_in_force=TimeInForce.GTC,
            )

        print(
            f"⚖️ [Manual Order] Submitting to Alpaca: {symbol} x {req.quantity} {req.side}"
        )
        order = await asyncio.to_thread(trading_client.submit_order, order_data)

        # --- [NEW] Supabase Sync Logic ---
        if supabase:
            try:
                # 1. 현재가 및 ATR 획득 (포지션 기록용)
                ticker_yf = yf.Ticker(symbol)
                df_yf = await asyncio.to_thread(ticker_yf.history, period="5d")
                current_price = req.price if req.price else df_yf["Close"].iloc[-1]

                # ATR 계산 (기본값 5%)
                atr = current_price * 0.05
                if len(df_yf) >= 5:
                    import ta

                    high = df_yf["High"]
                    low = df_yf["Low"]
                    close = df_yf["Close"]
                    atr_series = ta.volatility.AverageTrueRange(
                        high, low, close, window=5
                    ).atr()
                    if not pd.isna(atr_series.iloc[-1]):
                        atr = float(atr_series.iloc[-1])

                # 2. BUY (Entry or Add)
                if side == OrderSide.BUY:
                    # 기존 포지션 확인
                    existing_pos = await asyncio.to_thread(
                        supabase.table("active_positions")
                        .select("*")
                        .eq("ticker", symbol)
                        .execute
                    )

                    if existing_pos.data:
                        # 평단가 및 수량 업데이트 (단순 합산)
                        old = existing_pos.data[0]
                        new_amount = float(old["amount"]) + req.quantity
                        new_entry_price = (
                            float(old["entry_price"]) * float(old["amount"])
                            + current_price * req.quantity
                        ) / new_amount

                        await asyncio.to_thread(
                            supabase.table("active_positions")
                            .update(
                                {
                                    "amount": new_amount,
                                    "entry_price": new_entry_price,
                                    "highest_high": max(
                                        float(old["highest_high"]), current_price
                                    ),
                                    "updated_at": datetime.now().isoformat(),
                                }
                            )
                            .eq("ticker", symbol)
                            .execute
                        )
                    else:
                        # 신규 포지션 생성
                        new_pos = {
                            "ticker": symbol,
                            "entry_price": current_price,
                            "entry_date": datetime.now().date().isoformat(),
                            "initial_atr": atr,
                            "highest_high": current_price,
                            "days_held": 0,
                            "amount": req.quantity,
                        }
                        await asyncio.to_thread(
                            supabase.table("active_positions").insert(new_pos).execute
                        )

                # 3. SELL (Exit or Reduce)
                elif side == OrderSide.SELL:
                    existing_pos = await asyncio.to_thread(
                        supabase.table("active_positions")
                        .select("*")
                        .eq("ticker", symbol)
                        .execute
                    )

                    if existing_pos.data:
                        old = existing_pos.data[0]
                        old_amount = float(old["amount"])

                        if req.quantity >= old_amount:
                            # 전체 청산
                            await asyncio.to_thread(
                                supabase.table("active_positions")
                                .delete()
                                .eq("ticker", symbol)
                                .execute
                            )
                            # Trade History 기록
                            pnl = (
                                current_price - float(old["entry_price"])
                            ) * old_amount
                            pnl_pct = (
                                current_price / float(old["entry_price"]) - 1
                            ) * 100

                            history_data = {
                                "ticker": symbol,
                                "entry_date": old["entry_date"],
                                "exit_date": datetime.now().date().isoformat(),
                                "entry_price": old["entry_price"],
                                "exit_price": current_price,
                                "pnl": pnl,
                                "pnl_percent": pnl_pct,
                                "exit_reason": "MANUAL_SELL",
                            }
                            await asyncio.to_thread(
                                supabase.table("trade_history")
                                .insert(history_data)
                                .execute
                            )
                        else:
                            # 부분 매도 (수량만 차감)
                            await asyncio.to_thread(
                                supabase.table("active_positions")
                                .update(
                                    {
                                        "amount": old_amount - req.quantity,
                                        "updated_at": datetime.now().isoformat(),
                                    }
                                )
                                .eq("ticker", symbol)
                                .execute
                            )

                print(f"✅ [Sync] Manual trade for {symbol} synced to Supabase.")
            except Exception as sync_e:
                print(f"⚠️ [Sync Error] Failed to sync manual trade: {sync_e}")

        # Webhook 알림
        color = 0x2ECC71 if side == OrderSide.BUY else 0xE74C3C
        await webhook.send_alert(
            title=f"🎯 [MANUAL ORDER] {symbol} {req.side.upper()}",
            description=f"수량: {req.quantity}주 | 유형: {req.type.upper()}\n상태: {order.status}",
            color=color,
        )

        return {
            "status": "success",
            "order_id": str(order.id),
            "client_order_id": order.client_order_id,
            "message": f"Manual {req.side} order for {symbol} submitted and synced.",
        }
    except Exception as e:
        error_msg = str(e)
        print(f"❌ [Manual Order] Execution failed: {error_msg}")
        return {"status": "error", "error": error_msg}


@app.post("/api/broker/close-position")
async def close_specific_position(
    req: ClosePositionRequest, api_key: str = Security(get_api_key)
):
    """Closes a specific position by ticker"""
    if not trading_client:
        raise HTTPException(status_code=500, detail="Trading client not initialized")

    try:
        symbol = req.ticker.upper()
        # Alpaca close_position_by_symbol requires symbol or asset_id
        result = await asyncio.to_thread(
            trading_client.close_position_by_symbol, symbol
        )

        await webhook.send_alert(
            title=f"🛑 [MANUAL CLOSE] {symbol}",
            description=f"{symbol} 포지션에 대한 수동 청산 명령이 실행되었습니다.",
            color=0xE06666,
        )

        return {
            "status": "success",
            "symbol": symbol,
            "message": f"Position for {symbol} has been closed.",
        }
    except Exception as e:
        print(f"❌ Close Position Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/broker/positions")
async def get_broker_positions(api_key: str = Security(get_api_key)):
    """Alpaca 보유 포지션 조회"""
    if not trading_client:
        return []
    try:
        positions = await asyncio.to_thread(trading_client.get_all_positions)
        return [
            {
                "id": p.asset_id,
                "ticker": p.symbol,
                "entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price),
                "quantity": float(p.qty),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "unrealized_plpc": float(p.unrealized_plpc) * 100,
                "change_percent": float(p.change_today) * 100,
            }
            for p in positions
        ]
    except Exception as e:
        print(f"❌ Broker Positions Error: {e}")
        return {"error": str(e)}


@app.get("/api/broker/orders")
async def get_broker_orders(limit: int = 50, api_key: str = Security(get_api_key)):
    """Alpaca 최근 주문 내역 조회"""
    if not trading_client:
        return []
    try:
        # 최근 주문 가져오기 (체결된 것뿐만 아니라 모든 상태)
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus

        req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=limit, nested=True)
        orders = await asyncio.to_thread(trading_client.get_orders, filter=req)
        return [
            {
                "id": str(o.id),
                "ticker": o.symbol,
                "side": o.side.value,
                "type": o.type.value,
                "quantity": float(o.qty) if o.qty else 0,
                "filled_qty": float(o.filled_qty) if o.filled_qty else 0,
                "filled_avg_price": (
                    float(o.filled_avg_price) if o.filled_avg_price else 0
                ),
                "status": o.status.value,
                "created_at": o.created_at.isoformat(),
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ]
    except Exception as e:
        print(f"❌ Broker Orders Error: {e}")
        return {"error": str(e)}


# Backtesting endpoint


class BacktestRequest(BaseModel):
    ticker: str
    period: str = "1y"
    initial_capital: float = 10000.0


backtest_cache = TTLCache(maxsize=100, ttl=900)
stats_cache: TTLCache = TTLCache(maxsize=1, ttl=300)  # 5분 캐시 (폴링 비용 절감)

# 손실 없이 수익만 있을 때 profit_factor 상한 (무한대 회피)
_MAX_PROFIT_FACTOR = 99.0


def _base_stats(is_simulated: bool, message: str, badge: str) -> dict:
    return {
        "win_rate": 0,
        "profit_factor": 0,
        "mdd": 0,
        "recovery_days": 0,
        "avg_pnl": 0,
        "total_trades": 0,
        "is_simulated": is_simulated,
        "message": message,
        "badge": badge,
    }


@app.get("/api/strategy/stats")
async def get_strategy_stats():
    """paper_history 기반 실거래 통계 반환 (5분 TTL 캐시 적용)."""
    if not supabase:
        return _base_stats(True, "DB 미연결 — 통계 없음", "⚠️ DB 미연결")

    if "stats" in stats_cache:
        return stats_cache["stats"]

    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("pnl_pct,profit_amt")
            .order("created_at", desc=False)
            .execute
        )
        trades = res.data or []

        if not trades:
            return _base_stats(
                False,
                "거래 내역 없음 — 첫 매매 후 통계가 집계됩니다",
                "📊 거래 대기 중",
            )

        # 단일 패스로 모든 누적값 계산
        total_trades = len(trades)
        win_count = 0
        gross_profit = 0.0
        gross_loss = 0.0
        pnl_sum = 0.0
        pnl_arr = np.empty(total_trades, dtype=np.float64)

        for i, t in enumerate(trades):
            pnl = float(t.get("pnl_pct") or 0)
            amt = float(t.get("profit_amt") or 0)
            pnl_arr[i] = pnl
            pnl_sum += pnl
            if pnl > 0:
                win_count += 1
            if amt > 0:
                gross_profit += amt
            elif amt < 0:
                gross_loss -= amt  # gross_loss는 양수로 누적

        win_rate = round(win_count / total_trades * 100, 1)
        avg_pnl = round(pnl_sum / total_trades, 2)
        profit_factor = (
            round(gross_profit / gross_loss, 2)
            if gross_loss > 0
            else (_MAX_PROFIT_FACTOR if gross_profit > 0 else 0.0)
        )

        # MDD: numpy 벡터화 (cumsum + running maximum)
        cumulative = np.cumsum(pnl_arr)
        running_max = np.maximum.accumulate(cumulative)
        mdd = round(float(np.min(cumulative - running_max)), 2)

        if win_rate >= 55 and profit_factor >= 1.3:
            badge = f"🛡️ System Edge: 승률 {win_rate}% (실거래 검증)"
        elif total_trades < 5:
            badge = f"📊 데이터 축적 중 ({total_trades}건)"
        else:
            badge = f"📉 전략 점검 필요 (승률 {win_rate}%)"

        result = {
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "mdd": mdd,
            "recovery_days": 0,
            "avg_pnl": avg_pnl,
            "total_trades": total_trades,
            "is_simulated": False,
            "message": f"실거래 {total_trades}건 기준 통계",
            "badge": badge,
        }
        stats_cache["stats"] = result
        return result

    except Exception as e:
        print(f"❌ [strategy/stats] {e}")
        return _base_stats(True, f"통계 계산 오류: {e}", "⚠️ 오류")


@app.get("/api/discoveries")
async def get_discoveries(limit: int = 10, sort_by: str = "updated_at"):
    """오늘의 추천 종목(Alpha Discovery Picks) 목록 반환"""
    try:
        results = await asyncio.to_thread(db.get_latest_discoveries, limit, sort_by)
        return results
    except Exception as e:
        print(f"❌ Discovery Fetch Error: {e}")
        return []


def calculate_advanced_signals(df: pd.DataFrame, avg_daily_volume: float = 0.0):
    """
    RSI와 MACD를 결합한 고도화된 신호 엔진.
    avg_daily_volume: 30일 일봉 평균 거래량 (주입 시 분봉 RVOL 정확도 향상)
    """
    # 1. RSI 계산 (14일)
    df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

    # 2. MACD 계산 (12, 26, 9)
    macd_indicator = ta.trend.MACD(
        df["Close"], window_slow=26, window_fast=12, window_sign=9
    )
    df["MACD_Line"] = macd_indicator.macd()
    df["MACD_Signal"] = macd_indicator.macd_signal()
    df["MACD_Diff"] = macd_indicator.macd_diff()  # Histogram

    # 3. ADX 계산 (추세 강도 확인)
    # ADX > 20이면 추세가 형성된 것으로 간주 (Micro-Cap 하이브리드 기준)
    adx_indicator = ta.trend.ADXIndicator(
        high=df["High"], low=df["Low"], close=df["Close"], window=14
    )
    df["ADX"] = adx_indicator.adx()

    # 4. RVOL (Relative Volume) 계산
    # avg_daily_volume 주입 시: 분봉 거래량 / (30일 일평균 / 390분) → 역사적 기준 대비 비율
    # 미주입 시: RVOL=1.0 중립 고정
    #   → 이전 30분 rolling median fallback은 급등 구간에서 기준선 자체가 올라가
    #      RVOL이 과소 측정되어 DNA 보너스가 누락되는 왜곡이 있었음 (Bug-3 수정)
    if avg_daily_volume > 0:
        avg_min_volume = avg_daily_volume / 390  # 하루 390 거래 분
        df["RVOL"] = df["Volume"] / (avg_min_volume + 1e-9)
    else:
        df["RVOL"] = 1.0  # warm-up 미완료 시 중립값 → DNA RVOL 보너스 미적용

    # 5. 추격 매수(FOMO) 방지 필터 (25% 및 20분 이평선 이격도)
    # 분봉 df의 경우 df["Open"]은 그 분의 시가이므로, 당일 첫 바의 Open으로 교정.
    # tz-aware 인덱스(Alpaca UTC)를 ET로 변환 후 날짜별 그룹핑.
    if df.index.tz is not None:
        _dates = df.index.tz_convert("America/New_York").date
    else:
        _dates = df.index.date
    day_open = df.groupby(_dates)["Open"].transform("first")

    ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
    df["Is_Extended"] = (
        (df["Close"] > day_open * 1.25)
        | (df["Close"] > df["Close"].shift(1) * 1.25)
        | (df["Close"] > ma20 * 1.30)
    )

    # 6. DNA Score 벡터 연산 및 Strong_Buy / Strong_Sell 통합
    score = pd.Series(50.0, index=df.index)

    # RSI scoring (RVOL 돌파 시 패널티 면제 포함)
    score += np.where(
        df["RSI"] < 30,
        20,
        np.where(
            df["RSI"] < 45,
            15,
            np.where(
                df["RSI"] < 55,
                0,
                np.where(
                    df["RSI"] < 65,
                    np.where(df["RVOL"] >= 3.0, 0, -10),
                    np.where(df["RVOL"] >= 3.0, 0, -20),
                ),
            ),
        ),
    )

    # MACD scoring (기울기 판정)
    macd_diff = df["MACD_Diff"]
    macd_diff_prev = df["MACD_Diff"].shift(1).fillna(0.0)
    is_golden = (macd_diff > 0) & (macd_diff_prev <= 0)
    is_dead = (macd_diff < 0) & (macd_diff_prev >= 0)
    score += np.where(
        is_golden,
        20,
        np.where(is_dead, -20, np.where(macd_diff > macd_diff_prev, 8, -8)),
    )

    # ADX scoring
    score += np.where(df["ADX"] > 25, 10, np.where(df["ADX"] > 20, 5, 0))

    # RVOL scoring
    score += np.where(
        df["RVOL"] > 5.0,
        15,
        np.where(
            df["RVOL"] > 3.0,
            10,
            np.where(df["RVOL"] > 2.0, 5, np.where(df["RVOL"] < 1.0, -5, 0)),
        ),
    )

    # Extended scoring
    score -= np.where(df["Is_Extended"], 25, 0)

    df["DNA_Score"] = score.clip(0.0, 100.0).round(1)

    # DNA Score 기반으로 시그널 단일 통제
    df["Strong_Buy"] = df["DNA_Score"] >= 85.0
    df["Strong_Sell"] = df["DNA_Score"] <= 40.0

    return df


def calculate_position_sizing(
    df: pd.DataFrame,
    win_rate: float = 0.55,
    profit_ratio: float = 2.0,
    target_vol: float = 0.15,
    kelly_fraction: float = 0.5,
):
    """
    1단계(변동성 조절)와 3단계(켈리 공식)를 결합한 포지션 사이징 엔진
    """
    # --- [Step 1] 변동성 조절 (Volatility Targeting) ---
    # 일간 로그 수익률 계산
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))

    # 최근 20일 표준편차 계산 및 연율화
    daily_vol = df["log_return"].rolling(window=20).std().iloc[-1]
    ann_vol = daily_vol * np.sqrt(252)

    # 변동성 기반 비중 (시장이 과열되면 비중 축소)
    vol_weight = target_vol / (ann_vol + 1e-9)

    # --- [Step 2 & 3] 켈리 공식 (Kelly Criterion) ---
    p = win_rate
    q = 1 - p
    b = profit_ratio

    kelly_f = (b * p - q) / b if b > 0 else 0

    # 보수적 운용을 위해 kelly_fraction 적용
    optimal_kelly = max(0, kelly_f) * kelly_fraction

    # --- [Step 4] 최종 결합 및 제한 ---
    # vol_weight * kelly 곱셈은 변동성 높은 마이크로캡에서 2~5%로 수렴해 MIN_BUY_BUDGET 미달.
    # min(vol_weight, kelly) 방식으로 더 보수적인 값을 택해 실제 사용 가능한 비중 확보.
    final_weight = min(vol_weight, optimal_kelly)
    final_weight = min(final_weight, 1.0)

    # RVOL 정보 추가 (포지션 사이징 참고용)
    rvol = df["RVOL"].iloc[-1] if "RVOL" in df.columns else 1.0

    return {
        "annualized_volatility": round(float(ann_vol), 4),
        "vol_weight": round(float(vol_weight), 4),
        "kelly_f": round(float(kelly_f), 4),
        "recommended_weight": round(float(final_weight) * 100, 2),
        "rvol": round(float(rvol), 2),
        "is_safe_to_trade": final_weight > 0,
    }


def calculate_dna_score(
    rsi: float,
    macd_diff: float,
    macd_diff_prev: float,
    adx: float,
    rvol: float,
    is_extended: bool,
) -> float:
    """
    RSI·MACD·ADX·RVOL을 합성한 0~100 DNA 점수.
    ≥80 → BUY 게이트 통과 / ≥85 → STRONG BUY 알림 기준
    """
    score = 50.0

    # RSI (±20): 과매도 = 강세, 과매수 = 약세
    # 돌파 매매 고려: RVOL >= 3.0일 때는 과매수 패널티 면제(0점) 적용
    if rsi < 30:
        score += 20
    elif rsi < 45:
        score += 15
    elif rsi < 55:
        score += 0
    elif rsi < 65:
        score -= 0 if rvol >= 3.0 else 10
    else:
        score -= 0 if rvol >= 3.0 else 20

    # MACD (±20): 골든/데드크로스 최우선, 방향성 차순 (기울기 판정)
    # CLAUDE.md 명세: "직전 봉은 MACD ≤ Signal" → prev <= 0 (등호 포함)
    is_golden = macd_diff > 0 and macd_diff_prev <= 0
    is_dead = macd_diff < 0 and macd_diff_prev >= 0
    if is_golden:
        score += 20
    elif is_dead:
        score -= 20
    elif macd_diff > macd_diff_prev:  # 기울기(상승 모멘텀)
        score += 8
    else:  # 기울기(하락 모멘텀)
        score -= 8

    # ADX (+10): 추세 강도
    if adx > 25:
        score += 10
    elif adx > 20:
        score += 5

    # RVOL (+15 / -5): 거래량 폭증 가산, 침체 감산
    if rvol > 5.0:
        score += 15
    elif rvol > 3.0:
        score += 10
    elif rvol > 2.0:
        score += 5
    elif rvol < 1.0:
        score -= 5

    # 급등 추격 페널티 (-25)
    if is_extended:
        score -= 25

    return round(max(0.0, min(100.0, score)), 1)


def generate_ai_investment_report(data: dict):
    """
    규칙 기반(Deterministic) 동적 리포트 생성 엔진. (OpenAI API 완전 분리)
    """
    rsi = data.get("rsi", 50.0)
    signal = data.get("signal", "HOLD")
    vol = data.get("volatility_ann", 0.0)
    rec_weight = data.get("recommended_weight", 0.0)
    rvol = data.get("rvol", 1.0)
    adx = data.get("adx", 0.0)

    report = []

    # 1. 시그널 요약 및 RVOL 검증
    if signal == "BUY":
        rvol_note = " (보통)" if rvol < 3.0 else f" (🔥 거래량 폭증: {rvol}x)"
        report.append(
            f"📈 [Micro-Cap 하이브리드 BUY] RSI {rsi} & MACD 골든크로스 확인."
        )
        report.append(f"   - 추세 강도(ADX): {adx} (안정)")
        report.append(f"   - 상대 거래량(RVOL): {rvol}{rvol_note}")
        if data.get("is_extended"):
            report.append("   - ⚠️ 주의: 당일 급등으로 인한 추격 매수 위험 관찰됨.")
    elif signal == "SELL":
        report.append(f"📉 [매도/위험] RSI {rsi} 과열 및 모멘텀 이탈.")
    else:
        report.append(f"⚖️ [관망] 뚜렷한 추세 신호 없음 (ADX: {adx}, RVOL: {rvol}).")

    # 2. 리스크 관리 조언
    report.append(
        f"최종 변동성은 {vol}%이며, 비대칭 트레일링 스탑(Asymmetric Stop)을 적용한 권장 비중은 {rec_weight}%입니다."
    )

    # 3. 추가 조언 및 면책 조항
    report.append("※ 본 데이터는 Micro-Cap 전용 하이브리드 엔진 분석 결과입니다.")

    return "\n".join(report)


def run_pulse_engine(ticker: str, df_raw: pd.DataFrame):
    """
    의사결정 최적화 엔진: 지표 + 포지션 사이징 + AI 결합
    """
    # 1. 기술적 분석 (30일 daily avg volume 주입으로 RVOL 정확도 확보)
    avg_daily_vol = candle_state.avg_daily_volume.get(ticker.upper(), 0.0)
    df = calculate_advanced_signals(df_raw, avg_daily_volume=avg_daily_vol)
    latest = df.iloc[-1]

    # 2. 포지션 사이징 (변동성 조절 + 켈리)
    sizing = calculate_position_sizing(df_raw)

    signal_type = "HOLD"
    if latest["Strong_Buy"]:
        signal_type = "BUY"
    elif latest["Strong_Sell"]:
        signal_type = "SELL"

    strength = "STRONG" if latest["Strong_Buy"] or latest["Strong_Sell"] else "NORMAL"

    payload = {
        "ticker": ticker.upper(),
        "rsi": round(float(latest["RSI"]), 2) if not pd.isna(latest["RSI"]) else None,
        "macd_line": (
            round(float(latest["MACD_Line"]), 4)
            if not pd.isna(latest["MACD_Line"])
            else None
        ),
        "macd_signal": (
            round(float(latest["MACD_Signal"]), 4)
            if not pd.isna(latest["MACD_Signal"])
            else None
        ),
        "macd_diff": (
            round(float(latest["MACD_Diff"]), 4)
            if not pd.isna(latest["MACD_Diff"])
            else None
        ),
        "adx": round(float(latest["ADX"]), 2) if "ADX" in latest else 0.0,
        "rvol": round(float(latest["RVOL"]), 2) if "RVOL" in latest else 1.0,
        "is_extended": (
            bool(latest["Is_Extended"]) if "Is_Extended" in latest else False
        ),
        "volatility_ann": round(float(sizing["annualized_volatility"]) * 100, 2),
        "vol_weight": sizing["vol_weight"],
        "kelly_f": sizing["kelly_f"],
        "recommended_weight": sizing["recommended_weight"],
        "price": round(float(latest["Close"]), 2),
        "indicator": "Micro-Cap Hybrid Pulse",
        "value": round(float(latest["Close"]), 2),
        "signal": signal_type,
        "strength": strength,
        "timestamp": datetime.now().isoformat(),
    }

    # 3. AI 리포트 생성 (STRONG 신호일 때만 생성하여 비용/속도 최적화)
    # DNA Score 실계산 (RSI·MACD·ADX·RVOL 합성, 0~100)
    macd_diff_cur = (
        float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
    )
    macd_diff_prev = (
        float(df["MACD_Diff"].iloc[-2])
        if len(df) >= 2 and not pd.isna(df["MACD_Diff"].iloc[-2])
        else 0.0
    )
    dna_score = calculate_dna_score(
        rsi=float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0,
        macd_diff=macd_diff_cur,
        macd_diff_prev=macd_diff_prev,
        adx=(
            float(latest["ADX"])
            if "ADX" in latest and not pd.isna(latest["ADX"])
            else 0.0
        ),
        rvol=(
            float(latest["RVOL"])
            if "RVOL" in latest and not pd.isna(latest["RVOL"])
            else 1.0
        ),
        is_extended=bool(latest["Is_Extended"]) if "Is_Extended" in latest else False,
    )

    if strength == "STRONG":
        payload["ai_report"] = generate_ai_investment_report(payload)
        payload["ai_metadata"] = {
            "dna_score": dna_score,
            "bull_case": (
                "수학적 지표상 반등 모멘텀 임계치 도달"
                if signal_type == "BUY"
                else "현재 구간 하방 방어선 구축 중"
            ),
            "bear_case": (
                "매물 출회 가능성 및 시장 변동성 리스크"
                if signal_type == "SELL"
                else "상단 저항선 돌파 에너지 필요"
            ),
            "reasoning_ko": payload["ai_report"],
            "tags": [ticker.upper(), signal_type, strength],
        }
    else:
        payload["ai_report"] = (
            "시장 신호 강도가 보통(NORMAL)이며, 정밀 AI 분석 조건에 도달하지 않았습니다."
        )
        payload["ai_metadata"] = {"dna_score": dna_score}

    # DNA Score 최상위 노출 (ai_metadata 중첩 없이 바로 접근 가능)
    payload["dna_score"] = dna_score

    # [Opt-3] 데이터 출처 명시적 태깅
    payload["data_source"] = "alpaca_iex"
    payload["volume_multiplier"] = candle_state.volume_multiplier.get(
        ticker.upper(), 1.0
    )

    return payload


# ── Penny Lab: $1 이하 페니 주식 전용 퀀트 파라미터 ──────────────────────────
PENNY_MAX_PRICE = 1.0  # 최대 가격 필터 ($1 이하)
PENNY_DATA_LOOKBACK = "2mo"  # 지표 계산용 데이터 윈도우 (최소 2개월 일봉)
PENNY_TS_INIT_PCT = 0.85  # 초기 Trailing Stop: 진입가 × 85% (-15%)
PENNY_BREAKEVEN_TRIGGER = 1.10  # 수익 +10% 달성 시 TS를 본전으로 락인
PENNY_SCALE_OUT_RSI = 70  # 1차 매도 RSI 기준
PENNY_SCALE_OUT_PROFIT = 0.20  # 1차 매도 수익률 기준 (+20%)
PENNY_SCALE_OUT_RATIO = 0.50  # 1차 매도 비율 (50%)
PENNY_TIGHT_TS_PCT = 0.93  # 2차 매도: 잔여 물량 Trailing Stop -7%
PENNY_RVOL_MIN = 3.0  # 최소 상대거래량 기준
PENNY_TOP_N = 3  # 자동 관심종목 등록 수


class PennyScanRequest(BaseModel):
    max_price: float = PENNY_MAX_PRICE
    top_n: int = PENNY_TOP_N


async def run_penny_scan_internal(
    max_price: float = PENNY_MAX_PRICE, top_n: int = PENNY_TOP_N
) -> dict:
    """
    페니 스캔 핵심 로직 — HTTP 엔드포인트와 자동 스케줄러 양쪽에서 호출.
    완료 시 last_penny_scan_at, penny_scan_results_cache 갱신.
    새 종목이 등록되면 장 중인 경우 Pulse Engine 스트림을 즉시 재시작.
    """
    global last_penny_scan_at, penny_scan_results_cache, _current_stream_task
    """
    $1 이하 페니 주식 퀀트 스캔.
    - 2개월 일봉 기반 RSI/MACD/ADX/RVOL 계산
    - DNA 점수 산출 + Top N 자동 watchlist 등록
    """
    # 1. 페니 주식 유니버스 수집 ─────────────────────────────────────────
    penny_tickers: List[str] = []
    try:
        if trading_client:
            from alpaca.trading.requests import GetAssetsRequest
            from alpaca.trading.enums import AssetClass, AssetStatus

            assets_req = GetAssetsRequest(
                asset_class=AssetClass.US_EQUITY,
                status=AssetStatus.ACTIVE,
            )
            all_assets = await asyncio.to_thread(
                trading_client.get_all_assets, assets_req
            )
            # tradable 주식만 필터 (OTC 제외)
            tradable = [
                a.symbol
                for a in all_assets
                if a.tradable and a.exchange in ("NASDAQ", "NYSE", "AMEX", "ARCA")
            ]
            print(f"📡 [Penny] Alpaca universe: {len(tradable)} tradable US equities")

            # [Guide-1] 누적 풀에서 최근 30일 이내 검증 종목 최대 100개 회수
            pool_tickers: List[str] = []
            if supabase:
                try:
                    from datetime import timedelta

                    cutoff = (datetime.now() - timedelta(days=30)).isoformat()
                    pool_res = await asyncio.to_thread(
                        supabase.table("penny_universe_pool")
                        .select("ticker")
                        .gte("last_seen_at", cutoff)
                        .order("scan_count", desc=True)
                        .limit(100)
                        .execute
                    )
                    if pool_res.data:
                        pool_tickers = [r["ticker"] for r in pool_res.data]
                        print(
                            f"📦 [Penny Pool] Loaded {len(pool_tickers)} tickers from accumulated pool"
                        )
                except Exception as pool_err:
                    print(f"⚠️ [Penny Pool] Pool fetch skipped: {pool_err}")

            # yfinance batch로 현재가 조회 (100개씩 배치)
            import random

            # [Guide-1] 랜덤 500 + 기존 검증 풀 100 믹스 (중복 제거)
            pool_set = set(pool_tickers)
            fresh_sample = random.sample(
                [t for t in tradable if t not in pool_set],
                min(500, len(tradable)),
            )
            sampled = fresh_sample + pool_tickers
            print(
                f"🔀 [Penny] Universe mix: {len(fresh_sample)} fresh + {len(pool_tickers)} pool = {len(sampled)} total"
            )

            batch_size = 50
            for i in range(0, len(sampled), batch_size):
                batch = sampled[i : i + batch_size]
                batch_str = " ".join(batch)
                try:
                    tickers_data = await asyncio.to_thread(
                        yf.download,
                        batch_str,
                        period="1d",
                        interval="1d",
                        progress=False,
                        threads=True,
                    )
                    if tickers_data is not None and not tickers_data.empty:
                        close_col = tickers_data.get("Close")
                        if close_col is not None and not close_col.empty:
                            if isinstance(close_col, pd.Series):
                                # single ticker
                                if len(batch) == 1:
                                    last_price = float(close_col.iloc[-1])
                                    if 0.01 < last_price <= max_price:
                                        penny_tickers.append(batch[0])
                            else:
                                last_row = close_col.iloc[-1]
                                for sym in batch:
                                    if sym in last_row.index:
                                        p = last_row[sym]
                                        if pd.notna(p) and 0.01 < float(p) <= max_price:
                                            penny_tickers.append(sym)
                except Exception as e:
                    print(f"⚠️ [Penny] Batch price fetch error: {e}")
                    continue

        if not penny_tickers:
            # Fallback: 알려진 페니 주식 목록
            fallback_tickers = [
                "SNDL",
                "NKLA",
                "CLOV",
                "TLRY",
                "GOEV",
                "GNUS",
                "CENN",
                "MULN",
                "FFIE",
                "AEMD",
                "VEON",
                "HCDI",
                "WRAP",
                "RITE",
                "WISA",
                "BSFC",
                "ATNF",
                "SEEL",
                "ZVIA",
                "CTXR",
            ]
            for sym in fallback_tickers:
                try:
                    tk = yf.Ticker(sym)
                    info = await asyncio.to_thread(lambda t=tk: t.fast_info)
                    price = getattr(info, "last_price", None)
                    if price and 0.01 < price <= max_price:
                        penny_tickers.append(sym)
                except Exception:
                    continue
    except Exception as e:
        print(f"❌ [Penny] Universe collection error: {e}")

    print(f"🪙 [Penny] Found {len(penny_tickers)} stocks under ${max_price}")

    # [Guide-1] 검증된 페니 종목을 누적 풀에 UPSERT (다음 스캔 시 믹스에 활용)
    if supabase and penny_tickers:
        try:
            now_iso = datetime.now().isoformat()
            upsert_rows = [
                {"ticker": t, "last_price": 0.0, "last_seen_at": now_iso}
                for t in penny_tickers
            ]
            await asyncio.to_thread(
                supabase.table("penny_universe_pool")
                .upsert(
                    upsert_rows,
                    on_conflict="ticker",
                    # scan_count는 DB에서 +1 처리 불가 → 후처리로 개별 increment 대신
                    # last_seen_at 갱신만으로 충분 (order by scan_count는 근사치)
                )
                .execute
            )
            print(
                f"✅ [Penny Pool] UPSERT {len(penny_tickers)} tickers → penny_universe_pool"
            )
        except Exception as upsert_err:
            print(f"⚠️ [Penny Pool] UPSERT skipped: {upsert_err}")

    # 2. 각 종목 2개월 일봉 기술적 지표 계산 ─────────────────────────────
    results = []
    for ticker in penny_tickers[:80]:  # 최대 80개 분석 (성능 제한)
        try:
            tk = yf.Ticker(ticker)
            df = await asyncio.to_thread(
                tk.history, period=PENNY_DATA_LOOKBACK, interval="1d"
            )
            if df is None or df.empty or len(df) < 30:
                continue

            # RSI (14)
            df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

            # MACD (12, 26, 9)
            macd_ind = ta.trend.MACD(
                df["Close"], window_slow=26, window_fast=12, window_sign=9
            )
            df["MACD_Diff"] = macd_ind.macd_diff()

            # ADX (14)
            adx_ind = ta.trend.ADXIndicator(
                high=df["High"], low=df["Low"], close=df["Close"], window=14
            )
            df["ADX"] = adx_ind.adx()

            # RVOL (30일 median 대비 현재, self-dilution 방지를 위해 shift(1))
            df["Avg_Vol"] = (
                df["Volume"].shift(1).rolling(window=30, min_periods=1).median()
            )
            df["RVOL"] = df["Volume"] / (df["Avg_Vol"] + 1e-9)

            # 추격 매수 방지 (25% 및 20일 이평선 이격도)
            ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
            df["Is_Extended"] = (
                (df["Close"] > df["Open"] * 1.25)
                | (df["Close"] > df["Close"].shift(1) * 1.25)
                | (df["Close"] > ma20 * 1.30)
            )

            latest = df.iloc[-1]
            prev = df.iloc[-2] if len(df) >= 2 else latest

            rsi = float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0
            macd_diff = (
                float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
            )
            macd_diff_prev = (
                float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
            )
            adx = (
                float(latest["ADX"])
                if "ADX" in latest.index and not pd.isna(latest["ADX"])
                else 0.0
            )
            rvol = (
                float(latest["RVOL"])
                if "RVOL" in latest.index and not pd.isna(latest["RVOL"])
                else 1.0
            )
            is_extended = (
                bool(latest["Is_Extended"]) if "Is_Extended" in latest.index else False
            )
            price = float(latest["Close"])
            change_pct = 0.0
            if len(df) >= 2:
                prev_close = float(df["Close"].iloc[-2])
                if prev_close > 0:
                    change_pct = round((price / prev_close - 1) * 100, 2)

            volume = int(latest["Volume"]) if not pd.isna(latest["Volume"]) else 0

            # DNA Score
            dna_score = calculate_dna_score(
                rsi, macd_diff, macd_diff_prev, adx, rvol, is_extended
            )

            # Signal / Strength (DNA 점수 기준으로 일원화)
            signal_type = "HOLD"
            strength = "NORMAL"

            if dna_score >= 85.0:
                signal_type = "BUY"
                strength = "STRONG"
            elif dna_score >= 80.0:
                signal_type = "BUY"
                strength = "NORMAL"
            elif dna_score <= 40.0:
                signal_type = "SELL"
                strength = "STRONG"

            results.append(
                {
                    "ticker": ticker,
                    "price": round(price, 4),
                    "change_pct": change_pct,
                    "volume": volume,
                    "dna_score": dna_score,
                    "rsi": round(rsi, 2),
                    "macd_diff": round(macd_diff, 4),
                    "adx": round(adx, 2),
                    "rvol": round(rvol, 2),
                    "signal": signal_type,
                    "strength": strength,
                    "is_extended": is_extended,
                    "is_watchlisted": False,
                }
            )
            # [Guide-1] 분석 완료 후 실제 종가로 풀 가격 갱신
            if supabase:
                try:
                    await asyncio.to_thread(
                        supabase.table("penny_universe_pool")
                        .update({"last_price": round(price, 4)})
                        .eq("ticker", ticker)
                        .execute
                    )
                except Exception:
                    pass
        except Exception as e:
            print(f"⚠️ [Penny] {ticker} analysis error: {e}")
            continue

    # 3. DNA 점수 순 정렬 + Top N 관심종목 자동 등록 ────────────────────
    results.sort(key=lambda x: x["dna_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
        r["is_top"] = i < top_n

    auto_registered: List[str] = []
    if supabase and results:
        for item in results[:top_n]:
            try:
                payload = {
                    "ticker": item["ticker"],
                    "status": "WATCHING",
                    "initial_dna_score": item["dna_score"],
                }
                existing = await asyncio.to_thread(
                    supabase.table("watchlist")
                    .select("status")
                    .eq("ticker", item["ticker"])
                    .is_("user_id", "null")
                    .execute
                )
                if existing.data:
                    current_status = existing.data[0].get("status")
                    update_data = {
                        "initial_dna_score": item["dna_score"],
                    }
                    if current_status not in ("HOLDING", "EXITED"):
                        update_data["status"] = "WATCHING"

                    await asyncio.to_thread(
                        supabase.table("watchlist")
                        .update(update_data)
                        .eq("ticker", item["ticker"])
                        .is_("user_id", "null")
                        .execute
                    )
                else:
                    await asyncio.to_thread(
                        supabase.table("watchlist").insert(payload).execute
                    )
                auto_registered.append(item["ticker"])
                item["is_watchlisted"] = True
                print(
                    f"⭐ [Penny] {item['ticker']} auto-registered to watchlist (DNA: {item['dna_score']})"
                )
            except Exception as e:
                print(
                    f"⚠️ [Penny] Watchlist auto-register error for {item['ticker']}: {e}"
                )

    # 4. Discord 알림 ──────────────────────────────────────────────────
    if auto_registered:
        registered_items = [r for r in results if r["ticker"] in auto_registered]
        top_summary = "\n".join(
            [
                f"{'🥇🥈🥉'[i] if i < 3 else '•'} {r['ticker']} — DNA: {r['dna_score']} | ${r['price']:.4f} | RSI: {r['rsi']}"
                for i, r in enumerate(registered_items)
            ]
        )
        await webhook.send_alert(
            title="🪙 [PENNY LAB] 주간 Top 3 관심종목 선정",
            description=f"스캔 종목: {len(results)}개\n\n{top_summary}",
            color=0x22D3EE,
        )

    # 5. 전역 상태 갱신 + 스트림 재시작 ────────────────────────────────
    last_penny_scan_at = datetime.now()
    penny_scan_results_cache = results

    if auto_registered and is_market_hours():
        print(
            f"🔄 [Auto-Scan] 신규 종목 {auto_registered} 등록됨 — 장 중 스트림 재시작"
        )
        if _current_stream_task and not _current_stream_task.done():
            _current_stream_task.cancel()
        _current_stream_task = asyncio.create_task(start_alpaca_stream())

    # 6. 반환 ──────────────────────────────────────────────────────────
    return {
        "scanned_at": last_penny_scan_at.isoformat(),
        "total_scanned": len(results),
        "penny_params": {
            "max_price": max_price,
            "data_lookback": PENNY_DATA_LOOKBACK,
            "trailing_stop_pct": (1 - PENNY_TS_INIT_PCT) * 100,
            "breakeven_trigger_pct": (PENNY_BREAKEVEN_TRIGGER - 1) * 100,
            "scale_out_rsi": PENNY_SCALE_OUT_RSI,
            "scale_out_profit_pct": PENNY_SCALE_OUT_PROFIT * 100,
            "tight_ts_pct": (1 - PENNY_TIGHT_TS_PCT) * 100,
            "rvol_min": PENNY_RVOL_MIN,
        },
        "results": results,
        "auto_registered": auto_registered,
    }


@app.post("/api/penny/scan")
async def penny_scan(
    req: PennyScanRequest = Body(PennyScanRequest()),
    _api_key: str = Security(get_api_key),
):
    """수동 페니 스캔 트리거 (HTTP endpoint — 내부 로직은 run_penny_scan_internal 사용)"""
    return await run_penny_scan_internal(max_price=req.max_price, top_n=req.top_n)


@app.get("/api/penny/scan/status")
async def penny_scan_status():
    """자동 스캔 상태 조회 — 마지막 실행 시각, 캐시 결과 수, 다음 실행까지 남은 시간"""
    next_scan_seconds: Optional[int] = None
    if last_penny_scan_at:
        elapsed = (datetime.now() - last_penny_scan_at).total_seconds()
        interval = 4 * 3600  # 4시간 주기
        remaining = interval - elapsed
        next_scan_seconds = max(0, int(remaining))

    return {
        "last_scan_at": last_penny_scan_at.isoformat() if last_penny_scan_at else None,
        "cached_results": len(penny_scan_results_cache),
        "next_scan_in_seconds": next_scan_seconds,
        "auto_scan_active": True,
    }


# --- REALTIME PULSE ENGINE (Start) ---

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
)
try:
    supabase: Client = (
        create_client(SUPABASE_URL, SUPABASE_KEY)
        if SUPABASE_URL and SUPABASE_KEY
        else None
    )
    if supabase:
        is_service = SUPABASE_KEY == os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        print(
            f"🚀 [INIT] Supabase Client Connected (Role: {'Service' if is_service else 'Anon'})"
        )
        paper_engine = PaperTradingManager(supabase)
except Exception:
    supabase = None


# [Guide-2] 메모리 내 HOLD 포지션 셋 — DB 조회 없이 O(1) 분기 결정
_held_tickers: set = set()


def _rsi14_last(df: pd.DataFrame) -> float:
    """RSI-14 마지막 값만 빠르게 계산 (DNA 전체 연산 대비 약 5× 경량)"""
    try:
        return float(ta.momentum.RSIIndicator(df["Close"], window=14).rsi().iloc[-1])
    except Exception:
        return 50.0


async def on_minute_bar_closed(bar):
    """
    Alpaca 1분봉 완성 콜백.

    [Guide-2] 역할 분리:
    - HOLD 포지션 종목 → RSI-14 + 현재가만 계산하는 경량 모니터 경로
      (DNA 전체 재연산 생략 → CPU/API 레이트 리밋 절감)
    - 미보유 종목 → 기존 run_pulse_engine() 전체 DNA 경로 (발굴·신호 생성)
    """
    ticker_symbol = bar.symbol
    try:
        # 1. 상태 업데이트 및 히스토리 획득 (Stateful Queue)
        df_hist = candle_state.update(ticker_symbol, bar)

        # 2. 최소 데이터 확인 (MACD/RSI 계산을 위해 최소 35개 필요)
        if len(df_hist) < 35:
            return

        current_price = float(bar.close)

        # ── [Guide-2] 경량 모니터 경로 (HOLD 포지션 전용) ─────────────────
        if ticker_symbol in _held_tickers and paper_engine:
            rsi_val = await asyncio.to_thread(_rsi14_last, df_hist)
            # WebSocket 프론트엔드에도 최소 페이로드 전송 (현재가 + RSI)
            await manager.broadcast(
                {
                    "ticker": ticker_symbol,
                    "price": current_price,
                    "rsi": round(rsi_val, 2),
                    "signal": "HOLD",
                    "strength": "MONITOR",
                    "dna_score": None,
                }
            )
            await paper_engine.process_signal(
                ticker=ticker_symbol,
                price=current_price,
                signal_type="HOLD",
                strength="MONITOR",
                rsi=rsi_val,
                ai_report="",
                is_armed=SYSTEM_ARMED,
                dna_score=0.0,
                kelly_weight=0.0,
            )
            # 포지션 청산 후 셋에서 제거 (process_signal 내부가 DB에서 삭제)
            if supabase:
                try:
                    chk = await asyncio.to_thread(
                        supabase.table("paper_positions")
                        .select("ticker")
                        .eq("ticker", ticker_symbol)
                        .execute
                    )
                    if not chk.data:
                        _held_tickers.discard(ticker_symbol)
                except Exception:
                    pass
            return  # 경량 경로 종료 — DNA 재연산 없음

        # ── 전체 DNA 경로 (신규 발굴 / 미보유 종목) ───────────────────────
        # 3. 고도화된 페이로드 생성 (수학적 및 AI 로직 오프홀딩)
        payload = await asyncio.to_thread(run_pulse_engine, ticker_symbol, df_hist)

        # 4. WebSocket 프론트엔드 실시간 전송
        await manager.broadcast(payload)

        # 5. 서비스 연동 (DB, Discord, Paper Trading)
        if supabase:
            try:
                # DB 저장 (Resilient Insert)
                try:
                    await asyncio.to_thread(
                        supabase.table("realtime_signals").insert(payload).execute
                    )
                except Exception as db_err:
                    err_str = str(db_err)
                    # If column is missing (PGRST204), retry with common missing columns removed
                    if (
                        "PGRST204" in err_str
                        or "data_source" in err_str
                        or "volume_multiplier" in err_str
                    ):
                        safe_payload = payload.copy()
                        safe_payload.pop("data_source", None)
                        safe_payload.pop("volume_multiplier", None)
                        await asyncio.to_thread(
                            supabase.table("realtime_signals")
                            .insert(safe_payload)
                            .execute
                        )
                    else:
                        raise db_err

                # 강력한 신호 시 Discord 알림
                if payload.get("strength") == "STRONG":
                    color = 0x2ECC71 if payload.get("signal") == "BUY" else 0xE74C3C
                    action = (
                        "🟢 STRONG BUY"
                        if payload.get("signal") == "BUY"
                        else "🔴 STRONG SELL / SCALE_OUT"
                    )
                    title = f"[MuzeBIZ Pulse] {ticker_symbol} {action}"
                    desc = (
                        f"현재가: ${payload.get('price'):.2f} | RSI: {payload.get('rsi')}\n\n"
                        f"💡 {payload.get('ai_report', '')}"
                    )
                    await webhook.send_alert(title=title, description=desc, color=color)

                # daily_discovery 공통 소스 upsert (ScannerPage + AlphaDiscovery 단일 진실 소스)
                dna_val = float(payload.get("dna_score", 0.0))
                try:
                    await asyncio.to_thread(
                        supabase.table("daily_discovery")
                        .upsert(
                            {
                                "ticker": ticker_symbol,
                                "dna_score": round(dna_val, 1),
                                "rvol": float(payload.get("rvol", 1.0)),
                                "price": float(payload.get("price", 0.0)),
                                "change_percent": 0.0,
                                "updated_at": datetime.now().isoformat(),
                            },
                            on_conflict="ticker",
                        )
                        .execute
                    )
                except Exception as dd_err:
                    print(
                        f"⚠️ [daily_discovery] upsert skipped for {ticker_symbol}: {dd_err}"
                    )

                # Paper Trading 자동 실행
                if paper_engine:
                    await paper_engine.process_signal(
                        ticker=ticker_symbol,
                        price=payload.get("price"),
                        signal_type=payload.get("signal"),
                        strength=payload.get("strength"),
                        rsi=payload.get("rsi"),
                        ai_report=payload.get("ai_report", ""),
                        is_armed=SYSTEM_ARMED,
                        dna_score=dna_val,
                        kelly_weight=float(payload.get("recommended_weight", 0.0)),
                    )
                    # [Guide-2] 매수 성공 시 _held_tickers에 등록 (다음 틱부터 경량 경로)
                    if (
                        payload.get("signal") == "BUY"
                        and payload.get("strength") == "STRONG"
                        and SYSTEM_ARMED
                        and dna_val >= (70 if current_price <= 1.0 else 80)
                    ):
                        _held_tickers.add(ticker_symbol)

                print(
                    f"⚡ [Alpaca Stream] {ticker_symbol} processed: {payload.get('signal')} ({payload.get('strength')}) | vol_mul={payload.get('volume_multiplier', 1.0):.1f}x"
                )

            except Exception as service_err:
                print(f"⚠️ Service Integration Error for {ticker_symbol}: {service_err}")

    except Exception as e:
        print(f"❌ Pulse Stream Error for {ticker_symbol}: {e}")
    finally:
        # 가비지 컬렉터 강제 호출 (OOM 방지)
        gc.collect()


async def start_alpaca_stream(tickers: Optional[List[str]] = None):
    """Alpaca WebSocket 스트림 데몬 시작"""
    print("📡 [Pulse Engine] Initializing Event-Driven Stream...")

    active_tickers = (
        tickers  # except 블록에서도 안전하게 참조 가능하도록 스코프 상위에 선언
    )

    # 1. 감시 유니버스 로드
    try:
        if not active_tickers:
            active_tickers = await asyncio.to_thread(db.get_active_tickers, limit=15)

        if not active_tickers:
            print("⚠️ No active tickers to monitor. Pulse engine standby.")
            return

        # 2. 히스토리 웜업 (지표 계산을 위한 초기 데이터 채우기)
        if active_tickers:
            await candle_state.warm_up(active_tickers)

        # 3. Alpaca 스트림 설정
        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")

        if not api_key or not api_secret:
            print("❌ Alpaca API Key missing. Stream cannot start.")
            return

        # 3a. Alpaca 스트림 초기화 (공식 라이브러리가 인증을 처리하도록 함)
        # Note: IEX 피드는 실계좌/모의투자 키 모두 동일한 주소를 사용합니다.
        stream = StockDataStream(api_key, api_secret, feed=DataFeed.IEX)

        # 4. 구독 설정 (1분봉 닫힘 이벤트)
        stream.subscribe_bars(on_minute_bar_closed, *active_tickers)

        print(f"🚀 [Pulse Engine] Live: Monitoring {active_tickers}")

        # 5. 스트림 실행 (무한 루프) — with retry limit to prevent console spam
        max_auth_failures = 3
        auth_failure_count = 0

        async def _guarded_run_forever():
            nonlocal auth_failure_count
            while auth_failure_count < max_auth_failures:
                try:
                    await stream._start_ws()
                except ValueError as ve:
                    if "auth failed" in str(ve).lower():
                        auth_failure_count += 1
                        print(
                            f"🔑 [Alpaca] Auth failed ({auth_failure_count}/{max_auth_failures})"
                        )
                        if auth_failure_count >= max_auth_failures:
                            print(
                                "🔑 [Alpaca] Max auth failures reached. Stopping stream."
                            )
                            print(
                                "   → Please check your API keys and restart the server."
                            )
                            return
                        await asyncio.sleep(5)
                    else:
                        raise
                except Exception as e:
                    print(f"⚠️ [Alpaca] Stream error: {e}. Reconnecting in 30s...")
                    auth_failure_count = 0  # Reset on non-auth errors
                    await asyncio.sleep(30)

        await _guarded_run_forever()

    except Exception as e:
        error_msg = f"❌ Alpaca Stream Lifecycle Error: {e}"
        print(error_msg)
        await webhook.send_alert(
            title="[CRITICAL] Pulse Engine Stream Offline",
            description=f"스트림 엔진에 치명적 오류가 발생했습니다.\nError: {e}",
            color=0xFF0000,
        )
        # connection limit exceeded 는 더 긴 백오프 (API 연결 누적 방지)
        if "connection limit" in str(e).lower():
            wait_sec = 300
            print(f"⏳ Connection limit hit — {wait_sec}초 후 재연결 시도...")
        else:
            wait_sec = 60
            print(f"⏳ {wait_sec}초 후 재연결 시도...")
        await asyncio.sleep(wait_sec)
        if is_market_hours():
            asyncio.create_task(start_alpaca_stream(active_tickers))
        else:
            print("🌙 [Pulse] 시장 폐장 — 스트림 재시작 스킵 (스냅샷 모드 유지)")


async def auto_penny_scan_scheduler():
    """
    서버 시작 시 즉시 + 이후 4시간 주기로 페니 스캔 자동 실행.
    watchlist가 비어있으면 첫 스캔을 더 짧은 대기 후 즉시 실행.
    """
    # 초기 대기: 서버 워밍업(DB 연결, 스트림 초기화) 완료를 위해 30초 대기
    await asyncio.sleep(30)

    while True:
        try:
            active = await asyncio.to_thread(db.get_active_tickers, limit=15)
            watching_count = len(active)
            print(
                f"🪙 [Auto-Scan] 자동 페니 스캔 시작 (현재 watchlist: {watching_count}개)"
            )
            await run_penny_scan_internal()
            print("✅ [Auto-Scan] 페니 스캔 완료 — 다음 실행까지 4시간 대기")
        except Exception as e:
            print(f"⚠️ [Auto-Scan] 스캔 중 오류: {e}")

        await asyncio.sleep(4 * 3600)  # 4시간 주기


async def stream_scheduler():
    """개장 시간을 감지해 Alpaca 스트림을 자동 시작/종료하는 스케줄러.
    매 개장 사이클마다 DB에서 최신 watchlist를 조회하므로 스캔 후 신규 종목이 즉시 반영됨.
    """
    global _current_stream_task
    was_market_open = False

    while True:
        now_open = is_market_hours()

        if now_open and not was_market_open:
            print(
                "🔔 [Scheduler] 개장 감지 — DB에서 최신 watchlist 로드 후 스트림 시작"
            )
            # tickers를 전달하지 않으면 start_alpaca_stream이 DB에서 직접 조회
            _current_stream_task = asyncio.create_task(start_alpaca_stream())
            was_market_open = True

        elif not now_open and was_market_open:
            print("🌙 [Scheduler] 폐장 감지 — 스트림 종료")
            if _current_stream_task and not _current_stream_task.done():
                _current_stream_task.cancel()
            _current_stream_task = None
            was_market_open = False

        elif not now_open and not was_market_open:
            from zoneinfo import ZoneInfo

            now_et = datetime.now(ZoneInfo("America/New_York"))
            open_min = 9 * 60 + 30
            cur_min = now_et.hour * 60 + now_et.minute
            mins_to_open = open_min - cur_min
            if 0 < mins_to_open <= 60:
                print(f"⏰ [Scheduler] 개장 {mins_to_open}분 전 대기 중...")

        await asyncio.sleep(60)


async def system_heartbeat():
    """10분 주기 시스템 상태 보고 (Dead Man's Switch)"""
    print("💓 [Heartbeat] System Monitor Started.")
    while True:
        try:
            await asyncio.sleep(600)  # 10분
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            await webhook.send_alert(
                title="[HEARTBEAT] System Healthy",
                description=f"시간: {now}\n상태: Active Monitoring\n연결된 웹소켓: {len(manager.active_connections)}개",
                color=0x3498DB,
            )
            print(f"💓 [Heartbeat] Pulse sent at {now}")
        except Exception as e:
            print(f"⚠️ Heartbeat error: {e}")


@app.on_event("startup")
async def startup_event():
    # ... (supabase initialization)
    print("🎬 [Startup] MuzeBIZ Realtime Platform initializing...")

    # 백그라운드 태스크로 실행
    asyncio.create_task(run_startup_sequence())


async def run_startup_sequence():
    """초기화 시퀀스: 워밍업 후 스냅샷 펄스 방출 및 스트림 시작"""
    global SYSTEM_ARMED

    # 0a. DB에서 ARMED 상태 복원 (서버 재시작 후 상태 유지)
    if supabase:
        try:
            res = await asyncio.to_thread(
                supabase.table("system_settings")
                .select("is_armed")
                .eq("id", 1)
                .single()
                .execute
            )
            if res.data and res.data.get("is_armed") is not None:
                SYSTEM_ARMED = bool(res.data["is_armed"])
                print(f"📡 [Startup] SYSTEM_ARMED restored from DB: {SYSTEM_ARMED}")
        except Exception as e:
            # PGRST204: is_armed 컬럼 미존재 → 마이그레이션 미적용 상태, 기본값 False 유지
            if "PGRST204" in str(e) or "is_armed" in str(e):
                print(
                    "⚠️ [Startup] is_armed column not found. Apply migration to enable ARM persistence."
                )
            else:
                print(f"⚠️ [Startup] Could not restore ARM state: {e}")

    # 0b. 페이퍼 트레이딩 계좌 초기화 (필요 시)
    if paper_engine:
        await paper_engine.initialize_account()

    # 0c. [Guide-2] 기존 HOLD 포지션을 _held_tickers에 로드 (서버 재시작 후 경량 경로 유지)
    if supabase:
        try:
            held_res = await asyncio.to_thread(
                supabase.table("paper_positions")
                .select("ticker")
                .eq("status", "HOLD")
                .execute
            )
            if held_res.data:
                for row in held_res.data:
                    _held_tickers.add(row["ticker"])
                print(
                    f"📌 [Guide-2] Restored {len(_held_tickers)} HOLD tickers to monitor set: {sorted(_held_tickers)}"
                )
        except Exception as e:
            print(f"⚠️ [Guide-2] Could not restore held tickers: {e}")

    active_tickers = await asyncio.to_thread(db.get_active_tickers, limit=15)

    # 1. 히스토리 워밍업 (기존 watchlist 종목이 있을 때만)
    if active_tickers:
        await candle_state.warm_up(active_tickers)

    # 2. 주말/폐장 시에도 데이터를 보여주기 위해 스냅샷 펄스 1회 방출
    print("📸 [Startup] Emitting initial snapshot pulses...")
    for ticker in active_tickers:
        if ticker in candle_state.history and not candle_state.history[ticker].empty:
            df = candle_state.history[ticker]
            # 최근 캔들 하나를 모사하여 펄스 엔진 가동
            try:
                payload = await asyncio.to_thread(run_pulse_engine, ticker, df)
                payload["indicator"] = "Snapshot (Last Close)"
                payload["data_source"] = (
                    "alpaca_iex"
                    if ticker in candle_state.volume_multiplier
                    else "yfinance_snapshot"
                )

                # WebSocket 전송
                await manager.broadcast(payload)

                # DB 저장 (영속성 확보 - Resilient)
                if supabase:
                    try:
                        await asyncio.to_thread(
                            supabase.table("realtime_signals").insert(payload).execute
                        )
                        print(f"💾 Snapshot for {ticker} saved to DB.")
                    except Exception as db_err:
                        err_str = str(db_err)
                        if (
                            "PGRST204" in err_str
                            or "data_source" in err_str
                            or "volume_multiplier" in err_str
                        ):
                            safe_payload = payload.copy()
                            safe_payload.pop("data_source", None)
                            safe_payload.pop("volume_multiplier", None)
                            await asyncio.to_thread(
                                supabase.table("realtime_signals")
                                .insert(safe_payload)
                                .execute
                            )
                            print(f"💾 Snapshot for {ticker} saved (Safe Mode).")
                        else:
                            print(f"⚠️ Initial pulse for {ticker} failed: {db_err}")
            except Exception as e:
                print(f"⚠️ Initial pulse for {ticker} failed: {e}")

    # 3. 실시간 스트림, 하트비트, 자동 페니 스캔 스케줄러 시작
    asyncio.create_task(system_heartbeat())
    asyncio.create_task(stream_scheduler())
    asyncio.create_task(auto_penny_scan_scheduler())


# --- REALTIME PULSE ENGINE (End) ---


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
