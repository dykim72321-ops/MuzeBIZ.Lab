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

    # ── 매매 모드 ("PAPER" | "LIVE") ────────────────────────────────────
    TRADE_MODE: str = "PAPER"

    # ── 외부 클라이언트 ─────────────────────────────────────────────────
    supabase = None  # supabase.Client
    paper_engine = None  # PaperTradingManager
    live_engine = None  # LiveTradingManager (TRADE_MODE=LIVE 시 초기화)
    trading_client = None  # alpaca TradingClient
    webhook = None  # WebhookManager
    db = None  # DBManager

    @property
    def active_engine(self):
        """현재 TRADE_MODE에 따라 활성 엔진을 반환."""
        if self.TRADE_MODE == "LIVE" and self.live_engine is not None:
            return self.live_engine
        return self.paper_engine

    # ── WebSocket 브로드캐스터 ──────────────────────────────────────────
    manager = None  # ConnectionManager (main.py에서 주입)

    # ── 1분봉 히스토리 상태 ─────────────────────────────────────────────
    candle_state = None  # TickerDataState (main.py에서 주입)

    # ── Penny 스캔 상태 ─────────────────────────────────────────────────
    last_penny_scan_at: Optional[object] = None  # datetime | None
    # 자동 스캔 스케줄러의 실제 다음 실행 예정 시각 (datetime | None).
    # last_penny_scan_at은 수동 스캔으로도 갱신되므로, 상태 표시가 이 값 대신
    # last_penny_scan_at 기준으로 남은 시간을 계산하면 실제 스케줄과 어긋난다.
    next_auto_scan_at: Optional[object] = None
    penny_scan_results_cache: List[dict] = []

    # ── MTF 캐시 (15분봉 20 EMA) ───────────────────────────────────────
    mtf_cache = None  # MTFCache (main.py에서 주입)

    # ── STRONG BUY 직전 RVOL·상위 추세 검증기 ───────────────────────────
    momentum_validator = None  # MomentumValidator (main.py에서 주입)

    # ── 세션 내 데이터 없음(상장폐지/OTC) 종목 캐시 ──────────────────────
    # core/quant_scanner.py(일봉 스캔)와 market/alpaca_stream.py(콜드스타트 조회)가
    # 공유한다 — 한쪽에서 학습한 no-data 티커를 다른 쪽도 재조회하지 않도록.
    yf_no_data_cache: set = set()

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
