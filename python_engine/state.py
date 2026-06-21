"""
state.py — AppState 공유 전역 상태 컨테이너

모든 라우터와 main.py에서 `from state import app_state` 로 접근한다.
초기화는 main.py의 startup_event 또는 module import 시점에 수행된다.
"""

from __future__ import annotations

from typing import List, Optional


class AppState:
    """전역 런타임 상태를 단일 인스턴스로 관리."""

    # ── 자동 매매 플래그 ────────────────────────────────────────────────
    SYSTEM_ARMED: bool = False

    # ── 외부 클라이언트 ─────────────────────────────────────────────────
    supabase = None  # supabase.Client
    paper_engine = None  # PaperTradingManager
    trading_client = None  # alpaca TradingClient
    webhook = None  # WebhookManager
    db = None  # DBManager

    # ── WebSocket 브로드캐스터 ──────────────────────────────────────────
    manager = None  # ConnectionManager (main.py에서 주입)

    # ── 1분봉 히스토리 상태 ─────────────────────────────────────────────
    candle_state = None  # TickerDataState (main.py에서 주입)

    # ── Penny 스캔 상태 ─────────────────────────────────────────────────
    last_penny_scan_at: Optional[object] = None  # datetime | None
    penny_scan_results_cache: List[dict] = []

    # ── Alpaca 스트림 태스크 참조 ────────────────────────────────────────
    _current_stream_task = None  # asyncio.Task | None
    _current_ws_stream = None  # StockDataStream | None
    _last_bar_received_at = None  # datetime | None

    # ── 경량 모니터 경로용 HOLD 포지션 셋 (DB 조회 없이 O(1) 분기) ─────
    _held_tickers: set = None  # type: ignore

    def __init__(self):
        self._held_tickers = set()
        self.penny_scan_results_cache = []


# 단일 공유 인스턴스
app_state = AppState()
