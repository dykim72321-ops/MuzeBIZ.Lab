from supabase import Client
from infra.webhook_manager import WebhookManager
import asyncio
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

_NY_TZ = ZoneInfo(
    "America/New_York"
)  # 모듈 레벨 캐시 — ZoneInfo는 호출마다 재생성 불필요

INITIAL_CAPITAL = 100000.0

# ── 포지션 사이징 / 리스크 상수 ──────────────────────────────────────────────
MIN_BUY_BUDGET = (
    100.0  # 최소 주문 금액 (달러) - 초소형 파편화 거래 방지 (기존 10.0에서 상향)
)
MAX_BUY_BUDGET = 5000.0  # 종목당 최대 매수 금액 (달러) — MAX_BUY_BUDGET × MAX_CONCURRENT = 총 배포 상한
# Kelly 15% × $100k = $15k → MAX_BUY_BUDGET $5k 캡으로 실질 포지션당 $5k 고정
# $5k × 15 = $75k = MAX_CONCENTRATION 75% → 내부 수학 완결
MAX_CONCURRENT_POSITIONS = 20  # 동시 보유 최대 종목 수 (실질 도달 가능 상한)
MAX_CONCENTRATION_PCT = 0.75  # 총 자산 대비 투입 비중 상한 (75%)
TS_INIT_PCT = 0.90  # 초기 트레일링 스탑: 진입가 × 90% (-10%, 손실 포지션 빠른 탈출)
TS_TRAIL_PCT = 0.95  # 최고가 갱신 시 TS 추적 비율: highest × 95%
SCALE_OUT_RATIO = 0.50  # Scale-Out 시 매도 비율 (50%)
SCALE_OUT_TS_PCT = 1.01  # Scale-Out 후 TS 본절 + 1%
POS_WEIGHT = 0.15  # paper_positions.weight 기록값

# ── Penny Lab 전용 파라미터 ($1 이하 종목 동적 적용) ─────────────────────────
PENNY_MAX_PRICE = 1.0  # 진입가 ≤ 이 값이면 페니 파라미터 자동 전환
PENNY_TS_INIT_PCT = 0.85  # 초기 TS: 진입가 × 85% (-15%)
PENNY_TS_TRAIL_PCT = 0.90  # 최고가 추종 TS: highest × 90%
PENNY_BREAKEVEN_TRIGGER = 1.10  # 수익 +10% 달성 시 TS 하한을 진입가(본전)로 락인
PENNY_SCALE_OUT_RSI = 60  # 1차 매도 RSI 기준 (일반 52 → 페니 60)
PENNY_SCALE_OUT_PROFIT = 0.10  # 1차 매도 수익률 기준 (+10% OR RSI>65)
PENNY_TIGHT_TS_PCT = 0.95  # Scale-Out 후 잔여 물량 TS: highest × 95% (-5%)
SCALE_OUT_COOLDOWN_BARS = 3  # Scale-Out 후 최소 3봉(분) 동안 TS 체크 유예

# ── 오버트레이딩(Whipsaw) 방지 파라미터 ──────────────────────────────────────
MAX_DAILY_TRADES_PER_TICKER = (
    2  # 종목당 하루 신규 진입(라운드트립) 최대 횟수 — Scale-Out 부분청산은 제외
)
VOLATILITY_MAX_RATIO = (
    0.05  # 일반 종목: ATR/가격 비율이 이보다 크면 단기 과열/휩쏘로 판단해 진입 차단
)
PENNY_VOLATILITY_MAX_RATIO = 0.08  # 페니 종목: 원래 변동성이 커서 상한을 완화

KELLY_CACHE_TTL_SEC = (
    3600  # Kelly 통계(p/b/raw_kelly) 캐시 유효 시간 — ATR 페널티는 캐시 대상이 아님
)

# ── Chandelier Exit 파라미터 ──────────────────────────────────────────────────
# 고정 % TS 대신 ATR 기반으로 스탑 라인을 설정 → 변동성 높은 1분봉 스탑헌팅 내성 강화
# 공식: TS = Highest - k × ATR(14)
# ATR이 클수록 스탑이 내려가(더 여유롭게) 마켓메이커 노이즈를 필터링
CHANDELIER_K_NORMAL = 2.0  # 일반 종목: 타이트한 Chandelier k (빈번한 매매용)
CHANDELIER_K_PENNY = 4.0  # 페니 종목: 타이트한 Chandelier k (빈번한 매매용)

# ── [Guide-3] 슬리피지 보정 (보수적 시뮬레이션) ─────────────────────────────
# 페니 종목은 호가 스프레드가 커서 더 높은 슬리피지 적용
SLIPPAGE_BUY_NORMAL = 0.005  # 일반 종목 매수 슬리피지 +0.5%
SLIPPAGE_SELL_NORMAL = 0.005  # 일반 종목 매도 슬리피지 -0.5%
SLIPPAGE_BUY_PENNY = 0.030  # 페니 종목 매수 슬리피지 +3.0% (실측 bid-ask 스프레드 반영)
SLIPPAGE_SELL_PENNY = 0.020  # 페니 종목 매도 슬리피지 -2.0%
# 거래량이 극도로 낮은 종목은 슬리피지를 2× 가중 (유동성 패널티)
SLIPPAGE_LOW_VOLUME_THRESHOLD = 50_000  # 주/일 거래량 기준


def _apply_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    """
    체결 불리 방향으로 슬리피지를 반영한 보수적 모의 체결가 반환.
    - 매수: 시장가보다 높게 체결 (ask 쪽 스프레드)
    - 매도: 시장가보다 낮게 체결 (bid 쪽 스프레드)
    - 거래량 < SLIPPAGE_LOW_VOLUME_THRESHOLD → 슬리피지 2× 가중
    """
    base_pct = (
        (SLIPPAGE_BUY_PENNY if is_penny else SLIPPAGE_BUY_NORMAL)
        if is_buy
        else (SLIPPAGE_SELL_PENNY if is_penny else SLIPPAGE_SELL_NORMAL)
    )
    if volume > 0 and volume < SLIPPAGE_LOW_VOLUME_THRESHOLD:
        base_pct *= 2.0
    if is_buy:
        return round(price * (1.0 + base_pct), 6)
    else:
        return round(price * (1.0 - base_pct), 6)


from services.kelly_sizer import KellySizer

_kelly_sizer = KellySizer()


def _compute_locked_floor(
    entry_price: float, highest_price: float, is_penny: bool
) -> float:
    """
    비가역(monotonic) 리스크 방어 하한선.

    - 정적 초기 스탑(퍼센트 기반)은 항상 최저 방어선으로 유지된다.
    - 페니 종목이 +10%(PENNY_BREAKEVEN_TRIGGER) 이상 도달한 이력이 있으면 본전(entry_price)
      으로 영구 락인된다. highest_price는 호출부에서 이미 max()로 단조 갱신되므로,
      이 락인 여부를 별도 상태(DB 컬럼/플래그) 없이 highest_price만으로 파생할 수 있다.
    """
    init_pct = PENNY_TS_INIT_PCT if is_penny else TS_INIT_PCT
    static_floor = entry_price * init_pct
    if is_penny and highest_price >= entry_price * PENNY_BREAKEVEN_TRIGGER:
        return max(static_floor, entry_price)
    return static_floor


