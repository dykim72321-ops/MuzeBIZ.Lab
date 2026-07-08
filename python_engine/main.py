"""
main.py — FastAPI 앱 조립 + 핵심 Pulse Engine 로직

라우터별로 분리된 엔드포인트는 routers/ 패키지에 있음.
이 파일은 다음을 담당한다:
  - FastAPI 앱 생성 및 라우터 include
  - AppState 초기화 (Supabase, Alpaca, PaperEngine, Webhook)
  - ConnectionManager / TickerDataState 정의
  - is_market_hours() / calculate_advanced_signals() / calculate_dna_score() 등 공유 유틸
  - run_pulse_engine() — 1분봉 신호 엔진 (WebSocket + DB + Discord 연동)
  - run_quant_scan_internal() — 퀀트 스캔 핵심 로직 ($100 이하 일반주식)
  - on_minute_bar_closed() — Alpaca 1분봉 콜백
  - start_alpaca_stream() / start_rest_polling() — 스트리밍 데몬
  - startup_event() / run_startup_sequence() — 앱 시작 시퀀스
  - WebSocket /ws/pulse 엔드포인트
"""

from __future__ import annotations

import asyncio
import gc
import os
import subprocess
import sys
import threading
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pandas_market_calendars as mcal
import ta
import yfinance as yf
from alpaca.data.enums import DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.timeframe import TimeFrame
from alpaca.trading.client import TradingClient
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

from db_manager import DBManager
from paper_engine import PaperTradingManager
from state import app_state

_TRADE_MODE = os.getenv("TRADE_MODE", "PAPER").upper()
app_state.TRADE_MODE = _TRADE_MODE
from webhook_manager import WebhookManager

try:
    from scraper import SearchAggregator
except ImportError:
    SearchAggregator = None

# ── 환경변수 로드 ────────────────────────────────────────────────────────────
load_dotenv()

# ── NYSE 캘린더 ──────────────────────────────────────────────────────────────
_nyse_calendar = mcal.get_calendar("NYSE")
_holiday_cache: dict = {}


def is_market_hours(ref_dt=None) -> bool:
    """US 시장 개장 여부 (ET 기준 평일 09:30~16:00 및 휴장일 체크). DST 자동 처리.

    ref_dt: 바 타임스탬프(tz-aware). None이면 현재 벽시계로 판단.
            warm_up 재생 등 과거 바를 처리할 때 반드시 바 시간을 전달해야
            장외 시간 기준이 바 시간이 아닌 현재 시각으로 판단되는 버그를 방지한다.
    """
    if ref_dt is not None:
        now_et = ref_dt.astimezone(ZoneInfo("America/New_York"))
    else:
        now_et = datetime.now(ZoneInfo("America/New_York"))

    if now_et.weekday() >= 5:
        return False

    date_str = now_et.strftime("%Y-%m-%d")
    if date_str not in _holiday_cache:
        try:
            schedule = _nyse_calendar.schedule(start_date=date_str, end_date=date_str)
            _holiday_cache[date_str] = not schedule.empty
        except Exception as e:
            print(f"⚠️ [Calendar] Failed to fetch schedule for {date_str}: {e}")
            _holiday_cache[date_str] = True

    if not _holiday_cache[date_str]:
        return False

    open_min = 9 * 60 + 30
    close_min = 16 * 60
    cur_min = now_et.hour * 60 + now_et.minute
    return open_min <= cur_min < close_min


# ── FastAPI 앱 ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="MuzeBIZ Technical Analysis API",
    description="Unified Python Platform for Stock Analysis & Discovery",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── ConnectionManager (분리됨 → core/websocket.py) ──────────────────────────
from core.websocket import ConnectionManager  # noqa: E402


# ── TickerDataState, MTFCache, MomentumValidator (분리됨 → services/market_data.py) ──
from services.market_data import (
    TickerDataState,
    MTFCache,
    MomentumValidator,
)  # noqa: E402


# ── 전역 인스턴스 초기화 ─────────────────────────────────────────────────────
_manager = ConnectionManager()
_candle_state = TickerDataState(max_bars=100)
_db = DBManager()
_webhook = WebhookManager()
_mtf_cache = MTFCache()
_momentum_validator = MomentumValidator(mtf_cache=_mtf_cache, rvol_threshold=1.5)

# AppState에 주입
app_state.manager = _manager
app_state.candle_state = _candle_state
app_state.db = _db
app_state.webhook = _webhook
app_state.mtf_cache = _mtf_cache

# Alpaca TradingClient (키가 있을 때만 초기화)
_APCA_API_KEY = os.getenv("APCA_API_KEY_ID")
_APCA_API_SECRET = os.getenv("APCA_API_SECRET_KEY")
_APCA_PAPER = os.getenv("APCA_PAPER", "true").lower() == "true"

if _APCA_API_KEY and _APCA_API_SECRET:
    app_state.trading_client = TradingClient(
        _APCA_API_KEY, _APCA_API_SECRET, paper=_APCA_PAPER
    )

# Supabase 초기화 (모듈 로드 시 즉시 — startup event 전에 다른 모듈에서 참조될 수 있음)
_SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
_SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
)
try:
    _supabase_client: Client = (
        create_client(_SUPABASE_URL, _SUPABASE_KEY)
        if _SUPABASE_URL and _SUPABASE_KEY
        else None
    )
    if _supabase_client:
        is_service = _SUPABASE_KEY == os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        print(
            f"🚀 [INIT] Supabase Client Connected (Role: {'Service' if is_service else 'Anon'})"
        )
        app_state.supabase = _supabase_client
        app_state.paper_engine = PaperTradingManager(_supabase_client)

        _webhook.set_supabase_client(_supabase_client)

        if not _webhook.webhook_url:
            try:
                res = (
                    _supabase_client.table("system_settings")
                    .select("webhook_url")
                    .limit(1)
                    .execute()
                )
                if res.data and res.data[0].get("webhook_url"):
                    _webhook.webhook_url = res.data[0]["webhook_url"]
                    if app_state.paper_engine and app_state.paper_engine.webhook:
                        app_state.paper_engine.webhook.webhook_url = (
                            _webhook.webhook_url
                        )
                    print(
                        "🔗 [INIT] Loaded Discord Webhook URL from system_settings DB table."
                    )
            except Exception as db_err:
                print(
                    f"⚠️ [INIT] Failed to load webhook from system_settings DB: {db_err}"
                )
except Exception:
    app_state.supabase = None

# ── LiveTradingManager 초기화 (TRADE_MODE=LIVE) ──────────────────────────────
# APCA_PAPER=true  → Alpaca 페이퍼 계좌에 실제 주문 제출 (Alpaca 사이트에서 확인 가능)
# APCA_PAPER=false → Alpaca 실계좌에 실제 주문 제출 (실제 자금 사용 — 주의)
if _TRADE_MODE == "LIVE" and app_state.supabase and app_state.trading_client:
    from live_engine import LiveTradingManager

    app_state.live_engine = LiveTradingManager(
        app_state.supabase, app_state.trading_client
    )
    if app_state.live_engine.webhook and _webhook.webhook_url:
        app_state.live_engine.webhook.webhook_url = _webhook.webhook_url
    account_type = "페이퍼(가상)" if _APCA_PAPER else "실계좌(실제 자금!)"
    print(f"🔴 [INIT] LiveTradingManager 초기화 — Alpaca {account_type} 주문 활성")
    if not _APCA_PAPER:
        print(
            "⚠️  [INIT] 실계좌 모드: 실제 자금으로 주문됩니다. ARM 활성 전 반드시 확인!"
        )
