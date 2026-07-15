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
import os

from alpaca.trading.client import TradingClient
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

from infra.db_manager import DBManager
from engine.paper_engine import PaperTradingManager
from state import app_state
from utils.utils import (
    is_market_hours,
)  # noqa: F401 — 하위 호환 재노출 (test_pipeline.py 등)
from infra.webhook_manager import WebhookManager

# ── 환경변수 로드 (TRADE_MODE 등을 참조하기 전에 반드시 먼저 로드) ────────────
load_dotenv()

_TRADE_MODE = os.getenv("TRADE_MODE", "PAPER").upper()
app_state.TRADE_MODE = _TRADE_MODE

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
app_state.momentum_validator = _momentum_validator

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
    from engine.live_engine import LiveTradingManager

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

from api.routes import router as core_router
from api.websocket import router as ws_router

app.include_router(core_router)
app.include_router(ws_router)
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

# ── 분리된 핵심 로직 (core/market/schedulers) ────────────────────────────────
from core.pulse import run_pulse_engine  # noqa: E402
from schedulers.tasks import (  # noqa: E402
    mtf_cache_scheduler,
    auto_quant_scan_scheduler,
    auto_paper_history_cleanup_scheduler,
    auto_checklist_eval_scheduler,
    _stop_current_stream,
    stream_scheduler,
    paper_portfolio_updater,
    stream_liveness_watchdog,
    system_heartbeat,
    _spawn_watchdog_if_not_running,
)


# ── 루트 엔드포인트 ──────────────────────────────────────────────────────────
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

    # 실계좌 전환 체크리스트 매일 검증 스케줄러 시작
    asyncio.create_task(auto_checklist_eval_scheduler())

    # 실거래 모드: Alpaca Trade Update 스트림 기동
    if app_state.TRADE_MODE == "LIVE" and app_state.live_engine is not None:
        from engine.live_engine import start_trade_update_stream

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