def update_reversible_trailing_stop(
    entry_price: float,
    highest_price: float,
    atr_value: float,
    current_smoothed_er: float,
    is_penny: bool,
) -> float:
    """
    가역적(reversible) 스위칭 트레일링 스탑.

    '적응형(soft)' 스탑과 '락인(hard floor)' 스탑을 분리한다:
      - 적응형 구간(highest_price - k_t*ATR)은 smoothed_er 레짐에 따라 k_t가 변하며
        실제로 오르내릴 수 있다 — 모멘텀 전략에 맞춰 추세 레짐(er↑)에서는 k_t가 커져
        여유를 주고, 횡보 레짐(er↓) 진입 시에는 k_t가 작아져 스탑을 조인다.
        이것이 없으면 "가역적"이라는 이름이 무의미해진다 (단순 max() 래칫은 절대 되돌아가지 못함).
      - 락인 구간(_compute_locked_floor)만 비가역적으로 유지되어, 이미 확보한
        리스크 방어선(초기 스탑·페니 본전 락인)이 regime 변화로 침식되지 않도록 보장한다.

    최종 스탑 = max(locked_floor, adaptive_stop):
    락인 아래로는 절대 내려가지 않지만, 락인보다 위에서는 자유롭게 오르내린다.
    """
    k_max = 3.0
    k_min = 1.2

    # 모멘텀 전략 정합: 추세가 강할수록(ER↑) k_t가 커져 스탑에 여유를 줌
    # → "winner를 달리게 하고, 횡보장에서는 스탑을 조여 빠르게 탈출"
    # 기존(1-ER)은 추세 강할 때 타이트하게 조여 스탑헌팅에 취약했음
    k_t = k_min + (k_max - k_min) * current_smoothed_er
    adaptive_stop = highest_price - (k_t * atr_value)

    locked_floor = _compute_locked_floor(entry_price, highest_price, is_penny)
    return max(locked_floor, adaptive_stop)