elif _TRADE_MODE == "LIVE":
    print("⚠️ [INIT] TRADE_MODE=LIVE이지만 Supabase/Alpaca 미연결 — Paper 유지")
else:
    print("📄 [INIT] TRADE_MODE=PAPER — 내부 가상매매 모드 (Alpaca 주문 없음)")

# ── stats_cache 공유 참조 (routers/strategy.py 와 run_pulse_engine 에서 모두 사용) ──
from routers.strategy import stats_cache, _stats_cache_lock

# ── 라우터 등록 ──────────────────────────────────────────────────────────────
from routers import (
    analyze,
    backtest,
    broker,
    checklist,
    edge,
    parts,
    penny,
    portfolio,
    pulse,
    settings,
    strategy,
)

app.include_router(pulse.router)
app.include_router(broker.router)
app.include_router(settings.router)
app.include_router(analyze.router)
app.include_router(parts.router)
app.include_router(portfolio.router)
app.include_router(backtest.router)
app.include_router(edge.router)
app.include_router(strategy.router)
app.include_router(penny.router)
app.include_router(checklist.router)


# ── 루트 엔드포인트 ──────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "MuzeBIZ Unified Python Platform is running!"}


# ── WebSocket /ws/pulse ──────────────────────────────────────────────────────
@app.websocket("/ws/pulse")
async def websocket_endpoint(websocket: WebSocket):
    await _manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _manager.disconnect(websocket)


# ── 퀀트 엔진 핵심 함수들 (분리됨 → services/quant_engine.py) ─────────────────
from services.quant_engine import (  # noqa: E402
    calculate_advanced_signals,
    calculate_dna_score,
    calculate_dynamic_kelly,
    calculate_position_sizing,
    generate_ai_investment_report,
)


def run_pulse_engine(ticker: str, df_raw: pd.DataFrame):
    """의사결정 최적화 엔진: 지표 + 포지션 사이징 + AI 결합"""
    avg_daily_vol = _candle_state.avg_daily_volume.get(ticker.upper(), 0.0)
    df = calculate_advanced_signals(df_raw, avg_daily_volume=avg_daily_vol)
    latest = df.iloc[-1]

    dynamic_kelly_weight = None
    recent_pnls = None
    _cached_pnls = stats_cache.get("recent_pnls")
    if _cached_pnls:
        recent_pnls = _cached_pnls
    elif app_state.supabase:
        try:
            res = (
                app_state.supabase.table("paper_history")
                .select("pnl_pct")
                .order("closed_at", desc=True)
                .limit(50)
                .execute()
            )
            if res.data:
                recent_pnls = [
                    float(row.get("pnl_pct") or 0.0) for row in reversed(res.data)
                ]
                with _stats_cache_lock:
                    stats_cache["recent_pnls"] = recent_pnls
        except Exception as e:
            print(f"⚠️ [Dynamic Kelly DB Fetch Error] {e}")

    if recent_pnls and len(recent_pnls) >= 10:
        d_weight, _, _ = calculate_dynamic_kelly(recent_pnls, min_trades=10)
        dynamic_kelly_weight = d_weight if d_weight > 0 else None

    sizing = calculate_position_sizing(
        df_raw, dynamic_kelly_weight=dynamic_kelly_weight
    )

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
        "smoothed_er": round(float(latest.get("smoothed_er", 0.5)), 4),
    }

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
        di_plus=(
            float(latest["+DI"])
            if "+DI" in latest and not pd.isna(latest["+DI"])
            else 0.0
        ),
        di_minus=(
            float(latest["-DI"])
            if "-DI" in latest and not pd.isna(latest["-DI"])
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

    payload["dna_score"] = dna_score
    payload["macd_diff_prev"] = round(macd_diff_prev, 4)
    payload["di_positive"] = bool(
        (
            float(latest["+DI"])
            if "+DI" in latest and not pd.isna(latest["+DI"])
            else 0.0
        )
        > (
            float(latest["-DI"])
            if "-DI" in latest and not pd.isna(latest["-DI"])
            else 0.0
        )
    )
    payload["data_source"] = "alpaca_iex"
    payload["volume_multiplier"] = _candle_state.volume_multiplier.get(
        ticker.upper(), 1.0
    )

    return payload


# ── Quant Scan 상수 ($100 이하 일반 주식 퀀트 스캔) ──────────────────────────
# Paper Engine 자체의 페니 파라미터(PENNY_*)는 paper_engine.py에 유지됨
SCAN_MAX_PRICE = 100.0
SCAN_DATA_LOOKBACK = "2mo"
SCAN_TOP_N = 10

# 하위 호환 — Paper Engine 내부 페니 상태머신 파라미터 (변경 금지)
PENNY_DATA_LOOKBACK = "2mo"
PENNY_TS_INIT_PCT = 0.90
PENNY_BREAKEVEN_TRIGGER = 1.10
PENNY_SCALE_OUT_RSI = 65
PENNY_SCALE_OUT_PROFIT = 0.10
PENNY_SCALE_OUT_RATIO = 0.50
PENNY_TIGHT_TS_PCT = 0.95
PENNY_RVOL_MIN = 1.2

# 세션 내 데이터 없음(상장폐지/OTC) 종목 캐시 — 매 스캔마다 재시도 방지
_yf_no_data_cache: set[str] = set()


async def run_quant_scan_internal(
    max_price: float = SCAN_MAX_PRICE, top_n: int = SCAN_TOP_N
) -> dict:
    """
    퀀트 스캔 핵심 로직 ($100 이하 일반 주식) — HTTP 엔드포인트와 자동 스케줄러 양쪽에서 호출.
    완료 시 app_state.last_penny_scan_at, app_state.penny_scan_results_cache 갱신.
    """
    import random
    import re as _re

    supabase = app_state.supabase
    trading_client = app_state.trading_client
    webhook = app_state.webhook

    scan_tickers: List[str] = []
    try:
        if trading_client:
            from alpaca.trading.enums import AssetClass, AssetStatus
            from alpaca.trading.requests import GetAssetsRequest

            assets_req = GetAssetsRequest(
                asset_class=AssetClass.US_EQUITY,
                status=AssetStatus.ACTIVE,
            )
            all_assets = await asyncio.to_thread(
                trading_client.get_all_assets, assets_req
            )

            _SKIP_PATTERN = _re.compile(r"\." r"|W[SR]?$" r"|[0-9]$" r"|R$")
            tradable = [
                a.symbol
                for a in all_assets
                if a.tradable
                and a.exchange in ("NASDAQ", "NYSE", "AMEX", "ARCA")
                and not _SKIP_PATTERN.search(a.symbol)
                and len(a.symbol) <= 5
            ]
            print(f"📡 [Scan] Alpaca universe: {len(tradable)} tradable US equities")

            pool_tickers: List[str] = []
            if supabase:
                try:
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
                            f"📦 [Scan Pool] Loaded {len(pool_tickers)} tickers from accumulated pool"
                        )
                except Exception as pool_err:
                    print(f"⚠️ [Scan Pool] Pool fetch skipped: {pool_err}")

            pool_set = set(pool_tickers)
            fresh_sample = random.sample(
                [t for t in tradable if t not in pool_set],
                min(500, len(tradable)),
            )
            sampled = fresh_sample + pool_tickers
            print(
                f"🔀 [Scan] Universe mix: {len(fresh_sample)} fresh + {len(pool_tickers)} pool = {len(sampled)} total"
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
                        volume_col = tickers_data.get("Volume")
                        if (
                            close_col is not None
                            and not close_col.empty
                            and volume_col is not None
                        ):
                            if isinstance(close_col, pd.Series):
                                if len(batch) == 1:
                                    last_price = float(close_col.iloc[-1])
                                    last_vol = float(volume_col.iloc[-1])
                                    if (
                                        0.01 < last_price <= max_price
                                        and (last_price * last_vol) > 200000
                                    ):
                                        scan_tickers.append(batch[0])
                            else:
                                last_row = close_col.iloc[-1]
                                last_vol_row = volume_col.iloc[-1]
                                for sym in batch:
                                    if (
                                        sym in last_row.index
                                        and sym in last_vol_row.index
                                    ):
                                        p = last_row[sym]
                                        v = last_vol_row[sym]
                                        if pd.notna(p) and pd.notna(v):
                                            p_val, v_val = float(p), float(v)
                                            if (
                                                0.01 < p_val <= max_price
                                                and (p_val * v_val) > 200000
                                            ):
                                                scan_tickers.append(sym)
                except Exception as e:
                    print(f"⚠️ [Scan] Batch price fetch error: {e}")
                    continue

        if not scan_tickers:
            fallback_tickers = [
                "F",
                "AAL",
                "SOFI",
                "NIO",
                "RIVN",
                "LCID",
                "PLUG",
                "SNAP",
                "CLSK",
                "MARA",
                "RIOT",
                "HIMS",
                "OPEN",
                "JOBY",
                "DNA",
                "SPCE",
                "WKHS",
                "PRPL",
                "BARK",
                "LIDR",
            ]
            for sym in fallback_tickers:
                try:
                    tk = yf.Ticker(sym)
                    info = await asyncio.to_thread(lambda t=tk: t.fast_info)
                    price = getattr(info, "last_price", None)
                    if price and 0.01 < price <= max_price:
                        scan_tickers.append(sym)
                except Exception:
                    continue
    except Exception as e:
        print(f"❌ [Scan] Universe collection error: {e}")

    print(f"📡 [Scan] Found {len(scan_tickers)} stocks under ${max_price}")

    if supabase and scan_tickers:
        try:
            now_iso = datetime.now().isoformat()
            upsert_rows = [
                {"ticker": t, "last_price": 0.0, "last_seen_at": now_iso}
                for t in scan_tickers
            ]
            await asyncio.to_thread(
                supabase.table("penny_universe_pool")
                .upsert(upsert_rows, on_conflict="ticker")
                .execute
            )
            print(
                f"✅ [Scan Pool] UPSERT {len(scan_tickers)} tickers → penny_universe_pool"
            )
        except Exception as upsert_err:
            print(f"⚠️ [Scan Pool] UPSERT skipped: {upsert_err}")

    results = []
    for ticker in scan_tickers[:80]:
        if ticker in _yf_no_data_cache:
            continue
        try:
            tk = yf.Ticker(ticker)
            df = await asyncio.to_thread(
                tk.history, period=PENNY_DATA_LOOKBACK, interval="1d"
            )
            if df is None or df.empty or len(df) < 30:
                _yf_no_data_cache.add(ticker)
                continue

            df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

            macd_ind = ta.trend.MACD(
                df["Close"], window_slow=26, window_fast=12, window_sign=9
            )
            df["MACD_Diff"] = macd_ind.macd_diff()

            adx_ind = ta.trend.ADXIndicator(
                high=df["High"], low=df["Low"], close=df["Close"], window=14
            )
            df["ADX"] = adx_ind.adx()
            df["+DI"] = adx_ind.adx_pos()
            df["-DI"] = adx_ind.adx_neg()

            df["Avg_Vol"] = (
                df["Volume"].shift(1).rolling(window=30, min_periods=1).median()
            )
            df["RVOL"] = df["Volume"] / (df["Avg_Vol"] + 1e-9)

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

            dna_score = calculate_dna_score(
                rsi=rsi,
                macd_diff=macd_diff,
                macd_diff_prev=macd_diff_prev,
                adx=adx,
                di_plus=(
                    float(latest["+DI"])
                    if "+DI" in latest.index and not pd.isna(latest["+DI"])
                    else 0.0
                ),
                di_minus=(
                    float(latest["-DI"])
                    if "-DI" in latest.index and not pd.isna(latest["-DI"])
                    else 0.0
                ),
                rvol=rvol,
                is_extended=is_extended,
            )

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
                }
            )
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
            print(f"⚠️ [Scan] {ticker} analysis error: {e}")
            continue

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
                        auto_registered.append(item["ticker"])

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

                # [Option A Fix] daily_discovery에도 즉시 upsert하여 UI에 표시되도록 함
                try:
                    await asyncio.to_thread(
                        supabase.table("daily_discovery")
                        .upsert(
                            {
                                "ticker": item["ticker"],
                                "dna_score": int(round(item["dna_score"])),
                                "price": item["price"],
                                "change": str(round(item["change_pct"], 2)),
                                "change_percent": round(item["change_pct"], 2),
                                "volume": str(item["volume"]),
                                "updated_at": datetime.now().isoformat(),
                                "rsi": item["rsi"],
                                "rvol": item["rvol"],
                                "adx": item["adx"],
                                "macd_diff": item["macd_diff"],
                                "is_extended": item["is_extended"],
                            },
                            on_conflict="ticker",
                        )
                        .execute
                    )
                    print(
                        f"⭐ [Scan] {item['ticker']} also upserted to daily_discovery"
                    )
                except Exception as dd_e:
                    print(
                        f"⚠️ [Scan] daily_discovery upsert error for {item['ticker']}: {dd_e}"
                    )

            except Exception as e:
                print(
                    f"⚠️ [Scan] Watchlist auto-register error for {item['ticker']}: {e}"
                )

    if auto_registered and webhook:
        registered_items = [r for r in results if r["ticker"] in auto_registered]
        top_summary = "\n".join(
            [
                f"{'🥇🥈🥉'[i] if i < 3 else '•'} {r['ticker']} — DNA: {r['dna_score']} | ${r['price']:.4f} | RSI: {r['rsi']}"
                for i, r in enumerate(registered_items)
            ]
        )
        await webhook.send_alert(
            use_dev=True,
            title="📡 [QUANT SCAN] Top 퀀트 추천 종목 선정",
            description=f"스캔 종목: {len(results)}개 | $100 이하 일반주식\n\n{top_summary}",
            color=0x6366F1,
        )

    app_state.last_penny_scan_at = datetime.now()
    app_state.penny_scan_results_cache = results

    if auto_registered and is_market_hours():
        print(
            f"🔄 [Auto-Scan] 신규 종목 {auto_registered} 등록됨 — 장 중 스트림 재시작"
        )
        await _stop_current_stream()
        app_state._current_stream_task = asyncio.create_task(start_alpaca_stream())

    return {
        "scanned_at": app_state.last_penny_scan_at.isoformat(),
        "total_scanned": len(results),
        "scan_params": {
            "max_price": max_price,
            "data_lookback": SCAN_DATA_LOOKBACK,
        },
        "results": results,
        "auto_registered": auto_registered,
    }


# ── 경량 RSI/ATR 계산 헬퍼 ──────────────────────────────────────────────────


def _rsi14_last(df: pd.DataFrame) -> float:
    """RSI-14 마지막 값만 빠르게 계산"""
    try:
        return float(ta.momentum.RSIIndicator(df["Close"], window=14).rsi().iloc[-1])
    except Exception:
        return 50.0