class PaperTradingManager:
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
        self.webhook = WebhookManager()
        self.webhook.set_supabase_client(supabase_client)
        # 매수/청산을 별도 락으로 분리한다. LIVE 모드에서는 실주문 체결 확인을
        # 최대 FILL_POLL_TIMEOUT_SEC(5초)까지 폴링하는데(live_engine.py), 이 대기를
        # 매수·청산이 같은 락을 공유한 채로 하면 "매수 체결 확인 중"이라는 이유만으로
        # 같은 티커의 트레일링 스탑/수동매도가 최대 5초까지 지연될 수 있었다(과거 버그).
        # 매수 완료 여부와 무관하게 하락 시 즉시 청산이 가능해야 하므로 완전히 분리한다.
        self._buy_locks: dict[str, asyncio.Lock] = {}
        self._exit_locks: dict[str, asyncio.Lock] = {}
        # 신규 진입 개수(20개 상한)와 계좌 현금(cash_available)은 모든 티커가 공유하는
        # 전역 자원이므로, 서로 다른 티커의 매수 신호가 동시에 들어오면 티커별 락만으로는
        # 보호되지 않는다 — 두 전역 락으로 이 경합을 막는다.
        self._entry_lock = (
            asyncio.Lock()
        )  # 신규 진입 admission control(포지션 수·집중도·예산) 직렬화
        self._cash_lock = asyncio.Lock()  # cash_available 읽기-수정-쓰기(RMW) 직렬화
        # Kelly Sizer 1시간 캐시 (DB I/O Latency 제거)
        # 캐시에 저장하는 것은 최종 비중이 아니라 거래 이력 기반 통계(p/b/raw_kelly)뿐이다.
        # ATR 변동성 페널티는 캐시 히트 시에도 매번 호출 시점 값으로 새로 적용해야
        # 포지션 사이징이 현재 변동성을 반영한다 (apply_volatility_penalty 참고).
        self._kelly_cache: dict[str, dict | None] = {}
        self._kelly_cache_updated_at: dict[str, float] = {}

    def _get_buy_lock(self, ticker: str) -> asyncio.Lock:
        """티커별 매수 락 — 동일 종목의 신규 진입 처리(실주문 제출·체결 확인 포함)가
        겹쳐 실행되지 않도록 직렬화한다. 청산 락(_get_exit_lock)과는 분리되어 있어,
        매수 체결 확인 대기 중에도 같은 티커의 트레일링 스탑/수동매도가 지연되지 않는다."""
        lock = self._buy_locks.get(ticker)
        if lock is None:
            lock = asyncio.Lock()
            self._buy_locks[ticker] = lock
        return lock

    def _get_exit_lock(self, ticker: str) -> asyncio.Lock:
        """티커별 청산 락 — 동일 종목에 대한 청산/재진입/수동매도가 겹쳐 실행되며
        watchlist 상태를 서로 덮어쓰는 경합을 방지한다. 매수 락과 분리되어 있어
        진행 중인 매수의 체결 확인 대기가 청산을 지연시키지 않는다."""
        lock = self._exit_locks.get(ticker)
        if lock is None:
            lock = asyncio.Lock()
            self._exit_locks[ticker] = lock
        return lock

    async def _log_decision(
        self,
        ticker: str,
        gate: str,
        outcome: str,
        signal: str = None,
        dna_score: float = None,
        rsi: float = None,
        rvol: float = None,
        price: float = None,
        note: str = None,
    ):
        """게이트 통과/차단 결과를 engine_decisions 테이블에 기록."""
        try:
            row = {
                "ticker": ticker,
                "gate": gate,
                "outcome": outcome,
                "signal": signal,
                "dna_score": dna_score,
                "rsi": rsi,
                "rvol": rvol,
                "price": price,
                "note": note,
            }
            await asyncio.to_thread(
                self.supabase.table("engine_decisions").insert(row).execute
            )
        except Exception as e:
            print(f"⚠️ [DecisionLog] insert failed: {e}")

    async def get_account(self):
        query = self.supabase.table("paper_account").select("*").limit(1)
        res = await asyncio.to_thread(query.execute)
        return res.data[0] if res.data else None

    async def _apply_cash_delta(self, delta: float):
        """cash_available을 원자적으로 갱신한다.

        매수 체결(-)·매도/스케일아웃 체결(+) 모두 이 메서드를 거쳐야 한다.
        _cash_lock 안에서 잔액을 다시 조회한 뒤 delta를 반영해 write하므로,
        호출 시점에 다른 코루틴이 들고 있던 stale acc 값을 사용하는 lost update를
        방지한다 (서로 다른 티커의 매수/매도가 같은 1분봉 사이클에 동시 발생해도 안전).
        """
        async with self._cash_lock:
            fresh_acc = await self.get_account()
            if not fresh_acc:
                return None, 0.0
            new_cash = float(fresh_acc["cash_available"]) + delta
            res = await asyncio.to_thread(
                self.supabase.table("paper_account")
                .update({"cash_available": new_cash})
                .eq("id", fresh_acc["id"])
                .execute
            )
            return res, new_cash

    async def calculate_invested_capital(self, positions: list = None) -> float:
        """보유 포지션의 현재 평가액 합산 (positions 미전달 시 DB에서 조회)"""
        if positions is None:
            res = await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .select("current_price,units")
                .execute
            )
            positions = res.data or []
        return sum(
            float(p.get("current_price") or 0) * float(p.get("units") or 0)
            for p in positions
        )

    async def initialize_account(self, initial_cash: float = INITIAL_CAPITAL):
        """계좌가 없으면 초기 자산과 함께 생성합니다."""
        acc = await self.get_account()
        if not acc:
            print(
                f"💰 [PAPER] No account found. Initializing with ${initial_cash:,.2f}..."
            )
            new_acc = {
                "total_assets": initial_cash,
                "cash_available": initial_cash,
            }
            try:
                res = await asyncio.to_thread(
                    self.supabase.table("paper_account").insert(new_acc).execute
                )
                print("✅ [PAPER] Account successfully initialized.")
                return res.data[0]
            except Exception as e:
                print(f"❌ [PAPER] Account initialization failed: {e}")
                return None
        return acc

    async def get_position(self, ticker: str):
        query = self.supabase.table("paper_positions").select("*").eq("ticker", ticker)
        res = await asyncio.to_thread(query.execute)
        return res.data[0] if res.data else None

    async def get_all_positions(self):
        res = await asyncio.to_thread(
            self.supabase.table("paper_positions").select("*").execute
        )
        return res.data or []

    async def _sync_watchlist_buy(
        self, ticker: str, price: float, ts_threshold: float, dna_score: float
    ):
        """매수 시 관심종목 자동 등록 (status=HOLDING). 이미 있으면 업데이트."""
        payload = {
            "ticker": ticker,
            "status": "HOLDING",
            "buy_price": round(price, 4),
            "stop_loss": round(ts_threshold, 4),
            "initial_dna_score": round(dna_score, 1),
        }
        try:
            existing = await asyncio.to_thread(
                self.supabase.table("watchlist")
                .select("ticker")
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
            if existing.data:
                await asyncio.to_thread(
                    self.supabase.table("watchlist")
                    .update(
                        {
                            "status": "HOLDING",
                            "buy_price": payload["buy_price"],
                            "stop_loss": payload["stop_loss"],
                        }
                    )
                    .eq("ticker", ticker)
                    .is_("user_id", "null")
                    .execute
                )
            else:
                await asyncio.to_thread(
                    self.supabase.table("watchlist").insert(payload).execute
                )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync BUY] {ticker}: {e}")

    async def _sync_watchlist_exit(self, ticker: str):
        """청산 시 관심종목 상태를 EXITED로 업데이트."""
        try:
            await asyncio.to_thread(
                self.supabase.table("watchlist")
                .update({"status": "EXITED"})
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync EXIT] {ticker}: {e}")
            # 포지션은 이미 청산됐는데 watchlist만 HOLDING에 갇히는 것을 방지하기 위해
            # 실패를 조용히 삼키지 않고 알림으로 노출 (재시도 로직은 없음 — 수동 확인 유도)
            await self.webhook.send_alert(
                title=f"⚠️ [Watchlist Sync 실패] {ticker}",
                description=f"청산 후 watchlist EXITED 반영 실패: {e}\n수동으로 status를 확인하세요.",
                color=0xE67E22,
            )

    async def _on_order_buy(
        self, _ticker: str, qty: float, price: float
    ) -> tuple[float, float] | None:
        """매수 실행 훅 — 반환값은 (실제 체결 수량, 실제 체결 단가), 실패 시 None.
        Paper 모드는 시뮬레이션 슬리피지 가격이 곧 체결가이므로 입력값을 그대로 반환.
        LiveTradingManager는 Alpaca submit_order() 실체결가(filled_avg_price)로 오버라이드."""
        return qty, price

    async def _on_order_sell(
        self, _ticker: str, qty: float, price: float, _reason: str
    ) -> tuple[float, float] | None:
        """매도 실행 훅 — 반환값은 (실제 체결 수량, 실제 체결 단가), 실패 시 None.
        LiveTradingManager에서 Alpaca submit_order() 실체결가로 오버라이드."""
        return qty, price

    async def _sync_watchlist_stop_loss(self, ticker: str, stop_loss: float):
        """트레일링 스탑 이동 시 관심종목 stop_loss 동기화."""
        try:
            await asyncio.to_thread(
                self.supabase.table("watchlist")
                .update({"stop_loss": round(stop_loss, 4)})
                .eq("ticker", ticker)
                .is_("user_id", "null")
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Watchlist Sync SL] {ticker}: {e}")
            await self.webhook.send_alert(
                title=f"⚠️ [Watchlist SL Sync 실패] {ticker}",
                description=f"stop_loss 반영 실패: {e}",
                color=0xE67E22,
            )

    async def _close_position(
        self,
        pos: dict,
        signal_price: float,
        exit_reason: str,
    ) -> dict | None:
        """
        포지션 전량 청산 공통 경로 — 청산 클레임(원자적 상태 전환) → 슬리피지 적용 →
        실주문 제출(LIVE 모드는 체결 확인까지) → 현금 갱신 → paper_history 기록 →
        paper_positions 삭제 → watchlist EXITED 동기화.

        Railway 배포 중 신·구 컨테이너가 겹치는 등 asyncio.Lock이 보호하지 못하는
        프로세스 간 중복 실행이 발생해도, 이 클레임 단계의 원자적 UPDATE(Postgres 행
        잠금)가 두 번째 호출을 조기에 차단해 중복 실주문/이중 기록을 방지한다.

        실주문 실패/체결 미확인 시 None 반환 — 포지션은 그대로 유지되며 DB는 기록되지 않는다.
        """
        ticker = pos["ticker"]
        entry_price = float(pos["entry_price"])
        units = float(pos["units"])
        is_penny = entry_price <= PENNY_MAX_PRICE
        original_status = pos.get("status") or "HOLD"

        # 청산 클레임: status != 'CLOSING'인 행만 'CLOSING'으로 전환.
        # 동시에 두 프로세스가 같은 티커를 청산 시도해도 Postgres 행 잠금으로
        # 단 하나만 이 UPDATE에 매치되므로, 나머지는 즉시 빈 결과를 받고 중단한다.
        claim = await asyncio.to_thread(
            self.supabase.table("paper_positions")
            .update({"status": "CLOSING"})
            .eq("ticker", ticker)
            .neq("status", "CLOSING")
            .execute
        )
        if not claim.data:
            return None

        fill_price = _apply_slippage(signal_price, is_buy=False, is_penny=is_penny)
        executed = await self._on_order_sell(ticker, units, fill_price, exit_reason)
        if executed is None:
            # 실주문 실패 — 클레임 해제(원래 상태로 복구)해 재시도 가능하게 유지
            await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .update({"status": original_status})
                .eq("ticker", ticker)
                .execute
            )
            return None
        units, fill_price = executed

        pnl_pct = (fill_price / entry_price - 1) * 100
        profit_amt = (fill_price - entry_price) * units
        proceeds = units * fill_price

        await self._apply_cash_delta(proceeds)
        history_data = {
            "ticker": ticker,
            "entry_price": entry_price,
            "exit_price": fill_price,
            "signal_price": signal_price,
            "slippage_pct": (fill_price / signal_price - 1) * 100,
            "pnl_pct": pnl_pct,
            "profit_amt": profit_amt,
            "exit_reason": exit_reason,
        }
        await asyncio.to_thread(
            self.supabase.table("paper_history").insert(history_data).execute
        )
        await asyncio.to_thread(
            self.supabase.table("paper_positions").delete().eq("ticker", ticker).execute
        )
        await self._sync_watchlist_exit(ticker)

        # KellySizer 캐시 무효화 (청산 후 과거 데이터가 변경되었으므로)
        if ticker in self._kelly_cache:
            del self._kelly_cache[ticker]

        return {
            "fill_price": fill_price,
            "units": units,
            "pnl_pct": pnl_pct,
            "profit_amt": profit_amt,
        }

    REENTRY_COOLDOWN_MINUTES = 15  # 청산 후 재진입 금지 시간
    # PDT Rule은 마진 계좌 $25k 미만에만 적용 — $100k 가상 계좌에서는 불필요
    ENFORCE_PDT_SAFEGUARD = False

    def _is_in_cooldown_from_rows(self, rows: list[dict]) -> bool:
        """최근 청산 이후 쿨다운 여부 반환 (REENTRY_COOLDOWN_MINUTES 기준).

        rows는 같은 티커의 paper_history를 closed_at 내림차순으로 정렬해 이미
        가져온 결과(휩쏘 방지 체크와 공유)여야 한다 — 별도 DB 왕복을 만들지 않는다.
        """
        if not rows:
            return False
        closed_at_str = rows[0].get("closed_at")
        if not closed_at_str:
            return False
        try:
            closed_at = datetime.fromisoformat(closed_at_str.replace("Z", "+00:00"))
        except ValueError:
            return False

        if self.ENFORCE_PDT_SAFEGUARD:
            closed_at_est = closed_at.astimezone(_NY_TZ)
            now_est = datetime.now(_NY_TZ)
            if closed_at_est.date() == now_est.date():
                return True

        elapsed = (datetime.now(timezone.utc) - closed_at).total_seconds()
        return elapsed < self.REENTRY_COOLDOWN_MINUTES * 60

    async def process_signal(
        self,
        ticker: str,
        price: float,
        signal_type: str,
        strength: str,
        rsi: float | None = None,
        ai_report: str = "",
        is_armed: bool = False,
        dna_score: float = 0.0,
        recommended_weight: float = 0.0,
        atr: float = 0.0,
        smoothed_er: float = 0.5,
    ) -> bool:
        """진입/청산 처리 — 매수는 _get_buy_lock, 청산은 _get_exit_lock으로 각각
        직렬화한다 (_process_signal_locked 내부에서 분기별로 락을 잡는다). 두 락을
        분리한 이유는 매수 체결 확인 대기(최대 5초, LIVE 모드)가 같은 티커의
        트레일링 스탑/수동매도를 지연시키지 않도록 하기 위함이다."""
        return await self._process_signal_locked(
            ticker,
            price,
            signal_type,
            strength,
            rsi,
            ai_report=ai_report,
            is_armed=is_armed,
            dna_score=dna_score,
            recommended_weight=recommended_weight,
            atr=atr,
            smoothed_er=smoothed_er,
        )

    async def _process_signal_locked(
        self,
        ticker: str,
        price: float,
        signal_type: str,
        strength: str,
        rsi: float | None = None,
        ai_report: str = "",
        is_armed: bool = False,
        dna_score: float = 0.0,
        recommended_weight: float = 0.0,
        atr: float = 0.0,
        smoothed_er: float = 0.5,
    ) -> bool:
        """
        v4 State Machine:
        1. STRONG BUY (페니 DNA≥65 / 일반 DNA≥75) → 매수 (recommended_weight 비중 or 기본 KELLY_FRACTION)
           + 관심종목 자동 등록 (HOLDING)
        2. HOLD 중 RSI > 60 → 50% 분할 익절 (SCALE_OUT) & TS 상향 + watchlist stop_loss 동기화
        3. 가격 < TS_Threshold → 전량 청산 (TRAILING_STOP) + 관심종목 EXITED
        """
        pos, acc = await asyncio.gather(
            self.get_position(ticker),
            self.get_account(),
        )

        if not acc:
            print("⚠️ Paper Account not initialized.")
            return

        # --- 1. 신규 매수 (STRONG BUY & No position) ---
        is_penny_signal = price <= PENNY_MAX_PRICE
        # quant_engine.calculate_advanced_signals()의 tier_penny(DNA≥65)/tier2(DNA≥75) 기준과
        # 정합. Strong_Buy는 DNA 기준(tier1/2/penny) 외에 numba_strong_buy(RSI·RVOL 백분위
        # 랭크 기반) 경로로도 True가 될 수 있어 DNA_Score가 tier 기준 미만인 신호가 섞여
        # 들어올 수 있으므로, 이 게이트가 tier 최저선 아래로는 항상 차단해야 한다
        # (과거 55/70으로 완화됐던 회귀 수정 — 2026-07-15).
        dna_gate = 65 if is_penny_signal else 75

        # ── Gate: signal 조건 사전 체크 (ARMED 여부 포함) ────────────────────
        if signal_type == "BUY" and strength == "STRONG" and not pos:
            if not is_armed:
                await self._log_decision(
                    ticker=ticker,
                    gate="ARMED_OFF",
                    outcome="BLOCKED",
                    signal=signal_type,
                    dna_score=dna_score,
                    rsi=rsi,
                    price=price,
                    note="SYSTEM_ARMED=False — 매수 신호 수신했으나 비무장 상태",
                )
                return
            if dna_score < dna_gate:
                await self._log_decision(
                    ticker=ticker,
                    gate="DNA_GATE",
                    outcome="BLOCKED",
                    signal=signal_type,
                    dna_score=dna_score,
                    rsi=rsi,
                    price=price,
                    note=f"DNA {dna_score:.1f} < gate {dna_gate} ({'penny' if is_penny_signal else 'normal'})",
                )
                return

            # 당일 재진입 금지(Cool-down) + 종목당 일일 최대 거래 횟수 제한
            # 오버트레이딩(Whipsaw) 방지: 오늘 손실/트레일링스탑 청산 이력이 있으면 당일 재진입
            # 금지하고, 그 외에도 종목당 하루 신규 진입 횟수를 제한해 같은 종목에서
            # 반복적인 스탑헌팅으로 자본이 갈리는 것을 막는다.
            # paper_history 실제 청산 사유 컬럼은 exit_reason이다 (reason 컬럼은 존재하지
            # 않아 select 시 42703 에러로 항상 실패했던 이력이 있음 — 컬럼명 고정).
            # 아래에서 가져온 recent_history_rows는 재진입 쿨다운 체크(_is_in_cooldown_from_rows)와
            # 공유된다 — 같은 티커의 paper_history를 두 번 따로 조회하지 않기 위함.
            recent_history_rows: list[dict] = []
            try:
                today_ny = datetime.now(_NY_TZ).date()

                recent_history = await asyncio.to_thread(
                    self.supabase.table("paper_history")
                    .select("closed_at,exit_reason,pnl_pct")
                    .eq("ticker", ticker)
                    .order("closed_at", desc=True)
                    .limit(10)
                    .execute
                )
                recent_history_rows = recent_history.data or []
                today_rows = []
                for r in recent_history_rows:
                    closed_at_str = r.get("closed_at")
                    if not closed_at_str:
                        continue
                    closed_at = datetime.fromisoformat(
                        closed_at_str.replace("Z", "+00:00")
                    )
                    if closed_at.astimezone(_NY_TZ).date() == today_ny:
                        today_rows.append(r)

                loss_today = any(
                    r.get("exit_reason") == "Trailing Stop"
                    or float(r.get("pnl_pct") or 0) < 0
                    for r in today_rows
                )
                if loss_today:
                    await self._log_decision(
                        ticker=ticker,
                        gate="COOLDOWN_ACTIVE",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        price=price,
                        note="당일 손실/손절 청산 이력 존재 (Whipsaw 방지)",
                    )
                    print(
                        f"🛑 [Cooldown] {ticker} 당일 손절 이력 발견. 오버트레이딩 방지를 위해 재진입 차단."
                    )
                    return

                # Scale-Out은 동일 라운드트립의 부분 청산이라 별도 거래로 세지 않는다.
                daily_trade_count = sum(
                    1 for r in today_rows if r.get("exit_reason") != "Scale-Out 50%"
                )
                if daily_trade_count >= MAX_DAILY_TRADES_PER_TICKER:
                    await self._log_decision(
                        ticker=ticker,
                        gate="DAILY_TRADE_LIMIT",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        price=price,
                        note=f"당일 거래 {daily_trade_count}건 ≥ 한도 {MAX_DAILY_TRADES_PER_TICKER}건",
                    )
                    print(
                        f"🛑 [Daily Limit] {ticker} 당일 거래 {daily_trade_count}건 — 신규 진입 차단."
                    )
                    return
            except Exception as cd_err:
                print(f"⚠️ [Cooldown/Daily-Limit Check] 실패: {cd_err}")

            # 단기 변동성 필터: ATR/가격 비율이 과도하면(휩쏘성 급변동) 신규 진입 차단
            if atr > 0 and price > 0:
                volatility_ratio = atr / price
                vol_cap = (
                    PENNY_VOLATILITY_MAX_RATIO
                    if is_penny_signal
                    else VOLATILITY_MAX_RATIO
                )
                if volatility_ratio > vol_cap:
                    await self._log_decision(
                        ticker=ticker,
                        gate="VOLATILITY_FILTER",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        price=price,
                        note=f"ATR/가격비 {volatility_ratio*100:.1f}% > 상한 {vol_cap*100:.1f}%",
                    )
                    print(
                        f"🛑 [Volatility Filter] {ticker} 변동성비 {volatility_ratio*100:.1f}% — 신규 진입 차단."
                    )
                    return

        if (
            signal_type == "BUY"
            and strength == "STRONG"
            and not pos
            and is_armed
            and dna_score >= dna_gate
        ):
            # 매수 락: 이 티커의 신규 진입(admission control ~ 실주문 제출·체결
            # 확인)을 직렬화한다. 청산 락(_get_exit_lock)과 분리되어 있으므로,
            # 아래 실주문 체결 확인 대기(_on_order_buy, LIVE 모드는 최대 5초 폴링)
            # 중에도 같은 티커의 트레일링 스탑/수동매도(exit 락)는 지연되지 않는다.
            async with self._get_buy_lock(ticker):
                # 전역 admission control 락: 포지션 수 상한·재진입 쿨다운·집중도·예산
                # 산정과 진입 클레임 INSERT까지를 직렬화한다. 서로 다른 티커의 매수
                # 신호가 동시에 들어와도 이 구간만큼은 한 번에 하나씩 처리되므로,
                # MAX_CONCURRENT_POSITIONS·MAX_CONCENTRATION_PCT 상한을 여러 코루틴이
                # 동시에 통과해 초과 진입하는 경합을 막는다. 실주문 제출(_on_order_buy,
                # 네트워크 I/O)은 락 해제 후 실행해 서로 다른 티커 간 병렬성을 유지한다.
                async with self._entry_lock:
                    # 동시 포지션 상한 체크
                    pos_count_res = await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .select("ticker", count="exact")
                        .execute
                    )
                    if (pos_count_res.count or 0) >= MAX_CONCURRENT_POSITIONS:
                        print(
                            f"⛔ [{ticker}] 동시 포지션 한도 초과 ({MAX_CONCURRENT_POSITIONS}개) — 진입 차단"
                        )
                        await self._log_decision(
                            ticker=ticker,
                            gate="MAX_POSITIONS",
                            outcome="BLOCKED",
                            signal=signal_type,
                            dna_score=dna_score,
                            rsi=rsi,
                            price=price,
                            note=f"동시 포지션 {pos_count_res.count}개 ≥ 한도 {MAX_CONCURRENT_POSITIONS}개",
                        )
                        return
                    # 재진입 쿨다운 체크 (청산 후 60분 이내 재진입 차단)
                    # 별도 DB 조회 없이 위 휩쏘 방지 체크에서 이미 가져온 이력을 재사용한다.
                    if self._is_in_cooldown_from_rows(recent_history_rows):
                        print(
                            f"⏳ [{ticker}] 재진입 쿨다운 중 ({self.REENTRY_COOLDOWN_MINUTES}분) — 진입 차단"
                        )
                        await self._log_decision(
                            ticker=ticker,
                            gate="COOLDOWN",
                            outcome="BLOCKED",
                            signal=signal_type,
                            dna_score=dna_score,
                            rsi=rsi,
                            price=price,
                            note=f"청산 후 {self.REENTRY_COOLDOWN_MINUTES}분 쿨다운 중",
                        )
                        return
                    # 포트폴리오 집중도 게이트: 총 자산 대비 투입 비중 80% 초과 시 신규 진입 차단
                    invested = await self.calculate_invested_capital()
                    total_equity = acc["cash_available"] + invested
                    if (
                        total_equity > 0
                        and (invested / total_equity) >= MAX_CONCENTRATION_PCT
                    ):
                        conc_pct = invested / total_equity * 100
                        print(
                            f"⛔ [{ticker}] 집중도 한도 초과 ({conc_pct:.1f}% ≥ {MAX_CONCENTRATION_PCT*100:.0f}%) — 진입 차단"
                        )
                        await self._log_decision(
                            ticker=ticker,
                            gate="CONCENTRATION",
                            outcome="BLOCKED",
                            signal=signal_type,
                            dna_score=dna_score,
                            rsi=rsi,
                            price=price,
                            note=f"투입 비중 {conc_pct:.1f}% ≥ 한도 {MAX_CONCENTRATION_PCT*100:.0f}%",
                        )
                        return
                    # recommended_weight: calculate_position_sizing()에서 이미 결합된 비중(%).
                    # 0이면 ATR/켈리 계산 실패 또는 유효 데이터 부족 → 동적 켈리 연산기로 비중 폴백.
                    if recommended_weight <= 0:
                        current_time = time.time()
                        last_updated = self._kelly_cache_updated_at.get(ticker, 0.0)

                        # 1시간(3600초) 이내의 캐시가 있으면 DB 조회(latency)만 생략한다.
                        # 캐시된 것은 거래 이력 기반 통계(p/b/raw_kelly)뿐이므로, ATR 변동성
                        # 페널티는 캐시 히트/미스와 무관하게 항상 현재 atr/price로 새로 적용된다.
                        if (
                            ticker in self._kelly_cache
                            and (current_time - last_updated) < KELLY_CACHE_TTL_SEC
                        ):
                            stats = self._kelly_cache[ticker]
                        else:
                            res = await asyncio.to_thread(
                                self.supabase.table("paper_history")
                                .select("ticker,entry_price,pnl_pct,profit_amt")
                                .eq("ticker", ticker)
                                .order("closed_at", desc=True)
                                .limit(50)
                                .execute
                            )
                            paper_history_records = res.data or []
                            stats = _kelly_sizer.compute_stats(paper_history_records)
                            self._kelly_cache[ticker] = stats
                            self._kelly_cache_updated_at[ticker] = current_time

                        safe_atr = atr if atr > 0 else (price * 0.02)
                        weight, _, _ = _kelly_sizer.apply_volatility_penalty(
                            stats, current_atr=safe_atr, current_price=price
                        )

                        effective_fraction = weight if weight is not None else 0.05
                        print(
                            f"⚠️ [{ticker}] Kelly 동적 폴백: {effective_fraction*100:.1f}% 적용"
                        )
                    else:
                        effective_fraction = min(recommended_weight / 100.0, 0.25)
                    buy_budget = min(
                        acc["cash_available"] * effective_fraction,
                        MAX_BUY_BUDGET,
                    )
                    if buy_budget < MIN_BUY_BUDGET:
                        await self._log_decision(
                            ticker=ticker,
                            gate="MIN_BUDGET",
                            outcome="BLOCKED",
                            signal=signal_type,
                            dna_score=dna_score,
                            rsi=rsi,
                            price=price,
                            note=f"매수 예산 ${buy_budget:.2f} < 최소 ${MIN_BUY_BUDGET}",
                        )
                        return

                    # [Guide-3] 슬리피지 보정 — 매수는 시장가보다 불리하게 체결 (실주문 전 추정치)
                    est_fill_price = _apply_slippage(
                        price, is_buy=True, is_penny=is_penny_signal
                    )
                    est_units = buy_budget / est_fill_price
                    ts_init = PENNY_TS_INIT_PCT if is_penny_signal else TS_INIT_PCT

                    # 원자적 진입 클레임: paper_positions.ticker는 UNIQUE 제약이므로, 실주문
                    # 제출 전에 추정치로 먼저 INSERT해 unique violation으로 동시 프로세스의
                    # 중복 매수(예: 배포 중 신·구 컨테이너 오버랩)를 DB 레벨에서 차단한다.
                    # asyncio.Lock은 단일 프로세스만 보호하므로 이 클레임이 실질적 방어선이다.
                    claim_pos = {
                        "ticker": ticker.upper(),
                        "status": "ENTERING",
                        "weight": round(effective_fraction, 4),
                        "entry_price": est_fill_price,
                        "signal_price": price,
                        "entry_slippage": (est_fill_price / price - 1) * 100,
                        "current_price": est_fill_price,
                        "highest_price": est_fill_price,
                        "ts_threshold": est_fill_price * ts_init,
                        "units": est_units,
                        "is_scaled_out": False,
                        "scale_out_bar_count": 0,
                    }
                    try:
                        claim_res = await asyncio.to_thread(
                            self.supabase.table("paper_positions")
                            .insert(claim_pos)
                            .execute
                        )
                    except Exception as e:
                        if "duplicate key" in str(e).lower() or "23505" in str(e):
                            print(
                                f"⏳ [{ticker}] 동시 진입 감지 — 다른 프로세스가 이미 클레임함, 스킵"
                            )
                            return
                        raise
                    if not claim_res.data:
                        print(f"⚠️ [{ticker}] 진입 클레임 INSERT가 빈 결과 반환 — 스킵")
                        return

                # 실거래 훅: LiveTradingManager에서 Alpaca 주문 제출, 실제 (체결 수량, 체결 단가) 반환.
                # 실패 시 클레임 롤백 + DB 기록 차단.
                executed = await self._on_order_buy(ticker, est_units, est_fill_price)
                if executed is None:
                    print(f"⚠️ [{ticker}] Live buy order rejected — 클레임 롤백")
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .delete()
                        .eq("ticker", ticker)
                        .execute
                    )
                    await self._log_decision(
                        ticker=ticker,
                        gate="ORDER_REJECTED",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        price=price,
                        note="실주문 제출/체결확인 실패 — Alpaca가 거절했거나 제한시간 내 미체결 (Discord 알림 참고)",
                    )
                    return
                units, fill_price = executed
                ts_threshold = fill_price * ts_init

                try:
                    # 클레임 행을 실체결 결과로 확정 (실거래 체결가·체결 수량 반영)
                    pos_res = await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .update(
                            {
                                "status": "HOLD",
                                "entry_price": fill_price,
                                "entry_slippage": (fill_price / price - 1) * 100,
                                "current_price": fill_price,
                                "highest_price": fill_price,
                                "ts_threshold": ts_threshold,
                                "units": units,
                            }
                        )
                        .eq("ticker", ticker)
                        .execute
                    )
                    if not pos_res.data:
                        raise RuntimeError(
                            f"Position 확정 UPDATE returned no data for {ticker}"
                        )

                    # 확정 성공 후에만 현금 차감 (원자성 보장)
                    # 실거래 체결 수량·체결가 기준으로 차감 — LIVE 모드는 정수 주 체결이며
                    # 실체결가가 추정 슬리피지가와 다를 수 있음 (버그 수정: 이전엔 추정 예산
                    # 전액을 차감해 장부 현금이 실체결액과 어긋났음)
                    # _apply_cash_delta가 _cash_lock 안에서 최신 잔액을 다시 읽고 반영하므로,
                    # 함수 진입 시점에 fetch해 둔 stale acc["cash_available"]는 쓰지 않는다.
                    executed_cost = units * fill_price
                    cash_res, _new_cash = await self._apply_cash_delta(-executed_cost)
                    if not cash_res or not cash_res.data:
                        # 현금 차감 실패 시 방금 확정한 포지션을 롤백
                        await asyncio.to_thread(
                            self.supabase.table("paper_positions")
                            .delete()
                            .eq("ticker", ticker)
                            .execute
                        )
                        raise RuntimeError(
                            f"Cash UPDATE failed for {ticker}, position rolled back"
                        )

                    slip_pct = (fill_price / price - 1) * 100
                    report_line = f"\n💡 {ai_report}" if ai_report else ""
                    await self.webhook.send_alert(
                        title=f"🚀 [PAPER BUY] {ticker}",
                        description=(
                            f"시장가: ${price:.4f} → 체결가: ${fill_price:.4f} (슬리피지 {slip_pct:+.2f}%)\n"
                            f"수량: {units:.2f}주 | DNA: {dna_score:.0f} | 매수금액: ${buy_budget:.2f}\n"
                            f"손절선: ${ts_threshold:.4f} ({'-15%' if is_penny_signal else '-10%'}) | 비중: {effective_fraction*100:.1f}%{report_line}"
                        ),
                        color=0x2ECC71,
                    )
                    await self._log_decision(
                        ticker=ticker,
                        gate="EXECUTED",
                        outcome="EXECUTED",
                        signal="BUY",
                        dna_score=dna_score,
                        rsi=rsi,
                        price=fill_price,
                        note=f"매수 체결 ${buy_budget:.2f} | {units:.2f}주 | TS ${ts_threshold:.4f}",
                    )
                    # 관심종목 자동 등록 (STRONG BUY 매수 → HOLDING)
                    await self._sync_watchlist_buy(
                        ticker, fill_price, ts_threshold, dna_score
                    )
                    return True
                except Exception as e:
                    print(f"❌ Buy Error: {e}")
                    raise

        # --- 2. 기존 포지션 관리 (Trailing Stop & Scale Out) ---
        if pos:
            # 청산 락: 이 티커의 청산 관련 처리(EOD/Time-Decay/Scale-Out/Trailing
            # Stop 및 그로 인한 실주문 제출·체결 확인)를 직렬화한다. 매수 락과
            # 분리되어 있어, 진행 중인 매수의 체결 확인 대기가 이 구간을 막지 않는다.
            async with self._get_exit_lock(ticker):
                units = pos["units"]
                entry_price = pos["entry_price"]
                highest_price = max(pos["highest_price"], price)
                is_scaled_out = pos["is_scaled_out"]
                ts_threshold = pos["ts_threshold"]
                is_penny = entry_price <= PENNY_MAX_PRICE

                # A-0. EOD 강제 청산 최우선 처리 (Scale-Out보다 앞에 위치 — 동시 발동 시 EOD 우선)
                # 수익 포지션(현재가 > 진입가)은 익일 홀딩 — 승자를 일찍 자르지 않음
                if signal_type == "SELL" and strength == "EOD_FORCE":
                    unrealized_pnl_pct = (price / entry_price - 1) * 100
                    if (
                        unrealized_pnl_pct > 5.0
                    ):  # +5% 이상 수익일 때만 홀딩 (빈번한 매매용)
                        # 수익 중인 포지션: EOD 청산 건너뛰고 익일까지 홀딩
                        await self.webhook.send_alert(
                            title=f"🌙 [PAPER EOD HOLD] {ticker}",
                            description=(
                                f"현재가: ${price:.4f} | 수익률: +{unrealized_pnl_pct:.2f}%\n"
                                f"수익 포지션 — 익일 홀딩 (EOD 강제청산 면제)"
                            ),
                            color=0x3498DB,
                        )
                        return

                    result = await self._close_position(pos, price, "EOD Force Exit")
                    if result is None:
                        print(
                            f"⚠️ [{ticker}] Live EOD sell order rejected — retaining position"
                        )
                        return
                    await self.webhook.send_alert(
                        title=f"🛑 [PAPER EOD EXIT] {ticker}",
                        description=(
                            f"청산가: ${result['fill_price']:.4f} | 수익률: {result['pnl_pct']:.2f}%\n"
                            f"사유: 장 마감 손실 포지션 강제 청산 (15:30 ET)"
                        ),
                        color=0x95A5A6,
                    )
                    return

                # A-1. Time-Decay Exit
                # 조건: Scale-Out 미완료 & 진입 후 일정 시간 경과 & ±2% 횡보 구간
                # Scale-Out 완료 포지션은 이미 수익 확보 단계이므로 TS가 단독 관리 — Time-Decay 스킵
                if not is_scaled_out and pos.get("created_at"):
                    try:
                        now_utc = datetime.now(timezone.utc)
                        created_at_dt = datetime.fromisoformat(
                            pos["created_at"].replace("Z", "+00:00")
                        )

                        # 오버나이트 홀딩: 진입 시각 기준이 아닌 오늘 장 시작(09:30 ET) 기준으로 리셋
                        # → 전날 +5% 수익으로 홀딩한 포지션이 장 시작 즉시 Time-Decay 발동하는 것 방지
                        created_at_et = created_at_dt.astimezone(_NY_TZ)
                        now_et = now_utc.astimezone(_NY_TZ)
                        if created_at_et.date() < now_et.date():
                            market_open_et = now_et.replace(
                                hour=9, minute=30, second=0, microsecond=0
                            )
                            effective_start_utc = market_open_et.astimezone(
                                timezone.utc
                            )
                        else:
                            effective_start_utc = created_at_dt

                        elapsed_minutes = (
                            now_utc - effective_start_utc
                        ).total_seconds() / 60
                        unrealized_pnl_pct = (price / entry_price - 1) * 100

                        # 페니 종목: 90분 (변동성 높아 방향 형성에 더 오래 걸림)
                        # 일반 종목: 60분
                        decay_threshold = 90 if is_penny else 60

                        if (
                            elapsed_minutes > decay_threshold
                            and -2.0 <= unrealized_pnl_pct <= 2.0
                        ):
                            result = await self._close_position(
                                pos, price, "Time-Decay Exit"
                            )
                            if result is None:
                                print(
                                    f"⚠️ [{ticker}] Live time-decay sell order rejected — retaining position"
                                )
                                return
                            await self.webhook.send_alert(
                                title=f"⏳ [PAPER TIME-DECAY] {ticker}",
                                description=(
                                    f"청산가: ${result['fill_price']:.4f} | 수익률: {result['pnl_pct']:.2f}%\n"
                                    f"보유 시간: {int(elapsed_minutes)}분 (기준: {decay_threshold}분)\n"
                                    f"사유: 방향성 상실 (횡보 ±2%) — 슬롯 반납"
                                ),
                                color=0x7F8C8D,
                            )
                            return
                    except Exception as e:
                        print(f"⚠️ [Time-Decay] {ticker}: {e}")

                # A. TS 업데이트 (가역적 스위칭 스탑 적용)
                # atr<=0(데이터 부족 초기 구간)에도 동일 경로를 타도록 합성 ATR로 폴백한다.
                # 이전에는 atr<=0 분기에서만 페니 본전 락인(PENNY_BREAKEVEN_TRIGGER)을 체크했는데,
                # 실전에서는 atr>0이 상시 공급되므로 그 분기가 사실상 죽은 코드였다 — 통합으로 해결.
                if not is_scaled_out:
                    effective_atr = atr if atr > 0 else (entry_price * 0.02)
                    ts_threshold = update_reversible_trailing_stop(
                        entry_price, highest_price, effective_atr, smoothed_er, is_penny
                    )
                else:
                    # Scale-Out 후 물량: 이익 보전을 위해 TS_TRAIL_PCT로 타이트하게 조이거나 본절 유지
                    if atr > 0:
                        new_ts = max(
                            entry_price * SCALE_OUT_TS_PCT,
                            highest_price - (1.2 * atr),  # k=1.2 (Tight)
                        )
                    else:
                        new_ts = max(
                            entry_price * SCALE_OUT_TS_PCT, highest_price * TS_TRAIL_PCT
                        )
                    ts_threshold = max(ts_threshold, new_ts)

                # B. SCALE_OUT 체크
                profit_pct = price / entry_price - 1
                if is_penny:
                    # RSI arm은 최소 +5% 수익 확인 후 허용 (단순 변동성으로 인한 조기 청산 방지)
                    scale_trigger = (
                        rsi > PENNY_SCALE_OUT_RSI and profit_pct >= 0.05
                    ) or profit_pct >= PENNY_SCALE_OUT_PROFIT
                else:
                    # RSI arm은 최소 +5% 수익 확인 후 허용 (페니 분기와 동일 가드 —
                    # 그렇지 않으면 근접 손익분기점에서도 RSI만으로 조기 익절돼
                    # winner를 지나치게 일찍 자르게 된다)
                    scale_trigger = (
                        rsi > 52 and profit_pct >= 0.05
                    ) or profit_pct >= 0.07
                sell_slip = SLIPPAGE_SELL_PENNY if is_penny else SLIPPAGE_SELL_NORMAL
                if (
                    scale_trigger
                    and not is_scaled_out
                    and is_armed
                    and (price * (1.0 - sell_slip) > entry_price)
                ):
                    sell_units = units * SCALE_OUT_RATIO
                    # [Guide-3] 매도 슬리피지 적용
                    fill_sell_price = _apply_slippage(
                        price, is_buy=False, is_penny=is_penny
                    )
                    executed = await self._on_order_sell(
                        ticker, sell_units, fill_sell_price, "Scale-Out"
                    )
                    if executed is None:
                        print(
                            f"⚠️ [{ticker}] Live scale-out order rejected — retaining position"
                        )
                        return
                    sell_units, fill_sell_price = executed
                    profit_cash = sell_units * fill_sell_price

                    # 가상 계좌 업데이트 (cash_available만 갱신 — total_assets는 /api/broker/paper/account에서
                    # cash + invested_capital로 동적 계산하므로 DB 컬럼을 직접 쓰지 않음)
                    # _apply_cash_delta가 최신 잔액을 다시 읽고 원자적으로 반영한다 (stale acc 미사용).
                    await self._apply_cash_delta(profit_cash)

                    # 포지션 업데이트: 수량 반토막, TS 본절+1% 상향
                    new_ts_val = (
                        max(entry_price, highest_price * PENNY_TIGHT_TS_PCT)
                        if is_penny
                        else max(
                            entry_price * SCALE_OUT_TS_PCT, highest_price * TS_TRAIL_PCT
                        )
                    )
                    # Scale-Out 봉 진입가가 낮을 때 SCALE_OUT_TS_PCT(+1%)가 현재가를 초과할 수 있음
                    # → TS가 현재가 위에 세팅되면 다음 틱 즉시 강제 청산되므로 클램프
                    new_ts_val = min(new_ts_val, price)
                    update_data = {
                        "status": "SCALE_OUT",
                        "units": units - sell_units,
                        "is_scaled_out": True,
                        "ts_threshold": new_ts_val,
                        "highest_price": highest_price,
                        "current_price": price,
                        "scale_out_bar_count": 0,  # 쿨다운 카운터 초기화
                    }
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .update(update_data)
                        .eq("ticker", ticker)
                        .execute
                    )
                    # 관심종목 stop_loss 동기화 (TS 상향)
                    await self._sync_watchlist_stop_loss(ticker, new_ts_val)

                    slip_sell_pct = (fill_sell_price / price - 1) * 100
                    price_str = (
                        f"${fill_sell_price:.4f}"
                        if is_penny
                        else f"${fill_sell_price:.2f}"
                    )
                    ts_desc = (
                        f"-7% TS ${new_ts_val:.4f}"
                        if is_penny
                        else f"본절+1% ${new_ts_val:.2f}"
                    )
                    await self.webhook.send_alert(
                        title=f"🟠 [PAPER SCALE-OUT] {ticker}",
                        description=f"50% 분할 익절 완료: {price_str} (슬리피지 {slip_sell_pct:+.2f}%)\n방어선 상향: {ts_desc}",
                        color=0xE67E22,
                    )
                    # Scale-Out 부분 매도 이력 기록 (성과 분석용 — exit_reason으로 구분)
                    scale_pnl_pct = (fill_sell_price / entry_price - 1) * 100
                    scale_profit_amt = sell_units * (fill_sell_price - entry_price)
                    await asyncio.to_thread(
                        self.supabase.table("paper_history")
                        .insert(
                            {
                                "ticker": ticker,
                                "entry_price": entry_price,
                                "exit_price": fill_sell_price,
                                "signal_price": price,
                                "slippage_pct": slip_sell_pct,
                                "pnl_pct": scale_pnl_pct,
                                "profit_amt": scale_profit_amt,
                                "exit_reason": "Scale-Out 50%",
                            }
                        )
                        .execute
                    )

                    # KellySizer 캐시 무효화 (Scale-Out도 paper_history를 바꾸므로 전량 청산과 동일하게 처리)
                    if ticker in self._kelly_cache:
                        del self._kelly_cache[ticker]

                    return

                # C. TRAILING STOP 체크 (ARMED 해제 상태에서도 실행 — 손실 확대 방지 우선)
                # Scale-Out 직후 쿨다운: 잔여 물량이 흔들림에 즉시 손절되는 것을 방지
                bar_count = pos.get("scale_out_bar_count", SCALE_OUT_COOLDOWN_BARS)
                if is_scaled_out and bar_count < SCALE_OUT_COOLDOWN_BARS:
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .update(
                            {
                                "scale_out_bar_count": bar_count + 1,
                                "current_price": price,
                                "highest_price": highest_price,
                                "ts_threshold": ts_threshold,
                            }
                        )
                        .eq("ticker", ticker)
                        .execute
                    )
                    return  # 쿨다운 중: TS 체크 유예

                if price < ts_threshold:
                    # [Guide-3] 손절 매도 슬리피지 적용 (패닉 셀 상황 → 불리한 체결)
                    result = await self._close_position(pos, price, "Trailing Stop")
                    if result is None:
                        print(
                            f"⚠️ [{ticker}] Live trailing stop order rejected — retaining position"
                        )
                        return
                    status_emoji = "✅" if result["pnl_pct"] > 0 else "🛑"
                    slip_exit_pct = (result["fill_price"] / price - 1) * 100
                    await self.webhook.send_alert(
                        title=f"{status_emoji} [PAPER EXIT] {ticker}",
                        description=(
                            f"청산가: ${result['fill_price']:.4f} (슬리피지 {slip_exit_pct:+.2f}%) | 수익률: {result['pnl_pct']:.2f}%\n"
                            f"사유: 트레일링 스탑 발동"
                        ),
                        color=0x34495E,
                    )
                else:
                    # 일반 업데이트
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .update(
                            {
                                "current_price": price,
                                "highest_price": highest_price,
                                "ts_threshold": ts_threshold,
                            }
                        )
                        .eq("ticker", ticker)
                        .execute
                    )
                    # TS가 상향된 경우에만 watchlist stop_loss 동기화 (매 봉 불필요한 쓰기 방지)
                    if ts_threshold > pos["ts_threshold"]:
                        await self._sync_watchlist_stop_loss(ticker, ts_threshold)

        return False