def _atr14_last(df: pd.DataFrame) -> float:
    """ATR-14 마지막 값 경량 계산 — Chandelier Exit TS에 사용"""
    try:
        if len(df) < 2:
            return 0.0
        val = (
            ta.volatility.AverageTrueRange(
                high=df["High"], low=df["Low"], close=df["Close"], window=14
            )
            .average_true_range()
            .iloc[-1]
        )
        return float(val) if not pd.isna(val) else 0.0
    except Exception:
        return 0.0


# ── 1분봉 콜백 ──────────────────────────────────────────────────────────────


async def on_minute_bar_closed(bar):
    """
    Alpaca 1분봉 완성 콜백.

    [Guide-2] 역할 분리:
    - HOLD 포지션 종목 → RSI-14 + 현재가만 계산하는 경량 모니터 경로
    - 미보유 종목 → 기존 run_pulse_engine() 전체 DNA 경로 (발굴·신호 생성)
    """
    app_state._last_bar_received_at = datetime.now()
    ticker_symbol = bar.symbol
    try:
        df_hist = _candle_state.update(ticker_symbol, bar)

        if len(df_hist) < 35:
            return

        # ── avg_daily_volume 지연 초기화 (cold ticker — warm_up을 거치지 않은 신규 유입 종목) ──
        if (
            ticker_symbol not in _candle_state.avg_daily_volume
            and ticker_symbol not in _yf_no_data_cache
        ):
            try:
                tk = yf.Ticker(ticker_symbol)
                daily, yf_1m = await asyncio.gather(
                    asyncio.to_thread(tk.history, period="30d", interval="1d"),
                    asyncio.to_thread(tk.history, period="1d", interval="1m"),
                )

                if not daily.empty:
                    _candle_state.avg_daily_volume[ticker_symbol] = float(
                        daily["Volume"].mean()
                    )
                else:
                    _yf_no_data_cache.add(ticker_symbol)
                    _candle_state.no_data_tickers.add(ticker_symbol)
                    _candle_state.avg_daily_volume[ticker_symbol] = 0.0

                # cold ticker의 IEX 보정 (처음 유입된 종목)
                if "_raw_iex_volume" in df_hist.columns and not yf_1m.empty:
                    iex_total = float(df_hist["_raw_iex_volume"].fillna(0).sum())
                    yf_total = float(yf_1m["Volume"].sum())
                    if iex_total > 0 and yf_total > iex_total:
                        multiplier = min(yf_total / iex_total, 20.0)
                        _candle_state.volume_multiplier[ticker_symbol] = multiplier
                        _candle_state.history[ticker_symbol]["Volume"] = (
                            _candle_state.history[ticker_symbol][
                                "_raw_iex_volume"
                            ].fillna(0)
                            * multiplier
                        )
                        _candle_state.needs_iex_calibration.discard(ticker_symbol)
                        print(
                            f"📊 [VolMul-cold] {ticker_symbol}: {multiplier:.1f}x "
                            f"(IEX→Full Market, {len(df_hist)}봉 소급 보정)"
                        )

                print(
                    f"📈 [AvgVol-lazy] {ticker_symbol}: "
                    f"{_candle_state.avg_daily_volume[ticker_symbol]:,.0f} avg daily shares"
                )
            except Exception as avg_err:
                _candle_state.avg_daily_volume[ticker_symbol] = 0.0
                print(f"⚠️ [AvgVol-lazy] {ticker_symbol}: {avg_err}")

        # ── IEX 거래량 lazy 재보정 ─────────────────────────────────────────────
        # warm_up 시 장 시작 전이거나 yfinance fallback으로 채워진 종목은
        # needs_iex_calibration에 등록됨. IEX 바가 35개 이상 쌓이면 재보정 실행.
        elif (
            ticker_symbol in _candle_state.needs_iex_calibration
            and "_raw_iex_volume" in df_hist.columns
            and df_hist["_raw_iex_volume"].fillna(0).sum() > 0
        ):
            try:
                tk = yf.Ticker(ticker_symbol)
                yf_1m = await asyncio.to_thread(tk.history, period="1d", interval="1m")
                if not yf_1m.empty:
                    # IEX 바 구간의 timestamps만 추출해서 동일 시간대 yfinance 거래량 비교
                    iex_mask = df_hist["_raw_iex_volume"].notna()
                    iex_bars = df_hist[iex_mask]
                    iex_total = float(iex_bars["_raw_iex_volume"].sum())

                    if not iex_bars.empty and iex_total > 0:
                        # 동일 시간대의 yfinance 데이터만 비교 (시간축 정합)
                        yf_1m_utc = yf_1m.copy()
                        if yf_1m_utc.index.tz is None:
                            yf_1m_utc.index = yf_1m_utc.index.tz_localize("UTC")
                        else:
                            yf_1m_utc.index = yf_1m_utc.index.tz_convert("UTC")

                        t_start = iex_bars.index[0]
                        t_end = iex_bars.index[-1]
                        yf_window = yf_1m_utc[
                            (yf_1m_utc.index >= t_start) & (yf_1m_utc.index <= t_end)
                        ]
                        yf_window_total = (
                            float(yf_window["Volume"].sum())
                            if not yf_window.empty
                            else 0
                        )

                        if yf_window_total > iex_total:
                            multiplier = min(yf_window_total / iex_total, 20.0)
                        else:
                            # 시간대 매칭이 안 되면 전체 일봉 비율로 추정
                            yf_total = float(yf_1m["Volume"].sum())
                            multiplier = (
                                min(yf_total / iex_total, 20.0)
                                if yf_total > iex_total
                                else 1.0
                            )

                        if multiplier > 1.05:
                            _candle_state.volume_multiplier[ticker_symbol] = multiplier
                            raw_col = _candle_state.history[ticker_symbol][
                                "_raw_iex_volume"
                            ].fillna(0)
                            _candle_state.history[ticker_symbol]["Volume"] = (
                                raw_col * multiplier
                            )
                            _candle_state.needs_iex_calibration.discard(ticker_symbol)
                            print(
                                f"📊 [VolMul-lazy] {ticker_symbol}: {multiplier:.1f}x 재보정 완료 "
                                f"(IEX {iex_total:,.0f} → Full Market {yf_window_total or yf_1m['Volume'].sum():,.0f})"
                            )
                        else:
                            # 보정값이 너무 낮으면 재시도 대신 제거 (이미 full market 데이터)
                            _candle_state.needs_iex_calibration.discard(ticker_symbol)
                            print(
                                f"ℹ️ [VolMul-lazy] {ticker_symbol}: 보정 불필요 (multiplier={multiplier:.2f})"
                            )
            except Exception as cal_err:
                # 실패 시 set에서 제거해 무한 재시도 방지
                _candle_state.needs_iex_calibration.discard(ticker_symbol)
                print(f"⚠️ [VolMul-lazy] {ticker_symbol}: {cal_err}")

        current_price = float(bar.close)

        # ── 경량 모니터 경로 (HOLD 포지션 전용) ────────────────────────────
        if ticker_symbol in app_state._held_tickers and app_state.paper_engine:
            rsi_val, atr_val = await asyncio.gather(
                asyncio.to_thread(_rsi14_last, df_hist),
                asyncio.to_thread(_atr14_last, df_hist),
            )

            now_et = datetime.now(ZoneInfo("America/New_York"))
            is_eod = now_et.time() >= dtime(15, 30)

            await _manager.broadcast(
                {
                    "ticker": ticker_symbol,
                    "price": current_price,
                    "rsi": round(rsi_val, 2),
                    "signal": "SELL" if is_eod else "HOLD",
                    "strength": "EOD_FORCE" if is_eod else "MONITOR",
                    "dna_score": None,
                }
            )
            await app_state.active_engine.process_signal(
                ticker=ticker_symbol,
                price=current_price,
                signal_type="SELL" if is_eod else "HOLD",
                strength="EOD_FORCE" if is_eod else "MONITOR",
                rsi=rsi_val,
                ai_report="[EOD] 장 마감 강제 청산" if is_eod else "",
                is_armed=app_state.SYSTEM_ARMED,
                dna_score=0.0,
                recommended_weight=0.0,
                atr=atr_val,
                smoothed_er=0.5,
            )
            if app_state.supabase:
                try:
                    chk = await asyncio.to_thread(
                        app_state.supabase.table("paper_positions")
                        .select("ticker")
                        .eq("ticker", ticker_symbol)
                        .execute
                    )
                    if not chk.data:
                        app_state._held_tickers.discard(ticker_symbol)
                except Exception:
                    pass
            return

        # ── 전체 DNA 경로 (신규 발굴 / 미보유 종목) ────────────────────────
        payload = await asyncio.to_thread(run_pulse_engine, ticker_symbol, df_hist)

        # ── 장 외 시간 및 15:00 ET 이후 BUY 차단 (바 타임스탬프 기준) ─────────────────────
        # is_market_hours()에 바 시간을 전달해야 warm_up 재생 바가
        # 장 마감 후 처리될 때 현재 벽시계로 잘못 차단되지 않는다.
        bar_ts = getattr(bar, "timestamp", None)
        is_market_open = is_market_hours(bar_ts)
        is_before_1500 = False
        if bar_ts is not None:
            now_et = bar_ts.astimezone(ZoneInfo("America/New_York"))
        else:
            now_et = datetime.now(ZoneInfo("America/New_York"))
        if (now_et.hour * 60 + now_et.minute) < (15 * 60):
            is_before_1500 = True

        if payload.get("signal") == "BUY" and (
            not is_market_open or not is_before_1500
        ):
            reason = (
                "장외 시간 BUY 차단"
                if not is_market_open
                else "15:00 ET 이후 신규 진입 차단"
            )
            if app_state.supabase and payload.get("strength") == "STRONG":
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": ticker_symbol,
                                "gate": "MARKET_HOURS",
                                "outcome": "BLOCKED",
                                "signal": "BUY",
                                "dna_score": float(payload.get("dna_score", 0)),
                                "rsi": float(payload.get("rsi", 0)),
                                "rvol": float(payload.get("rvol", 0)),
                                "price": float(payload.get("price", 0)),
                                "note": reason,
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            payload["signal"] = "HOLD"
            payload["strength"] = "NORMAL"

        # ── 미보유 종목 SELL 스킵 ─────────────────────────────────────────
        # 포지션 없는 종목의 SELL 신호는 process_signal에 전달해도 아무 것도 안 되지만
        # DB 조회 비용이 있으므로 여기서 차단
        if (
            payload.get("signal") == "SELL"
            and ticker_symbol not in app_state._held_tickers
        ):
            await _manager.broadcast(payload)
            print(
                f"⚡ [Alpaca Stream] {ticker_symbol} processed: {payload.get('signal')} ({payload.get('strength')}) | vol_mul={payload.get('volume_multiplier', 1.0):.1f}x"
            )
            return

        # ── Momentum Interceptor ──────────────────────────────────────────
        if payload.get("signal") == "BUY" and payload.get("strength") == "STRONG":
            is_valid, reject_reason = _momentum_validator.validate(
                ticker=ticker_symbol,
                current_price=payload.get("price", 0.0),
                rvol=payload.get("rvol", 1.0),
                dna_score=float(payload.get("dna_score", 0.0)),
            )
            if not is_valid:
                print(f"🛡️ [Interceptor] {ticker_symbol} 매수 차단: {reject_reason}")
                if app_state.supabase:
                    try:
                        await asyncio.to_thread(
                            app_state.supabase.table("engine_decisions")
                            .insert(
                                {
                                    "ticker": ticker_symbol,
                                    "gate": "MOMENTUM_VALIDATOR",
                                    "outcome": "BLOCKED",
                                    "signal": "BUY",
                                    "dna_score": float(payload.get("dna_score", 0)),
                                    "rsi": float(payload.get("rsi", 0)),
                                    "rvol": float(payload.get("rvol", 0)),
                                    "price": float(payload.get("price", 0)),
                                    "note": reject_reason,
                                }
                            )
                            .execute
                        )
                    except Exception:
                        pass
                payload["signal"] = "HOLD"
                payload["strength"] = "NORMAL"
                payload["ai_report"] = (
                    f"⛔ [진입 보류] {reject_reason}\n\n" + payload.get("ai_report", "")
                )
        # ─────────────────────────────────────────────────────────────────

        await _manager.broadcast(payload)

        if app_state.supabase:
            try:
                try:
                    allowed_keys = {
                        "ticker",
                        "indicator",
                        "value",
                        "rsi",
                        "macd_line",
                        "macd_signal",
                        "macd_diff",
                        "adx",
                        "rvol",
                        "volatility_ann",
                        "vol_weight",
                        "kelly_f",
                        "recommended_weight",
                        "price",
                        "signal",
                        "strength",
                        "ai_report",
                        "timestamp",
                        "dna_score",
                        "smoothed_er",
                    }
                    db_payload = {k: v for k, v in payload.items() if k in allowed_keys}
                    await asyncio.to_thread(
                        app_state.supabase.table("realtime_signals")
                        .insert(db_payload)
                        .execute
                    )
                except Exception as db_err:
                    print(f"❌ [realtime_signals] insert failed: {db_err}")

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
                    await _webhook.send_alert(
                        use_dev=True, title=title, description=desc, color=color
                    )

                dna_val = float(payload.get("dna_score", 0.0))
                price_val = float(payload.get("price", 0.0))
                prev_price = (
                    df_hist["Close"].iloc[-2] if len(df_hist) >= 2 else price_val
                )
                change_pct = (
                    ((price_val / prev_price - 1) * 100) if prev_price > 0 else 0.0
                )
                volume_val = int(df_hist["Volume"].iloc[-1]) if len(df_hist) >= 1 else 0
                try:
                    import math as _math

                    _vol_ann = float(payload.get("volatility_ann") or 0.0)
                    _atr_pct = (
                        round(_vol_ann / _math.sqrt(252), 4) if _vol_ann > 0 else 0.0
                    )
                    await asyncio.to_thread(
                        app_state.supabase.table("daily_discovery")
                        .upsert(
                            {
                                "ticker": ticker_symbol,
                                "dna_score": int(round(dna_val)),
                                "price": price_val,
                                "change": str(round(change_pct, 2)),
                                "change_percent": round(change_pct, 2),
                                "volume": str(volume_val),
                                "updated_at": datetime.now().isoformat(),
                                "rsi": payload.get("rsi"),
                                "rvol": payload.get("rvol"),
                                "adx": payload.get("adx"),
                                "macd_diff": payload.get("macd_diff"),
                                "macd_diff_prev": payload.get("macd_diff_prev"),
                                "di_positive": payload.get("di_positive"),
                                "is_extended": payload.get("is_extended"),
                                "atr_pct": _atr_pct,
                            },
                            on_conflict="ticker",
                        )
                        .execute
                    )
                except Exception as dd_err:
                    print(
                        f"⚠️ [daily_discovery] upsert skipped for {ticker_symbol}: {dd_err}"
                    )

                if app_state.active_engine:
                    await app_state.active_engine.process_signal(
                        ticker=ticker_symbol,
                        price=payload.get("price"),
                        signal_type=payload.get("signal"),
                        strength=payload.get("strength"),
                        rsi=payload.get("rsi"),
                        ai_report=payload.get("ai_report", ""),
                        is_armed=app_state.SYSTEM_ARMED,
                        dna_score=dna_val,
                        recommended_weight=float(
                            payload.get("recommended_weight", 0.0)
                        ),
                        atr=float(payload.get("atr", 0.0)),
                        smoothed_er=float(payload.get("smoothed_er", 0.5)),
                    )
                    if (
                        payload.get("signal") == "BUY"
                        and payload.get("strength") == "STRONG"
                        and app_state.SYSTEM_ARMED
                        and dna_val >= (60 if current_price <= 1.0 else 75)
                    ):
                        app_state._held_tickers.add(ticker_symbol)

                print(
                    f"⚡ [Alpaca Stream] {ticker_symbol} processed: {payload.get('signal')} ({payload.get('strength')}) | vol_mul={payload.get('volume_multiplier', 1.0):.1f}x"
                )

            except Exception as service_err:
                print(f"⚠️ Service Integration Error for {ticker_symbol}: {service_err}")

    except Exception as e:
        print(f"❌ Pulse Stream Error for {ticker_symbol}: {e}")
    finally:
        gc.collect()


# ── 스트림 / 폴링 ────────────────────────────────────────────────────────────


async def start_rest_polling(tickers: Optional[List[str]] = None):
    """REST API 폴링 모드 — WebSocket 비활성화 또는 connection limit 시 60초 주기"""
    from alpaca.data.requests import StockBarsRequest

    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    if not api_key or not api_secret:
        print("❌ [REST Polling] Alpaca API Key missing.")
        return

    active_tickers = tickers
    if not active_tickers:
        discovery_tickers = await asyncio.to_thread(_db.get_active_tickers, limit=30)
        # HOLD 중인 포지션이 daily_discovery 순위 밖으로 밀려나도 반드시 폴링 대상에
        # 포함해야 한다 — 그렇지 않으면 current_price가 진입가에 고정된다.
        active_tickers = list(set(discovery_tickers) | app_state._held_tickers)

    if not active_tickers:
        print("⚠️ [REST Polling] No active tickers. Standby.")
        return

    await _candle_state.warm_up(active_tickers)

    client = StockHistoricalDataClient(api_key, api_secret)
    last_processed: Dict[str, object] = {}

    print(f"📡 [REST Polling] 60s 폴링 시작 — {active_tickers}")

    while True:
        if not is_market_hours():
            now_et = datetime.now(ZoneInfo("America/New_York"))
            open_min = 9 * 60 + 30
            cur_min = now_et.hour * 60 + now_et.minute
            if cur_min < open_min:
                wait_sec = (open_min - cur_min) * 60
                print(f"⏰ [REST Polling] 개장까지 {wait_sec // 60}분 대기...")
                await asyncio.sleep(min(wait_sec, 300))
            else:
                print("🌙 [REST Polling] 폐장. 내일 재시작 대기...")
                await asyncio.sleep(3600)
            continue

        try:
            now_et = datetime.now(ZoneInfo("America/New_York"))
            start_time = now_et - timedelta(minutes=3)

            request = StockBarsRequest(
                symbol_or_symbols=active_tickers,
                timeframe=TimeFrame.Minute,
                start=start_time,
                feed=DataFeed.IEX,
            )
            bars_response = await asyncio.to_thread(client.get_stock_bars, request)

            processed_count = 0
            for symbol, bar_list in bars_response.data.items():
                for bar in bar_list:
                    bar_ts = bar.timestamp
                    last_ts = last_processed.get(symbol)
                    if last_ts is None or bar_ts > last_ts:
                        last_processed[symbol] = bar_ts
                        await on_minute_bar_closed(bar)
                        processed_count += 1

            if processed_count:
                print(f"⚡ [REST Polling] {processed_count}개 봉 처리 완료")

        except Exception as e:
            print(f"⚠️ [REST Polling] Error: {e}")

        await asyncio.sleep(60)


async def start_alpaca_stream(tickers: Optional[List[str]] = None):
    """Alpaca WebSocket 스트림 데몬 시작"""
    if os.getenv("DISABLE_ALPACA_STREAM", "false").lower() == "true":
        print("🔌 [Pulse Engine] WebSocket 비활성화 — REST Polling 모드로 전환합니다.")
        await start_rest_polling(tickers)
        return
    print("📡 [Pulse Engine] Initializing Event-Driven Stream...")

    active_tickers = tickers

    try:
        if not active_tickers:
            discovery_tickers = await asyncio.to_thread(
                _db.get_active_tickers, limit=30
            )
            # 현재 HOLD 중인 포지션은 daily_discovery 순위 밖으로 밀려나도
            # 반드시 구독을 유지해야 current_price가 갱신된다 (그렇지 않으면
            # 평가 손익이 진입가에 고정되어 항상 +$0.00으로 표시됨).
            active_tickers = list(set(discovery_tickers) | app_state._held_tickers)

        if not active_tickers:
            print("⚠️ No active tickers to monitor. Pulse engine standby.")
            if app_state.supabase:
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": "__SYSTEM__",
                                "gate": "NO_TICKERS",
                                "outcome": "BLOCKED",
                                "note": "daily_discovery가 비어있어 스트림 구독 대상 없음 — Pulse engine standby",
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            return

        if active_tickers:
            await _candle_state.warm_up(active_tickers)

        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")

        if not api_key or not api_secret:
            print("❌ Alpaca API Key missing. Stream cannot start.")
            if app_state.supabase:
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": "__SYSTEM__",
                                "gate": "API_KEY_MISSING",
                                "outcome": "BLOCKED",
                                "note": "APCA_API_KEY_ID 또는 APCA_API_SECRET_KEY 미설정",
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            return

        stream = StockDataStream(api_key, api_secret, feed=DataFeed.IEX)
        app_state._current_ws_stream = stream

        stream.subscribe_bars(on_minute_bar_closed, *active_tickers)

        print(f"🚀 [Pulse Engine] Live: Monitoring {active_tickers}")

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
                    auth_failure_count = 0
                    await asyncio.sleep(30)

        try:
            await _guarded_run_forever()
        finally:
            try:
                await stream.close()
            except Exception:
                pass
            if app_state._current_ws_stream is stream:
                app_state._current_ws_stream = None

    except Exception as e:
        error_msg = f"❌ Alpaca Stream Lifecycle Error: {e}"
        print(error_msg)
        if _webhook:
            await _webhook.send_alert(
                use_dev=True,
                title="[CRITICAL] Pulse Engine Stream Offline",
                description=f"스트림 엔진에 치명적 오류가 발생했습니다.\nError: {e}",
                color=0xFF0000,
            )
        if "connection limit" in str(e).lower():
            print("⏳ Connection limit — REST Polling 폴백으로 즉시 전환...")
            if is_market_hours():
                # _current_stream_task를 갱신하지 않으면 _stop_current_stream()이
                # 이 폴링 루프를 절대 취소할 수 없어 재시도할 때마다 폴링 루프가
                # 고아 상태로 누적되고, 결국 Alpaca Data API 요청이 겹쳐 429가 발생한다.
                app_state._current_stream_task = asyncio.create_task(
                    start_rest_polling(active_tickers)
                )
            await asyncio.sleep(300)
            if is_market_hours():
                app_state._current_stream_task = asyncio.create_task(
                    start_alpaca_stream(active_tickers)
                )
        else:
            wait_sec = 60
            print(f"⏳ {wait_sec}초 후 재연결 시도...")
            await asyncio.sleep(wait_sec)
            if is_market_hours():
                app_state._current_stream_task = asyncio.create_task(
                    start_alpaca_stream(active_tickers)
                )
            else:
                print("🌙 [Pulse] 시장 폐장 — 스트림 재시작 스킵 (스냅샷 모드 유지)")


# ── 스케줄러 ─────────────────────────────────────────────────────────────────


async def mtf_cache_scheduler():
    """15분 주기로 Watchlist 종목들의 15분봉 20 EMA를 캐싱"""
    print("🛡️ [Scheduler] MTF Cache Scheduler started.")
    await asyncio.sleep(10)

    while True:
        try:
            if is_market_hours():
                held = list(app_state._held_tickers)
                watching = await asyncio.to_thread(_db.get_active_tickers, limit=30)
                active_tickers = list(set(held) | set(watching))

                await _mtf_cache.update_cache(active_tickers)
        except Exception as e:
            print(f"⚠️ [Scheduler] MTF Cache Error: {e}")

        await asyncio.sleep(900)


async def auto_quant_scan_scheduler():
    """서버 시작 시 즉시 + 이후 4시간 주기로 퀀트 스캔 자동 실행 ($100 이하 일반주식)."""
    await asyncio.sleep(30)

    while True:
        try:
            print(f"📡 [Auto-Scan] 자동 퀀트 스캔 시작 (자동 퀀트 스캔)")
            await run_quant_scan_internal()
            print("✅ [Auto-Scan] 퀀트 스캔 완료 — 다음 실행까지 4시간 대기")
        except Exception as e:
            print(f"⚠️ [Auto-Scan] 스캔 중 오류: {e}")

        await asyncio.sleep(2 * 3600)


async def auto_paper_history_cleanup_scheduler():
    """paper_history 누적 방지 스케줄러.
    HISTORY_RETENTION_DAYS 경과한 청산 이력을 매일 1회 삭제한다.
    """
    HISTORY_RETENTION_DAYS = 90
    print("🧹 [Scheduler] Paper History Cleanup Scheduler started.")

    while True:
        try:
            if app_state.supabase:
                threshold = (
                    datetime.now(timezone.utc) - timedelta(days=HISTORY_RETENTION_DAYS)
                ).isoformat()
                res = await asyncio.to_thread(
                    app_state.supabase.table("paper_history")
                    .delete()
                    .lt("closed_at", threshold)
                    .execute
                )
                deleted = len(res.data) if res and res.data else 0
                if deleted > 0:
                    print(
                        f"🧹 [Auto-Cleanup] paper_history 정리 완료: {HISTORY_RETENTION_DAYS}일 경과 {deleted}건 삭제"
                    )
        except Exception as e:
            print(f"⚠️ [Auto-Cleanup] paper_history 정리 오류: {e}")

        await asyncio.sleep(24 * 3600)


async def _stop_current_stream():
    """현재 실행 중인 Alpaca 스트림 태스크를 취소하고 종료를 기다린다."""
    task: asyncio.Task = app_state._current_stream_task  # type: ignore[assignment]
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    app_state._current_stream_task = None


async def stream_scheduler():
    """개장 시간을 감지해 Alpaca 스트림을 자동 시작/종료하는 스케줄러."""
    was_market_open = False

    while True:
        now_open = is_market_hours()

        if now_open and not was_market_open:
            print(
                "🔔 [Scheduler] 개장 감지 — DB에서 최신 watchlist 로드 후 스트림 시작"
            )
            app_state._current_stream_task = asyncio.create_task(start_alpaca_stream())
            was_market_open = True

        elif not now_open and was_market_open:
            print("🌙 [Scheduler] 폐장 감지 — 스트림 종료")
            await _stop_current_stream()
            was_market_open = False

        elif not now_open and not was_market_open:
            now_et = datetime.now(ZoneInfo("America/New_York"))
            open_min = 9 * 60 + 30
            cur_min = now_et.hour * 60 + now_et.minute
            mins_to_open = open_min - cur_min
            if 0 < mins_to_open <= 60:
                print(f"⏰ [Scheduler] 개장 {mins_to_open}분 전 대기 중...")

        await asyncio.sleep(60)


async def paper_portfolio_updater():
    """주기적으로 paper_portfolio (Alpha Fund 수동 포트폴리오)의 현재가와 PnL을 업데이트하는 백그라운드 태스크"""
    import yfinance as yf

    print("📈 [Portfolio Updater] Started paper_portfolio live sync task.")
    while True:
        try:
            if not app_state.supabase:
                await asyncio.sleep(15)
                continue

            if not is_market_hours():
                # 장외 시간엔 폴링 주기를 길게 (60초)
                await asyncio.sleep(60)
                continue

            res = await asyncio.to_thread(
                app_state.supabase.table("paper_portfolio")
                .select("*")
                .eq("status", "OPEN")
                .execute
            )
            positions = res.data
            if not positions:
                await asyncio.sleep(15)
                continue

            tickers = list(set([p["ticker"] for p in positions]))
            tickers_str = " ".join(tickers)

            tickers_data = await asyncio.to_thread(
                yf.download,
                tickers_str,
                period="1d",
                interval="1m",
                progress=False,
                threads=True,
            )

            if tickers_data is not None and not tickers_data.empty:
                close_col = tickers_data.get("Close")
                if close_col is not None and not close_col.empty:
                    last_prices = {}
                    if isinstance(close_col, pd.Series):
                        if len(tickers) == 1:
                            last_prices[tickers[0]] = float(close_col.iloc[-1])
                    else:
                        last_row = close_col.iloc[-1]
                        for ticker in tickers:
                            if ticker in last_row.index and pd.notna(last_row[ticker]):
                                last_prices[ticker] = float(last_row[ticker])

                    for pos in positions:
                        ticker = pos["ticker"]
                        if ticker in last_prices:
                            current_price = last_prices[ticker]
                            entry_price = float(pos["entry_price"])
                            pnl_percent = round(
                                (current_price / entry_price - 1) * 100, 2
                            )

                            # Only update if the price has changed
                            if (
                                abs(
                                    float(pos.get("current_price") or 0) - current_price
                                )
                                > 0.0001
                            ):
                                await asyncio.to_thread(
                                    app_state.supabase.table("paper_portfolio")
                                    .update(
                                        {
                                            "current_price": round(current_price, 4),
                                            "pnl_percent": pnl_percent,
                                            "updated_at": datetime.now().isoformat(),
                                        }
                                    )
                                    .eq("id", pos["id"])
                                    .execute
                                )
        except Exception as e:
            print(f"⚠️ [Portfolio Updater] Error: {e}")

        await asyncio.sleep(10)  # 10초 주기 업데이트


async def stream_liveness_watchdog():
    """3분 주기로 Alpaca WebSocket 생존 여부를 확인."""
    STALE_THRESHOLD_SEC = 300
    CHECK_INTERVAL_SEC = 180
    print("🛡️ [Liveness] Stream watchdog started.")
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SEC)
        if not is_market_hours():
            continue
        if app_state._last_bar_received_at is None:
            continue
        elapsed = (datetime.now() - app_state._last_bar_received_at).total_seconds()
        if elapsed > STALE_THRESHOLD_SEC:
            print(
                f"⚠️ [Liveness] No bar received for {elapsed:.0f}s — forcing stream reconnect."
            )
            if app_state._current_ws_stream is not None:
                try:
                    await app_state._current_ws_stream.close()
                except Exception:
                    pass
            discovery_tickers = await asyncio.to_thread(
                _db.get_active_tickers, limit=15
            )
            active_tickers = list(set(discovery_tickers) | app_state._held_tickers)
            if active_tickers:
                asyncio.create_task(start_alpaca_stream(active_tickers))


async def system_heartbeat():
    """10분 주기 시스템 상태 보고 (Dead Man's Switch)"""
    print("💓 [Heartbeat] System Monitor Started.")
    while True:
        try:
            await asyncio.sleep(600)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            await _webhook.send_alert(
                use_dev=True,
                title="[HEARTBEAT] System Healthy",
                description=(
                    f"시간: {now}\n상태: Active Monitoring\n"
                    f"연결된 웹소켓: {len(_manager.active_connections)}개"
                ),
                color=0x3498DB,
            )
            print(f"💓 [Heartbeat] Pulse sent at {now}")
        except Exception as e:
            print(f"⚠️ Heartbeat error: {e}")


# ── Watchdog 프로세스 ────────────────────────────────────────────────────────
_WATCHDOG_PID_FILE = os.path.join(os.path.dirname(__file__), ".watchdog.pid")


def _spawn_watchdog_if_not_running() -> None:
    """PID 파일로 중복 spawn을 방지하며 watchdog 프로세스를 기동한다."""
    watchdog_path = os.path.join(os.path.dirname(__file__), "watchdog.py")

    if os.path.exists(_WATCHDOG_PID_FILE):
        try:
            with open(_WATCHDOG_PID_FILE) as f:
                existing_pid = int(f.read().strip())
            os.kill(existing_pid, 0)
            check = subprocess.run(
                ["ps", "-p", str(existing_pid), "-o", "args="],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if check.returncode != 0 or "watchdog.py" not in check.stdout:
                raise OSError(
                    f"PID {existing_pid} recycled to unrelated process — respawning watchdog"
                )
            print(
                f"🐕 [Startup] Watchdog already running (PID {existing_pid}). Skipping spawn."
            )
            return
        except (ValueError, OSError):
            pass
        except subprocess.TimeoutExpired:
            pass

    try:
        proc = subprocess.Popen(
            [sys.executable, watchdog_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        with open(_WATCHDOG_PID_FILE, "w") as f:
            f.write(str(proc.pid))
        print(f"🐕 [Startup] Watchdog daemon started (PID {proc.pid}).")
    except Exception as e:
        print(f"⚠️ [Startup] Failed to start Watchdog: {e}")


# ── Startup ──────────────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup_event():
    print("🎬 [Startup] MuzeBIZ Realtime Platform initializing...")
    _spawn_watchdog_if_not_running()
    asyncio.create_task(run_startup_sequence())
    asyncio.create_task(stream_liveness_watchdog())
    asyncio.create_task(paper_portfolio_updater())


@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 [Shutdown] Stopping streams gracefully...")
    await _stop_current_stream()
    if app_state._current_ws_stream:
        try:
            await app_state._current_ws_stream.close()
        except Exception as e:
            print(f"⚠️ [Shutdown] Error closing stream: {e}")

    if hasattr(app_state, "_trade_update_task") and app_state._trade_update_task:
        task = app_state._trade_update_task
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


async def run_startup_sequence():
    """초기화 시퀀스: 워밍업 후 스냅샷 펄스 방출 및 스트림 시작"""
    supabase = app_state.supabase

    # 0a. DB에서 ARMED 상태 복원
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
                app_state.SYSTEM_ARMED = bool(res.data["is_armed"])
                print(
                    f"📡 [Startup] SYSTEM_ARMED restored from DB: {app_state.SYSTEM_ARMED}"
                )
        except Exception as e:
            if "PGRST204" in str(e) or "is_armed" in str(e):
                print(
                    "⚠️ [Startup] is_armed column not found. Apply migration to enable ARM persistence."
                )
            else:
                print(f"⚠️ [Startup] Could not restore ARM state: {e}")

    # 0b. 페이퍼 트레이딩 계좌 초기화
    if app_state.paper_engine:
        await app_state.paper_engine.initialize_account()

    # 0c. 기존 HOLD 포지션을 _held_tickers에 로드
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
                    app_state._held_tickers.add(row["ticker"])
                print(
                    f"📌 [Guide-2] Restored {len(app_state._held_tickers)} HOLD tickers to monitor set: "
                    f"{sorted(app_state._held_tickers)}"
                )
        except Exception as e:
            print(f"⚠️ [Guide-2] Could not restore held tickers: {e}")

    active_tickers = await asyncio.to_thread(_db.get_active_tickers, limit=15)

    # 1. 히스토리 워밍업
    if active_tickers:
        await _candle_state.warm_up(active_tickers)

    # 1-2. MTF 캐시 초기 프리워밍 (스냅샷 및 스트림 시작 전에 완벽히 장전)
    print("🔄 [Startup] Pre-warming MTF Cache for 15m 20 EMA...")
    try:
        initial_mtf_tickers = list(set(app_state._held_tickers) | set(active_tickers))
        if initial_mtf_tickers:
            await _mtf_cache.update_cache(initial_mtf_tickers)
    except Exception as e:
        print(f"⚠️ [Startup] MTF Cache pre-warm failed: {e}")

    # 2. 스냅샷 펄스 1회 방출
    print("📸 [Startup] Emitting initial snapshot pulses...")
    for ticker in active_tickers:
        if ticker in _candle_state.history and not _candle_state.history[ticker].empty:
            df = _candle_state.history[ticker]
            try:
                payload = await asyncio.to_thread(run_pulse_engine, ticker, df)
                payload["indicator"] = "Snapshot (Last Close)"
                payload["data_source"] = (
                    "alpaca_iex"
                    if ticker in _candle_state.volume_multiplier
                    else "yfinance_snapshot"
                )

                await _manager.broadcast(payload)

                if supabase:
                    try:
                        allowed_keys = {
                            "ticker",
                            "indicator",
                            "value",
                            "rsi",
                            "macd_line",
                            "macd_signal",
                            "macd_diff",
                            "adx",
                            "rvol",
                            "volatility_ann",
                            "vol_weight",
                            "kelly_f",
                            "recommended_weight",
                            "price",
                            "signal",
                            "strength",
                            "ai_report",
                            "timestamp",
                            "dna_score",
                        }
                        db_payload = {
                            k: v for k, v in payload.items() if k in allowed_keys
                        }

                        await asyncio.to_thread(
                            supabase.table("realtime_signals")
                            .insert(db_payload)
                            .execute
                        )
                        print(f"💾 Snapshot for {ticker} saved to DB.")
                    except Exception as db_err:
                        print(f"⚠️ Initial pulse for {ticker} failed: {db_err}")
            except Exception as e:
                print(f"⚠️ Initial pulse for {ticker} failed: {e}")

    # 3. 실시간 스트림, 하트비트, 자동 스캔 스케줄러 시작
    asyncio.create_task(system_heartbeat())
    asyncio.create_task(stream_scheduler())
    asyncio.create_task(auto_quant_scan_scheduler())

    # MTF 캐시 주기적 갱신 스케줄러 시작 (프리워밍은 1-2 단계에서 완료)
    asyncio.create_task(mtf_cache_scheduler())

    # paper_history 누적 방지 자동 정리 스케줄러 시작
    asyncio.create_task(auto_paper_history_cleanup_scheduler())

    # 실거래 모드: Alpaca Trade Update 스트림 기동
    if app_state.TRADE_MODE == "LIVE" and app_state.live_engine is not None:
        from live_engine import start_trade_update_stream

        app_state._trade_update_task = asyncio.create_task(
            start_trade_update_stream(
                api_key=_APCA_API_KEY,
                api_secret=_APCA_API_SECRET,
                webhook_manager=app_state.webhook,
            )
        )


# ── 진입점 ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
