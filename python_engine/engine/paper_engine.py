from supabase import Client
from infra.webhook_manager import WebhookManager
import asyncio
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from services.quant_engine import SPIKE_GUARD_PCT_NORMAL
from utils.utils import et_time_bucket, is_backfilled_phantom_trade

_NY_TZ = ZoneInfo(
    "America/New_York"
)  # 모듈 레벨 캐시 — ZoneInfo는 호출마다 재생성 불필요

INITIAL_CAPITAL = 100000.0

# ── 포지션 사이징 / 리스크 상수 ──────────────────────────────────────────────
MIN_BUY_BUDGET = (
    100.0  # 최소 주문 금액 (달러) - 초소형 파편화 거래 방지 (기존 10.0에서 상향)
)
MAX_BUY_BUDGET = 1000.0  # 종목당 최대 매수 금액 (달러) — MAX_BUY_BUDGET × MAX_CONCURRENT = 총 배포 상한
# recommended_weight(quant_engine.calculate_position_sizing 반환)를 이 값으로 나눠
# "최대 확신(full conviction)" 대비 비율로 정규화한다. 아래 buy_budget 계산의
# effective_fraction 상한(min(recommended_weight/100, 0.25))과 반드시 같은 값이어야
# weight=상한일 때 정확히 MAX_BUY_BUDGET 전액이 나간다 (2026-08-05).
FULL_CONVICTION_FRACTION = 0.25
MAX_CONCURRENT_POSITIONS = 20  # 동시 보유 최대 종목 수 (실질 도달 가능 상한)
MAX_CONCENTRATION_PCT = 0.75  # 총 자산 대비 투입 비중 상한 (75%)
TS_INIT_PCT = 0.90  # 초기 트레일링 스탑: 진입가 × 90% (-10%, 손실 포지션 빠른 탈출)
TS_TRAIL_PCT = 0.95  # 최고가 갱신 시 TS 추적 비율: highest × 95%
NORMAL_BREAKEVEN_TRIGGER = 1.05  # 일반 종목도 +5% 달성 시 TS 하한을 진입가(본전)로 락인
SCALE_OUT_RATIO = 0.50  # Scale-Out 시 매도 비율 (50%)
SCALE_OUT_TS_PCT = 1.01  # Scale-Out 후 TS 본절 + 1%
POS_WEIGHT = 0.15  # paper_positions.weight 기록값

SCALE_OUT_COOLDOWN_BARS = 3  # Scale-Out 후 최소 3봉(분) 동안 TS 체크 유예

# ── 장기 보유 모드 (진입가 $1 초과 ~ $50 이하 전용, 2026-07-28) ──────────────
# 사용자 요청: $1 이하 페니는 낙폭이 너무 커서 제외하고, $1~$50 구간은 상승
# 추세를 최대한 길게 태운다 — Scale-Out/Time-Decay/EOD 강제청산 없이 최고가
# 대비 -5% 트레일링 스탑만 자동 방어선으로 둔다. 익절(수익 실현)은 자동화하지
# 않고 사용자가 기존 수동 매도(청산) 버튼으로 직접 결정한다.
LONG_TERM_MAX_PRICE = 50.0
LONG_TERM_TS_TRAIL_PCT = 0.97  # 최고가 추종 TS: highest × 97% (-3%). 진입 시점(highest=entry)에도 동일 폭 적용
# 2026-08-01: 라이브 거래이력 분석 결과 PF가 극소수 대박 거래(YYGH 등)에 전적으로
# 의존하는 구조임을 확인 — 트레일링을 넓혀 그 대박을 더 오래 태우면 나을 거라는
# 가설과 반대로, backtest_harness/run_long_term_trail_experiment.py 검증 결과는
# 정반대(타이트할수록 PF 개선)를 보였다. -15%~-2% 스윕에서 단조 증가(대형주/소형주
# 유니버스, 무슬리피지/실슬리피지, 전반부/후반부 시간 분할 전부 방향 일치)를 확인한 뒤
# 극단값(-1%~-2%)은 일봉 근사 백테스트가 분봉 실시간 체결의 휩쏘 비용을 못 담아낼
# 위험이 있어 제외하고, 검증된 범위 내 보수적인 값인 -5%→-3%로 변경했다.
# 기존 -5%는 0.95였다.
LONG_TERM_BREAKEVEN_TRIGGER = (
    1.02  # +2% 도달 이력이 있으면 TS 하한을 본전(entry_price)으로 락인 (2026-07-29)
)

# ── Scale-In (추가 매수, 2026-08-03) ────────────────────────────────────────
# 기존 엔진은 포지션당 최초 진입 이후 추가 매수 로직이 전혀 없어(process_signal()의
# 신규 진입 분기가 "포지션 없음"을 전제) ANTX처럼 수익이 계속 좋아지는 승자에도
# 절대 추가 배팅을 못 하는 구조였다. MAX_CONCENTRATION_PCT/MAX_BUY_BUDGET 상한을
# 그대로 적용하면서, 포지션당 평생 1회·최소 수익 확인 후에만 추가 매수를 허용한다.
SCALE_IN_ENABLED = True
SCALE_IN_PROFIT_TRIGGER = 0.15  # 미실현 수익 +15% 이상일 때만 추가 매수 검토
SCALE_IN_MAX_BUDGET = MAX_BUY_BUDGET * 0.5  # 추가 매수는 최초 예산 상한의 절반까지만

# ── 오버트레이딩(Whipsaw) 방지 파라미터 ──────────────────────────────────────
MAX_DAILY_TRADES_PER_TICKER = (
    2  # 종목당 하루 신규 진입(라운드트립) 최대 횟수 — Scale-Out 부분청산은 제외
)
VOLATILITY_MAX_RATIO = (
    0.05  # ATR/가격 비율이 이보다 크면 단기 과열/휩쏘로 판단해 진입 차단
)

# ── 눌림목(Pullback) 2차 대기 지정가 진입 파라미터 (2026-07-23) ──────────────
# 기존 Spike Guard(급등 스파이크 감지 시 이번 봉만 스킵)는 상태가 없어(stateless) 가격이
# 식으면 STRONG BUY 신호 자체가 사라져 재평가 기회가 거의 오지 않았다. 이 상수들은
# pullback_watches 테이블에 감시 상태를 영속시켜, 신호가 사라진 뒤에도 되돌림·반등을
# 계속 추적해 확인되면 직접 진입시키는 데 쓰인다.
PULLBACK_RETRACE_MIN_PCT_NORMAL = 0.03  # 고점 대비 최소 3% 되돌림 확인
PULLBACK_RETRACE_MAX_PCT = 0.20  # 고점 대비 20% 초과 하락은 추세 붕괴로 간주해 무효화
PULLBACK_MAX_WAIT_MINUTES = 45  # 이 시간 내 되돌림·반등이 확인되지 않으면 감시 만료
PULLBACK_MIN_RSI = 40  # 이보다 낮으면 "떨어지는 칼" 매수 방지 — 감시만 유지, 진입 안 함

KELLY_CACHE_TTL_SEC = (
    3600  # Kelly 통계(p/b/raw_kelly) 캐시 유효 시간 — ATR 페널티는 캐시 대상이 아님
)

# ── Chandelier Exit 파라미터 ──────────────────────────────────────────────────
# 고정 % TS 대신 ATR 기반으로 스탑 라인을 설정 → 변동성 높은 1분봉 스탑헌팅 내성 강화
# 공식: TS = Highest - k × ATR(14)
# ATR이 클수록 스탑이 내려가(더 여유롭게) 마켓메이커 노이즈를 필터링
CHANDELIER_K_NORMAL = 2.0  # 일반 종목: 타이트한 Chandelier k (빈번한 매매용)

# ── [Guide-3] 슬리피지 보정 (보수적 시뮬레이션) ─────────────────────────────
SLIPPAGE_BUY_NORMAL = 0.005  # 일반 종목 매수 슬리피지 +0.5%
SLIPPAGE_SELL_NORMAL = 0.005  # 일반 종목 매도 슬리피지 -0.5%
# 거래량이 극도로 낮은 종목은 슬리피지를 2× 가중 (유동성 패널티)
SLIPPAGE_LOW_VOLUME_THRESHOLD = 50_000  # 주/일 거래량 기준


def _apply_slippage(price: float, is_buy: bool, volume: int = 0) -> float:
    """
    체결 불리 방향으로 슬리피지를 반영한 보수적 모의 체결가 반환.
    - 매수: 시장가보다 높게 체결 (ask 쪽 스프레드)
    - 매도: 시장가보다 낮게 체결 (bid 쪽 스프레드)
    - 거래량 < SLIPPAGE_LOW_VOLUME_THRESHOLD → 슬리피지 2× 가중
    """
    base_pct = SLIPPAGE_BUY_NORMAL if is_buy else SLIPPAGE_SELL_NORMAL
    if volume > 0 and volume < SLIPPAGE_LOW_VOLUME_THRESHOLD:
        base_pct *= 2.0
    if is_buy:
        return round(price * (1.0 + base_pct), 6)
    else:
        return round(price * (1.0 - base_pct), 6)


from services.kelly_sizer import KellySizer

_kelly_sizer = KellySizer()


# ── ATR 기반 초기 스탑 폭 (2026-07-18) ───────────────────────────────────────
# 고정 %(TS_INIT_PCT) 하나로만 초기 스탑을 잡으면, 변동성이
# 큰 종목은 정상적인 가격 노이즈에도 스탑에 잘리고(승률 분석에서 확인된
# Trailing Stop 청산의 낮은 승률의 원인 중 하나) 변동성이 작은 종목은 스탑이
# 지나치게 느슨해 손실을 필요 이상으로 키운다. CHANDELIER_K_*(원래 정의만
# 되고 어디서도 쓰이지 않던 상수)를 사용해 ATR로 폭을 조절하되, 고정 % 대비
# 0.5~1.5배 범위로 클램프해 ATR 추정치가 튀어도 리스크가 과도하게 벌어지거나
# 좁아지지 않게 한다.
ENTRY_STOP_ATR_CLAMP_LOW = 0.5  # 고정 % 대비 최소 폭 배수
ENTRY_STOP_ATR_CLAMP_HIGH = 1.5  # 고정 % 대비 최대 폭 배수


def _compute_entry_stop_pct(
    entry_price: float,
    atr: float,
    atr_stop_enabled: bool = True,
    is_long_term: bool = False,
) -> float:
    """진입 시점 ATR로 초기 스탑 거리(0~1, 예: 0.12 = -12%)를 계산.

    ATR<=0(데이터 부족)이면 고정 %를 그대로 반환해 기존 동작과 동일하게
    폴백한다. 반환값은 이후 포지션 생존 기간 내내 재사용되는 고정값이므로,
    이 함수 자체는 진입 시 1회만 호출해야 한다(매 봉 호출 금지 — 라이브 ATR
    변동으로 이미 확보한 방어선이 흔들리면 안 됨).

    atr_stop_enabled=False면 개선 검증 트래커의 자동 롤백으로 ATR 기반 스탑이
    비활성화된 상태 — 항상 고정 %만 반환한다 (checklist.evaluate_improvement_rollback 참고).

    is_long_term=True(진입가 $1~$50)면 ATR·클램프와 무관하게 항상
    LONG_TERM_TS_TRAIL_PCT 기반 고정 %를 반환한다 — 이후 매 봉 트레일링 폭과
    진입 시점부터 동일해야 "최고가 대비 고정 %" 규칙이 일관되게 유지된다.
    """
    if is_long_term:
        return 1.0 - LONG_TERM_TS_TRAIL_PCT
    fixed_pct = 1.0 - TS_INIT_PCT
    if not atr_stop_enabled or atr <= 0 or entry_price <= 0:
        return fixed_pct
    atr_pct = (CHANDELIER_K_NORMAL * atr) / entry_price
    return min(
        max(atr_pct, fixed_pct * ENTRY_STOP_ATR_CLAMP_LOW),
        fixed_pct * ENTRY_STOP_ATR_CLAMP_HIGH,
    )


def _compute_locked_floor(
    entry_price: float,
    highest_price: float,
    entry_stop_pct: float | None = None,
) -> float:
    """
    비가역(monotonic) 리스크 방어 하한선.

    - 정적 초기 스탑은 항상 최저 방어선으로 유지된다. entry_stop_pct(진입 시점에
      1회 계산되어 DB에 저장된 ATR 기반 거리)가 있으면 그 값을, 없으면(레거시
      포지션) 고정 %를 사용한다 — 라이브 ATR을 여기서 다시 읽지 않는 이유는
      ATR 급변(뉴스 이벤트 등) 시 이미 확보한 방어선이 느슨해지는 것을 막기
      위함이다.
    - +5%(NORMAL_BREAKEVEN_TRIGGER) 이상 도달한 이력이 있으면 본전(entry_price)으로
      영구 락인된다. highest_price는 호출부에서 이미 max()로 단조 갱신되므로, 이
      락인 여부를 별도 상태(DB 컬럼/플래그) 없이 highest_price만으로 파생할 수 있다.
      (과거 이 락인이 없어 ATR 트레일링만으로 고점 근처에서 청산돼 수익이 거의 0%까지
      반납되는 사례가 있었다 — 2026-07-24 추가)
    """
    if entry_stop_pct is not None:
        init_pct = 1.0 - entry_stop_pct
    else:
        init_pct = TS_INIT_PCT
    static_floor = entry_price * init_pct
    if highest_price >= entry_price * NORMAL_BREAKEVEN_TRIGGER:
        return max(static_floor, entry_price)
    return static_floor


def update_reversible_trailing_stop(
    entry_price: float,
    highest_price: float,
    atr_value: float,
    current_smoothed_er: float,
    entry_stop_pct: float | None = None,
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

    locked_floor = _compute_locked_floor(entry_price, highest_price, entry_stop_pct)
    return max(locked_floor, adaptive_stop)


# ── 스프레드 게이트 (2026-07-31 Shadow 모드 도입 → 2026-08-06 실제 차단 게이트로 승격) ──
# 진입 체결 직전 IEX 최신 호가를 1회 조회해 bid/ask 스프레드를 확인한다.
# GSUN/SLGB/INUV/CHAI 등 과거 대형 손실을 재검토한 결과, 실제 원인은 "진입 시점
# 스프레드"가 아니라 청산 단계 감시 공백(폴링 갭·부분체결 회계·IEX 데이터 정체)이었고
# 전부 별도로 이미 수정돼 있어, 도입 당시엔 forward_return과의 실제 상관관계를
# 표본으로 확인하기 전까지 차단하지 않는 Shadow(기록 전용) 모드로 시작했다.
#
# 2026-08-06: engine_decisions.spread_pct 실측 42건(7/31~8/5)을 분석한 결과, 스프레드
# 자체는 forward_return과 무상관(방향성 문제 아님)이지만 확정 비용으로서는 심각했다 —
# 매수 체결 종목 중 SCYX 31.6%·INFU 30.6%·ISOU 29.75%·TSAT 28.9%·VOYG 27.7% 등 왕복
# 스프레드만으로 20~30%를 깎아먹는 종목이 다수 포함됨(스프레드>2% 비율 38.1%). 같은 날
# 먼저 시도한 스캔 유동성 하한(SCAN_MIN_DOLLAR_VOLUME, core/quant_scanner.py) 상향은
# 이 문제의 간접 대리지표였는데, 신호 발생 당일의 실제 일봉 거래대금으로 소급 검증한
# 결과 TSAT($13.9M)·VOYG($72.3M)·TTAN($81.2M)·AMIX($174.5M)·TPG($187.7M)처럼 일
# 거래대금이 매우 큰데도 순간 스프레드가 10~29%인 종목이 다수 있어(일 누적거래량과
# 특정 순간의 스프레드는 별개), 대리지표로는 이 표본의 35.7%(스프레드>3% 기준)밖에
# 못 걸렀다. 이미 실측되고 있는 spread_pct 자체를 직접 게이트로 쓰면 같은 기준에서
# 생존분 평균 스프레드가 0.51%까지 떨어져(대리지표 방식은 6.08%) 훨씬 정밀하다 —
# 그래서 대리지표(달러볼륨) 대신/추가로 이 실측값을 실제 차단 게이트로 승격한다.
#
# IEX는 저유동성 종목에서 호가가 몇 분씩 정체될 수 있음이 이미 확인됐으므로
# (ZNB 사례, 2026-07-30) quote_stale=True는 신뢰할 수 없는 스냅샷으로 간주해 차단
# 판단에 쓰지 않는다(다른 실패 경로와 동일하게 "확인 불가 시 차단하지 않음" 원칙).
# 매 1분봉·매 감시 종목마다 호출하면 과거 429 사고가 재현될 수 있으므로, 반드시
# 진입 확정 1회(주문 제출 직전)에만 호출한다 — 다른 곳에서 재사용 금지.
SPREAD_GATE_MAX_PCT = 3.0  # 이 값 초과(비-stale) 스프레드는 진입 차단
_SPREAD_QUOTE_STALE_THRESHOLD_SEC = (
    120  # position_ts_sweeper의 STALE_TRADE_THRESHOLD_SEC와 동일 기준
)
_SPREAD_QUOTE_TIMEOUT_SEC = 2.0  # 이 조회가 실주문 제출을 지연시키는 시간 상한
_spread_data_client = None


def _get_spread_data_client():
    global _spread_data_client
    if _spread_data_client is None:
        import os
        from alpaca.data.historical import StockHistoricalDataClient

        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")
        if not api_key or not api_secret:
            return None
        _spread_data_client = StockHistoricalDataClient(api_key, api_secret)
    return _spread_data_client


async def _fetch_quote_spread(ticker: str) -> tuple[float | None, bool | None]:
    """진입 확정 직전 1회 호출 전용. (spread_pct, quote_stale) 반환.

    실패·타임아웃 시 항상 (None, None)을 반환하고 예외를 던지지 않는다 —
    이 조회는 Shadow 로깅 전용이므로 실패가 실제 매수를 지연·차단해서는 안 된다.
    """
    client = _get_spread_data_client()
    if client is None:
        return None, None
    try:
        from alpaca.data.enums import DataFeed
        from alpaca.data.requests import StockLatestQuoteRequest

        req = StockLatestQuoteRequest(symbol_or_symbols=[ticker], feed=DataFeed.IEX)
        quote_map = await asyncio.wait_for(
            asyncio.to_thread(client.get_stock_latest_quote, req),
            timeout=_SPREAD_QUOTE_TIMEOUT_SEC,
        )
        quote = quote_map.get(ticker) if quote_map else None
        if quote is None or not quote.bid_price or not quote.ask_price:
            return None, None
        mid = (quote.bid_price + quote.ask_price) / 2
        if mid <= 0:
            return None, None
        spread_pct = (quote.ask_price - quote.bid_price) / mid * 100
        quote_stale = None
        if quote.timestamp is not None:
            age_sec = (datetime.now(timezone.utc) - quote.timestamp).total_seconds()
            quote_stale = age_sec > _SPREAD_QUOTE_STALE_THRESHOLD_SEC
        return round(spread_pct, 4), quote_stale
    except Exception as e:
        print(f"⚠️ [Spread Shadow] {ticker} 호가 조회 실패(무시, 진입엔 영향 없음): {e}")
        return None, None


class PaperTradingManager:
    # LiveTradingManager가 True로 오버라이드 — _close_position()의 하드 스탑
    # 시뮬레이션처럼 "실제 체결가가 없는 페이퍼 모드에서만" 적용해야 하는 로직을
    # 구분하는 데 사용한다.
    IS_LIVE = False

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

        # OBSERVE_CANDIDATE 로깅 쿨다운(2026-07-31) — DNA>=50이지만 STRONG BUY에
        # 못 미치는 신호를 매 1분봉마다 그대로 기록하면 티커 하나가 며칠씩 DNA 50대에
        # 머무를 때 사실상 같은 사건이 수백 행으로 중복 적재된다. 15분은
        # scripts/run_feature_significance.py의 독립 사건 판정 창(같은 티커 15분 이내
        # 재등장 시 같은 사건으로 묶음)과 동일하게 맞춰, 로깅 단계에서부터 그 기준에
        # 맞는 표본만 쌓이도록 한다.
        self._observe_log_cooldown: dict[str, float] = {}
        self.OBSERVE_LOG_COOLDOWN_SEC = 15 * 60

        # ── 개선 검증 트래커 자동 롤백 대상 파라미터 (2026-07-20) ──────────────
        # 모듈 상수 대신 인스턴스 속성으로 둬서, checklist.evaluate_improvement_rollback()가
        # REGRESSED 연속 판정 시 프로세스 재시작 없이 즉시 되돌릴 수 있게 한다.
        # 서버 기동 시 system_settings에 저장된 값으로 덮어써진다(app/main.py run_startup_sequence).
        self.atr_stop_enabled = True
        self.max_daily_trades_per_ticker = MAX_DAILY_TRADES_PER_TICKER
        self.REENTRY_COOLDOWN_MINUTES = self.REENTRY_COOLDOWN_MINUTES
        # "고점 매수" 개선(2026-07-20): 확장도 가드(페니 임계값 강화) + 급등 스파이크 가드.
        # extension_guard_penny_tight_enabled는 quant_engine.calculate_advanced_signals()의
        # penny_extension_tight 인자로 그대로 흘러들어간다(core/pulse.py, core/quant_scanner.py
        # 참고) — DNA 점수 산출 자체에 영향을 주므로 이 엔진 레벨에서 직접 게이트를 걸지 않는다.
        self.extension_guard_penny_tight_enabled = True
        self.spike_guard_enabled = True
        # 눌림목 2차 대기 지정가 진입 (2026-07-23) — 개선 검증 트래커(pullback_entry
        # 항목)가 REGRESSED 연속 판정 시 False로 되돌려 기존 Spike Guard(즉시 차단)
        # 동작으로 복귀시킬 수 있다.
        self.pullback_entry_enabled = True
        # Scale-In(추가매수, 2026-08-04) — 개선 검증 트래커(checklist.py)가 REGRESSED
        # 연속 판정 시 이 인스턴스 속성을 False로 내려 즉시 비활성화할 수 있다
        # (atr_stop_enabled 등과 동일 패턴). 모듈 상수 SCALE_IN_ENABLED는 이 속성의
        # 초기값으로만 쓰인다.
        self.scale_in_enabled = SCALE_IN_ENABLED

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
        adx: float = None,
        macd_diff: float = None,
        is_extended: bool = None,
        atr_pct: float = None,
        spread_pct: float = None,
        quote_stale: bool = None,
        efficiency_ratio: float = None,
        z_score_20: float = None,
        ma20_deviation_pct: float = None,
        breakout_deviation_pct: float = None,
    ):
        """게이트 통과/차단 결과를 engine_decisions 테이블에 기록.

        adx/macd_diff/is_extended/atr_pct는 feature_significance 분석(2026-07-29)이
        daily_discovery의 최신 스냅샷(결정 시점과 시간이 안 맞는 근사치)에 의존하지
        않고 결정 시점 값 그대로 DNA_Score 구성 요소의 예측력을 검증할 수 있도록
        추가됐다 — 호출부(_process_signal_locked)가 실제 값을 못 받은 경로(예: HOLD
        경량 경로)는 None으로 남는다.

        spread_pct/quote_stale은 스프레드 게이트(2026-07-31 Shadow 모드 도입, 2026-08-06
        차단 게이트로 승격) 전용 — 진입 EXECUTED 또는 SPREAD_TOO_WIDE로 BLOCKED된
        시점에만 채워지고 나머지 gate 호출은 None으로 남는다.

        efficiency_ratio(smoothed_er)는 DNA_Score 무용론 확정(2026-07-31, 4중 검증)
        이후 대안 피처 후보 검증용으로 추가됐다 — trailing stop 레짐 판정에 이미
        쓰이던 값을 재사용만 하는 것이라 매매 로직에는 아무 영향이 없다.

        time_bucket/market_regime(2026-08-08)은 호출부가 넘기지 않고 여기서 직접
        산출한다 — 신호 시점의 시각과 전역 시장 상태만으로 결정되는 값이라 호출
        경로(전체 DNA 경로/HOLD 경량 경로/스위퍼)마다 따로 전달할 이유가 없고,
        한 곳에서 채워야 경로별 누락이 생기지 않는다. 시장 레짐 캐시가 없거나
        낡았으면(None) 컬럼은 NULL로 남으며 매매 판단에는 일절 쓰이지 않는다."""
        try:
            market_regime = None
            try:
                from app.state import app_state  # 순환 import 회피 (지연 import)

                if app_state.mtf_cache:
                    market_regime = app_state.mtf_cache.get_market_regime()
            except Exception:
                market_regime = None  # 레짐 조회 실패가 결정 로깅 자체를 막지 않도록

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
                "adx": adx,
                "macd_diff": macd_diff,
                "is_extended": is_extended,
                "atr_pct": atr_pct,
                "spread_pct": spread_pct,
                "quote_stale": quote_stale,
                "efficiency_ratio": efficiency_ratio,
                "z_score_20": z_score_20,
                "ma20_deviation_pct": ma20_deviation_pct,
                "breakout_deviation_pct": breakout_deviation_pct,
                "time_bucket": et_time_bucket(),
                "market_regime": market_regime,
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
        self,
        _ticker: str,
        qty: float,
        price: float,
        _order_kind: str = "MARKET",
        _limit_price: float | None = None,
        _stop_price: float | None = None,
    ) -> tuple[float, float] | None:
        """매수 실행 훅 — 반환값은 (실제 체결 수량, 실제 체결 단가), 실패 시 None.
        Paper 모드는 시뮬레이션 슬리피지 가격이 곧 체결가이므로 order_kind/limit_price와
        무관하게 입력값을 그대로 반환(1분봉 종가 단위라 봉 내 지정가 체결을 시뮬레이션할
        수 없음). LiveTradingManager는 Alpaca submit_order() 실체결가(filled_avg_price)로
        오버라이드하고, order_kind="LIMIT"이면 실제 지정가 주문을 제출한다.
        _stop_price는 LIVE 전용 — 매수 체결 후 브로커 사이드 Stop-Market 주문을
        등록할 초기 스탑가. Paper 모드는 1분봉 TS 시뮬레이션만 쓰므로 무시한다."""
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
        external_fill: tuple[float, float] | None = None,
    ) -> dict | None:
        """
        포지션 전량 청산 공통 경로 — 청산 클레임(원자적 상태 전환) → 슬리피지 적용 →
        실주문 제출(LIVE 모드는 체결 확인까지) → 현금 갱신 → paper_history 기록 →
        paper_positions 삭제 → watchlist EXITED 동기화.

        Railway 배포 중 신·구 컨테이너가 겹치는 등 asyncio.Lock이 보호하지 못하는
        프로세스 간 중복 실행이 발생해도, 이 클레임 단계의 원자적 UPDATE(Postgres 행
        잠금)가 두 번째 호출을 조기에 차단해 중복 실주문/이중 기록을 방지한다.

        실주문 실패/체결 미확인 시 None 반환 — 포지션은 그대로 유지되며 DB는 기록되지 않는다.

        external_fill=(체결 수량, 체결 단가)가 주어지면 브로커 단에서 이미 체결이
        끝난 매도(예: Alpaca 사이드 Stop-Market 발동)를 회계에만 반영하는 모드다 —
        슬리피지 시뮬레이션과 _on_order_sell()(신규 주문 제출)을 건너뛰고, 전달받은
        실체결 값으로 곧장 현금/이력/포지션 정리를 수행한다.
        """
        ticker = pos["ticker"]
        entry_price = float(pos["entry_price"])
        units = float(pos["units"])
        requested_units = (
            units  # 이번 호출이 청산하려던 원래 전체 수량 (부분체결 판정 기준)
        )
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
            # 클레임 실패 사유를 명시적으로 남겨 호출부(예: manual_paper_sell)가
            # last_order_fail_reason에 남아있던 다른 티커의 stale 값(NO_POSITION 등)을
            # 오독해 "성공"으로 잘못 응답하지 않게 한다.
            self.last_order_fail_reason = "CLAIM_CONFLICT"
            return None

        cash_applied = False
        history_inserted = False
        try:
            if external_fill is not None:
                # 브로커 단에서 이미 체결 완료 — 주문 제출 없이 실체결 값만 반영
                units, fill_price = external_fill
            else:
                fill_price = _apply_slippage(signal_price, is_buy=False)
                executed = await self._on_order_sell(
                    ticker, units, fill_price, exit_reason
                )
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

            # ── 부분체결 판정 (LIVE 전용, GSUN 2026-07-27 사고) ─────────────────────
            # _close_position()은 항상 "전량 청산" 의도로 호출되는데, 저유동성 종목은
            # close_all 시장가 주문도 극단적으로는 요청 수량의 일부만 체결되고 나머지는
            # 타임아웃으로 취소될 수 있다(_submit_alpaca_order 참고). 이 경우 실체결분
            # (units)만 paper_history에 팔린 것으로 기록하고, 남은 물량은 포지션을 삭제하는
            # 대신 units를 잔여분으로 정정해 HOLD 유지한다 — 그래야 다음 TS 스위퍼
            # 사이클이 잔여 물량을 계속 청산 시도한다. 이걸 빼먹으면 체결분만 "전체 청산
            # 완료"로 기록되고 나머지는 DB 어디에도 안 잡히는 유령 보유가 된다(2026-07-27
            # GSUN: 2,614주 중 373주만 체결됐는데 전량 청산으로 기록되어 잔여 2,241주가
            # 이틀 가까이 무방비로 방치되다 사용자가 Alpaca에서 직접 발견해 수동 매도함).
            # 판정 기준은 "요청 대비 비율"이 아니라 "잔여 1주 이상"이다 — 미국 주식
            # 시장가 주문은 정수 수량으로 나가므로 1주만 남아도 실제 보유이고, 비율
            # 기준을 쓰면 요청 수량이 클수록 문턱이 함께 커져 실보유가 반올림 오차로
            # 오분류된다(2026-08-03 FUSE: 789주 중 782주 체결, 잔여 7주가 1% 문턱
            # 7.89주에 0.89주 못 미쳐 전량 청산으로 기록 → 7주가 -19%까지 무감시 방치).
            # 1주 미만(소수점 수량 계좌의 반올림 오차)만 완전 종료로 간주한다.
            PARTIAL_CLOSE_MIN_UNITS = 1.0
            remaining_units = requested_units - units
            is_partial_close = (
                external_fill is None and remaining_units >= PARTIAL_CLOSE_MIN_UNITS
            )

            # ── 브로커 하드 스탑(Hard Stop-Loss) 주문 시뮬레이션 (PAPER 전용) ────────
            entry_stop_pct = pos.get("entry_stop_pct")
            hard_stop_init_pct = (
                (1.0 - entry_stop_pct) if entry_stop_pct is not None else TS_INIT_PCT
            )
            hard_stop_limit = entry_price * hard_stop_init_pct
            if (
                not self.IS_LIVE
                and exit_reason == "Trailing Stop"
                and fill_price < hard_stop_limit
            ):
                simulated_broker_fill = hard_stop_limit * 0.98
                if simulated_broker_fill > fill_price:
                    print(
                        f"🛡️ [Hard Stop 방어] {ticker} 급락(데이터 공백) 방어! "
                        f"기존 {fill_price:.4f} -> 브로커 스탑 체결가 {simulated_broker_fill:.4f} 로 보정"
                    )
                    fill_price = simulated_broker_fill

            pnl_pct = (fill_price / entry_price - 1) * 100
            profit_amt = (fill_price - entry_price) * units
            proceeds = units * fill_price
            history_data = {
                "ticker": ticker,
                "entry_price": entry_price,
                "exit_price": fill_price,
                "signal_price": signal_price,
                "slippage_pct": (fill_price / signal_price - 1) * 100,
                "pnl_pct": pnl_pct,
                "profit_amt": profit_amt,
                "exit_reason": exit_reason,
                "scaled_in": bool(pos.get("scaled_in", False)),
            }

            await self._apply_cash_delta(proceeds)
            cash_applied = True
            history_data["exit_reason"] = (
                f"{exit_reason} (부분체결 {units:.2f}/{requested_units:.2f}주)"
                if is_partial_close
                else exit_reason
            )
            await asyncio.to_thread(
                self.supabase.table("paper_history").insert(history_data).execute
            )
            history_inserted = True

            if is_partial_close:
                # 잔여 물량이 남아있다 — 삭제 대신 units만 정정해 HOLD로 되돌려
                # TS 스위퍼가 다음 사이클에서 남은 물량을 계속 청산 시도하게 한다.
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update({"status": original_status, "units": remaining_units})
                    .eq("ticker", ticker)
                    .execute
                )
                print(
                    f"⚠️ [{ticker}] 부분체결 청산 — {units:.2f}주만 체결, "
                    f"잔여 {remaining_units:.2f}주는 포지션 유지 (다음 스위퍼 사이클에서 재시도)"
                )
                await self.webhook.send_alert(
                    title=f"⚠️ [부분체결 청산] {ticker}",
                    description=(
                        f"{exit_reason} 청산 요청 {requested_units:.2f}주 중 {units:.2f}주만 "
                        f"체결됐습니다 (@ ${fill_price:.4f}). 잔여 {remaining_units:.2f}주는 "
                        f"포지션을 유지하며 다음 청산 사이클에서 계속 재시도합니다."
                    ),
                    color=0xE67E22,
                )
            else:
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .delete()
                    .eq("ticker", ticker)
                    .execute
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
        except Exception as close_err:
            if cash_applied:
                # 현금은 이미 매도 대금으로 반영됐다 — paper_history 기록과 paper_positions
                # 삭제만 실패한 것이므로 즉시 1회 재시도한다. 재시도까지 실패하면 CLOSING으로
                # 묶어두고 TS Sweeper의 CLOSING 복구 로직(5분 후)에 위임한다.
                print(
                    f"🚨 [_close_position 부분 실패] {ticker}: {close_err} — "
                    f"현금은 이미 반영됨, 후속 기록 즉시 재시도"
                )
                retry_ok = False
                try:
                    # paper_history INSERT 재시도 — 최초 시도에서 이미 성공했다면
                    # (실패 지점이 delete/watchlist-sync였다면) 중복 삽입을 피한다.
                    if not history_inserted:
                        await asyncio.to_thread(
                            self.supabase.table("paper_history")
                            .insert(history_data)
                            .execute
                        )
                    # paper_positions 정리 재시도 — 부분체결이면 삭제 대신 잔여수량으로 HOLD 유지
                    if is_partial_close:
                        await asyncio.to_thread(
                            self.supabase.table("paper_positions")
                            .update(
                                {"status": original_status, "units": remaining_units}
                            )
                            .eq("ticker", ticker)
                            .execute
                        )
                    else:
                        await asyncio.to_thread(
                            self.supabase.table("paper_positions")
                            .delete()
                            .eq("ticker", ticker)
                            .execute
                        )
                        try:
                            await self._sync_watchlist_exit(ticker)
                        except Exception:
                            pass  # watchlist 동기화 실패는 치명적이지 않음
                    if ticker in self._kelly_cache:
                        del self._kelly_cache[ticker]
                    retry_ok = True
                    print(
                        f"✅ [_close_position 복구 성공] {ticker}: 후속 기록 재시도 완료"
                    )
                except Exception as retry_err:
                    print(
                        f"❌ [_close_position 복구 재실패] {ticker}: {retry_err} — "
                        f"CLOSING 상태 유지, TS Sweeper 자동 복구에 위임"
                    )

                if not retry_ok:
                    await self.webhook.send_alert(
                        title=f"🚨 [정산 불일치 위험] {ticker}",
                        description=(
                            f"청산 대금은 이미 계좌에 반영됐지만 이후 기록 단계에서 오류가 발생했습니다: `{close_err}`\n"
                            f"자동 재시도도 실패했습니다. TS Sweeper가 5분 후 자동 복구를 시도합니다.\n"
                            f"포지션은 재거래 방지를 위해 CLOSING 상태로 유지됩니다."
                        ),
                        color=0xFF0000,
                    )
                    raise close_err
                # 재시도 성공 — 정상 결과 반환
                return {
                    "fill_price": fill_price,
                    "units": units,
                    "pnl_pct": pnl_pct,
                    "profit_amt": profit_amt,
                }
            else:
                print(
                    f"❌ [_close_position 오류 발생] {ticker}: {close_err} — 상태({original_status}) 복구"
                )
                # 현금 미반영 상태이므로 실주문도 제출되지 않았을 가능성이 높다. 되돌리기
                # 자체가 실패하면 CLOSING에 영구 고착(CHAI 2026-07-22 사고)되므로 1회 재시도한다.
                # 재시도도 실패하면 CLOSING을 유지 — TS Sweeper가 Alpaca 실제 포지션을 대조해
                # 안전하게 처리한다(브로커에 물량이 남아있으면 클레임 해제, 없으면 DB만 정리).
                try:
                    await asyncio.to_thread(
                        self.supabase.table("paper_positions")
                        .update({"status": original_status})
                        .eq("ticker", ticker)
                        .execute
                    )
                except Exception as revert_err:
                    print(
                        f"🚨 [_close_position 되돌리기 실패] {ticker}: {revert_err} — "
                        f"CLOSING 상태 유지, TS Sweeper 자동 복구에 위임"
                    )
                    try:
                        await asyncio.to_thread(
                            self.supabase.table("paper_positions")
                            .update({"status": original_status})
                            .eq("ticker", ticker)
                            .execute
                        )
                    except Exception as revert_retry_err:
                        print(
                            f"🚨 [_close_position 되돌리기 재시도 실패] {ticker}: {revert_retry_err} "
                            f"— CLOSING 고착, Sweeper 위임"
                        )
            raise close_err

    async def manual_partial_sell(
        self, pos: dict, signal_price: float, sell_units: float
    ) -> dict | None:
        """사령관 수동 부분 매도 — 요청 수량만 매도하고 나머지는 포지션에 그대로 남긴다.

        Scale-Out(process_signal 내부)과 동일한 "일부 매도 → units 정정" 패턴을
        재사용하되, 자동 트리거(RSI/수익률) 대신 사용자가 직접 수량을 지정한다는
        점만 다르다. TS(ts_threshold)는 건드리지 않는다 — 자동 Scale-Out과 달리
        사용자가 이미 직접 판단해 일부만 정리한 것이므로, 남은 물량의 방어선을
        임의로 조이지 않고 기존 트레일링 스탑 로직이 계속 관리하게 둔다.

        호출부(manual_paper_sell)가 이미 engine._get_exit_lock(ticker) 안에서
        호출하므로 자동 청산 경로(EOD/Time-Decay/Scale-Out/Trailing Stop)와의
        경합은 그 락이 막는다.
        """
        ticker = pos["ticker"]
        entry_price = float(pos["entry_price"])
        units = float(pos["units"])

        fill_price = _apply_slippage(signal_price, is_buy=False)
        executed = await self._on_order_sell(
            ticker, sell_units, fill_price, "Manual Partial Sell"
        )
        if executed is None:
            return None
        sell_units, fill_price = executed

        proceeds = sell_units * fill_price
        await self._apply_cash_delta(proceeds)

        remaining_units = round(units - sell_units, 4)
        await asyncio.to_thread(
            self.supabase.table("paper_positions")
            .update({"units": remaining_units, "current_price": fill_price})
            .eq("ticker", ticker)
            .execute
        )

        pnl_pct = (fill_price / entry_price - 1) * 100
        profit_amt = sell_units * (fill_price - entry_price)
        await asyncio.to_thread(
            self.supabase.table("paper_history")
            .insert(
                {
                    "ticker": ticker,
                    "entry_price": entry_price,
                    "exit_price": fill_price,
                    "signal_price": signal_price,
                    "slippage_pct": (fill_price / signal_price - 1) * 100,
                    "pnl_pct": pnl_pct,
                    "profit_amt": profit_amt,
                    "exit_reason": f"Manual Partial Sell ({sell_units:.2f}주)",
                }
            )
            .execute
        )

        if ticker in self._kelly_cache:
            del self._kelly_cache[ticker]

        return {
            "fill_price": fill_price,
            "sold_units": sell_units,
            "remaining_units": remaining_units,
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
        recent_spike_pct: float = 0.0,
        rvol: float | None = None,
        adx: float | None = None,
        macd_diff: float | None = None,
        is_extended: bool | None = None,
        z_score_20: float | None = None,
        ma20_deviation_pct: float | None = None,
        breakout_deviation_pct: float | None = None,
    ) -> bool:
        """진입/청산 처리 — 매수는 _get_buy_lock, 청산은 _get_exit_lock으로 각각
        직렬화한다 (_process_signal_locked 내부에서 분기별로 락을 잡는다). 두 락을
        분리한 이유는 매수 체결 확인 대기(최대 5초, LIVE 모드)가 같은 티커의
        트레일링 스탑/수동매도를 지연시키지 않도록 하기 위함이다.

        rvol/adx/macd_diff/is_extended/z_score_20/ma20_deviation_pct/
        breakout_deviation_pct는 매매 로직에 관여하지 않고 engine_decisions
        로깅 전용이다 (2026-07-29, feature_significance 분석용 — 호출부가 없으면
        None으로 남아 로그에도 null로 기록된다). z_score_20 이하 3개는 신규 알파
        팩터 가설(평균회귀/모멘텀/변동성 돌파) 검증용으로 2026-08-05 추가."""
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
            recent_spike_pct=recent_spike_pct,
            rvol=rvol,
            adx=adx,
            macd_diff=macd_diff,
            is_extended=is_extended,
            z_score_20=z_score_20,
            ma20_deviation_pct=ma20_deviation_pct,
            breakout_deviation_pct=breakout_deviation_pct,
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
        recent_spike_pct: float = 0.0,
        rvol: float | None = None,
        adx: float | None = None,
        macd_diff: float | None = None,
        is_extended: bool | None = None,
        z_score_20: float | None = None,
        ma20_deviation_pct: float | None = None,
        breakout_deviation_pct: float | None = None,
    ) -> bool:
        """
        v4 State Machine:
        1. STRONG BUY (DNA≥75) → 매수 (recommended_weight 비중 or 기본 KELLY_FRACTION)
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

        # engine_decisions 로깅 전용 파생값 (매매 로직에는 관여하지 않음, 2026-07-29)
        atr_pct = round(atr / price * 100, 4) if price else None

        # --- 1. 신규 매수 (STRONG BUY & No position) ---
        # quant_engine.calculate_advanced_signals()의 tier2(DNA≥75) 기준과 정합. Strong_Buy는
        # DNA 기준(tier1/2) 외에 numba_strong_buy(RSI·RVOL 백분위 랭크 기반) 경로로도 True가
        # 될 수 있어 DNA_Score가 tier 기준 미만인 신호가 섞여 들어올 수 있으므로, 이 게이트가
        # tier 최저선 아래로는 항상 차단해야 한다.
        dna_gate = 75

        # ── 눌림목 감시 확인 ──────────────────────────────────────────────────
        # 포지션이 없는 티커에 활성 pullback_watches 행이 있으면, 이번 호출의
        # signal_type/strength와 무관하게(신호가 사라졌어도) 되돌림·반등·무효화·만료를
        # 매번 평가한다. 감시 중이면 이번 호출은 여기서 끝낸다 — 아직 포지션을 열지
        # 않았으므로 아래 신규 매수 게이트로 넘어가면 같은 신호가 이중 처리될 수 있다.
        if not pos and is_armed:
            watch_resolved = await self._evaluate_pullback_watch(
                ticker=ticker,
                price=price,
                rsi=rsi,
                signal_type=signal_type,
                dna_score=dna_score,
                recommended_weight=recommended_weight,
                atr=atr,
                ai_report=ai_report,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
            )
            if watch_resolved is not None:
                return watch_resolved

        # ── OBSERVE_CANDIDATE (2026-07-31, 매매 로직과 무관한 관찰 전용 로깅) ──
        # DNA_Score 무용론이 4중 검증(백테스트 3회 + engine_decisions 실측)으로 확정된
        # 뒤, 대안 피처(RSI 역상관 등) 검증에 쓸 표본을 더 빨리 쌓기 위한 것.
        # 기존 DNA_GATE 로깅은 signal_type=="BUY"(=Strong_Buy) 조건에서만 발동해
        # DNA 50~74대 대부분(Strong_Buy가 아닌 HOLD 신호)이 로그에 전혀 남지 않았다.
        # 티커당 15분 쿨다운(analysis 스크립트의 독립 사건 판정 창과 동일)을 둬서
        # 같은 티커가 DNA 50대에 며칠씩 머물러도 수백 행이 중복 적재되지 않게 한다.
        if (
            not pos
            and dna_score >= 50
            and not (signal_type == "BUY" and strength == "STRONG")
        ):
            last_logged = self._observe_log_cooldown.get(ticker, 0.0)
            if time.time() - last_logged >= self.OBSERVE_LOG_COOLDOWN_SEC:
                self._observe_log_cooldown[ticker] = time.time()
                await self._log_decision(
                    ticker=ticker,
                    gate="OBSERVE_CANDIDATE",
                    outcome="BLOCKED",
                    signal=signal_type,
                    dna_score=dna_score,
                    rsi=rsi,
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    efficiency_ratio=smoothed_er,
                    price=price,
                    note=f"관찰 전용 — DNA {dna_score:.1f} (Strong_Buy 아님, 매매 로직 미관여)",
                )

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
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    efficiency_ratio=smoothed_er,
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
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    efficiency_ratio=smoothed_er,
                    price=price,
                    note=f"DNA {dna_score:.1f} < gate {dna_gate}",
                )
                return

            # 글로벌 서킷 브레이커 (Whipsaw 패닉장 방어)
            try:
                # NY 자정을 UTC로 변환해 조회해야 한다 — 날짜 문자열에 그대로
                # "T00:00:00Z"를 붙이면 UTC 자정 기준이 되어 NY 자정(UTC 04-05시)보다
                # 4~5시간 이르게 잡혀 전날 애프터아워 거래까지 "오늘"에 섞여 든다.
                today_ny_midnight_utc = (
                    datetime.now(_NY_TZ)
                    .replace(hour=0, minute=0, second=0, microsecond=0)
                    .astimezone(timezone.utc)
                )
                cb_history = await asyncio.to_thread(
                    self.supabase.table("paper_history")
                    .select("pnl_pct,profit_amt,exit_reason")
                    .gte("closed_at", today_ny_midnight_utc.isoformat())
                    .execute
                )
                # phantom position 사고 복구 백필 행은 같은 사건의 실제 청산 행과 나란히
                # 남아있어 당일 손실을 2배로 잡히게 만든다 (2026-07-23 발견, checklist.py/
                # strategy.py의 동일 이슈와 같은 원인) — 서킷브레이커 오발동 방지를 위해 제외.
                cb_rows = [
                    r
                    for r in (cb_history.data or [])
                    if not is_backfilled_phantom_trade(r)
                ]
                if len(cb_rows) > 0:
                    total_pnl = sum(float(r.get("profit_amt") or 0) for r in cb_rows)
                    loss_count = sum(
                        1 for r in cb_rows[-5:] if float(r.get("pnl_pct") or 0) < 0
                    )

                    if loss_count >= 5 or total_pnl <= -(
                        acc.get("capital", INITIAL_CAPITAL) * 0.02
                    ):
                        from app.state import app_state

                        app_state.SYSTEM_ARMED = False
                        print(
                            f"🚨 [CIRCUIT BREAKER] 당일 연속 손절 {loss_count}회 또는 누적 손실 ${total_pnl:.2f}. 시스템 강제 정지(ARMED=False)."
                        )
                        await self._log_decision(
                            ticker=ticker,
                            gate="CIRCUIT_BREAKER",
                            outcome="BLOCKED",
                            signal=signal_type,
                            dna_score=dna_score,
                            rsi=rsi,
                            rvol=rvol,
                            adx=adx,
                            macd_diff=macd_diff,
                            is_extended=is_extended,
                            z_score_20=z_score_20,
                            ma20_deviation_pct=ma20_deviation_pct,
                            breakout_deviation_pct=breakout_deviation_pct,
                            atr_pct=atr_pct,
                            price=price,
                            note="Global Circuit Breaker Activated",
                        )
                        return
            except Exception as cb_err:
                print(f"⚠️ [Circuit Breaker Check] 실패: {cb_err}")

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
                # 백필 행 제외(위 서킷브레이커와 동일 사유) — 안 그러면 사고 복구 하루에
                # 종목별 일일 거래 한도(MAX_DAILY_TRADES_PER_TICKER)가 조기 소진돼 정상
                # 재진입까지 차단될 수 있다.
                recent_history_rows = [
                    r
                    for r in (recent_history.data or [])
                    if not is_backfilled_phantom_trade(r)
                ]
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
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
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
                if daily_trade_count >= self.max_daily_trades_per_ticker:
                    await self._log_decision(
                        ticker=ticker,
                        gate="DAILY_TRADE_LIMIT",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"당일 거래 {daily_trade_count}건 ≥ 한도 {self.max_daily_trades_per_ticker}건",
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
                vol_cap = VOLATILITY_MAX_RATIO
                if volatility_ratio > vol_cap:
                    await self._log_decision(
                        ticker=ticker,
                        gate="VOLATILITY_FILTER",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"ATR/가격비 {volatility_ratio*100:.1f}% > 상한 {vol_cap*100:.1f}%",
                    )
                    print(
                        f"🛑 [Volatility Filter] {ticker} 변동성비 {volatility_ratio*100:.1f}% — 신규 진입 차단."
                    )
                    return

            # 급등 스파이크 가드: 직전 SPIKE_GUARD_LOOKBACK(5)봉 저점 대비 현재가가 과도하게
            # 튀었으면 "돌파 확인 봉"을 바로 사는 대신 눌림목(재조정)을 기다린다.
            # pullback_entry_enabled=True(기본값)이면 눌림목 감시 행을 등록해 신호가 사라진
            # 뒤에도 되돌림·반등을 계속 추적한다(_register_pullback_watch). 개선 검증
            # 트래커가 REGRESSED로 자동 롤백하면 False가 되어 예전처럼 이번 봉만 스킵하고
            # 잊는(stateless) 동작으로 되돌아간다 — 다음 봉에서 STRONG BUY가 재발화해야만
            # 재평가되므로, 가격이 식으면 실제로는 재평가 기회가 거의 오지 않는다.
            if self.spike_guard_enabled and recent_spike_pct > 0:
                spike_cap = SPIKE_GUARD_PCT_NORMAL
                if recent_spike_pct > spike_cap:
                    if self.pullback_entry_enabled:
                        await self._register_pullback_watch(
                            ticker=ticker,
                            price=price,
                            dna_score=dna_score,
                            atr=atr,
                            recommended_weight=recommended_weight,
                            signal_type=signal_type,
                            strength=strength,
                            rsi=rsi,
                        )
                        note = (
                            f"직전 5분 급등폭 {recent_spike_pct*100:.1f}% > 상한 "
                            f"{spike_cap*100:.1f}% — 눌림목 감시 등록(pullback_watches)"
                        )
                    else:
                        note = (
                            f"직전 5분 급등폭 {recent_spike_pct*100:.1f}% > 상한 "
                            f"{spike_cap*100:.1f}% — 눌림목 대기(감시 미등록, 롤백됨)"
                        )
                    await self._log_decision(
                        ticker=ticker,
                        gate="SPIKE_GUARD",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=note,
                    )
                    print(
                        f"🛑 [Spike Guard] {ticker} 직전 5분 급등폭 {recent_spike_pct*100:.1f}% — 신규 진입 차단."
                    )
                    return

        if (
            signal_type == "BUY"
            and strength == "STRONG"
            and not pos
            and is_armed
            and dna_score >= dna_gate
        ):
            return await self._execute_entry(
                ticker=ticker,
                price=price,
                signal_type=signal_type,
                rsi=rsi,
                ai_report=ai_report,
                dna_score=dna_score,
                recommended_weight=recommended_weight,
                atr=atr,
                acc=acc,
                recent_history_rows=recent_history_rows,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
                smoothed_er=smoothed_er,
            )

        # --- 1.5 기존 포지션 추가 매수 (Scale-In, 포지션당 평생 1회) ---
        # 청산 락 밖에서 실행 — _execute_entry와 동일한 원칙으로 매수 체결 확인
        # 대기가 같은 티커의 TS 매도 판정(아래 exit lock 구간)을 지연시키지 않는다.
        if (
            pos
            and self.scale_in_enabled
            and is_armed
            and signal_type == "BUY"
            and strength == "STRONG"
            and dna_score >= dna_gate
            and not pos.get("scaled_in")
            and (price / pos["entry_price"] - 1) >= SCALE_IN_PROFIT_TRIGGER
        ):
            scaled_in = await self._execute_scale_in(
                ticker=ticker,
                price=price,
                acc=acc,
                dna_score=dna_score,
                rsi=rsi,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
            )
            if scaled_in:
                # 이번 틱의 TS 관리가 갱신된 entry_price/units/highest_price를
                # 쓰도록 재조회 (스케일인 이후 평단가가 바뀌었으므로 필수)
                pos = await self.get_position(ticker)

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
                is_long_term = entry_price <= LONG_TERM_MAX_PRICE
                entry_stop_pct = pos.get(
                    "entry_stop_pct"
                )  # 레거시 포지션은 None → 고정 % 폴백

                # A-0. EOD 강제 청산 최우선 처리 (Scale-Out보다 앞에 위치 — 동시 발동 시 EOD 우선)
                # 수익 포지션(현재가 > 진입가)은 익일 홀딩 — 승자를 일찍 자르지 않음
                if signal_type == "SELL" and strength == "EOD_FORCE":
                    if is_long_term:
                        # 장기 보유 모드 — EOD 강제청산 대상에서 제외 (오버나이트/
                        # 장기 홀딩이 의도된 동작. 하락 방어는 TS(-5% 트레일링)가 전담)
                        return
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
                # 장기 보유 모드는 방향성 상실을 이유로 슬롯을 반납하지 않는다 — 사용자가
                # 직접 청산을 결정할 때까지 보유가 기본값
                if not is_scaled_out and not is_long_term and pos.get("created_at"):
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

                        decay_threshold = 60

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
                # 이전에는 atr<=0 분기에서만 본전 락인(NORMAL_BREAKEVEN_TRIGGER)을 체크했는데,
                # 실전에서는 atr>0이 상시 공급되므로 그 분기가 사실상 죽은 코드였다 — 통합으로 해결.
                if not is_scaled_out:
                    if is_long_term:
                        # 장기 보유 모드: ATR/ER 무관, 최고가 대비 고정 %(LONG_TERM_TS_TRAIL_PCT)
                        # 트레일링이 기본이나, +2%(LONG_TERM_BREAKEVEN_TRIGGER) 이상 도달한
                        # 이력이 있으면 하한을 본전(entry_price)으로 영구 락인한다 —
                        # highest_price가 단조 증가이므로 별도 상태 없이 매 호출 시
                        # 파생 가능 (2026-07-29 추가, LGHL 무손익 왕복 사례 참고). 트레일
                        # 폭 자체가 좁을수록(예: -3%는 +3.09%=1/0.97 이상에서 이미 본전
                        # 이상을 보장) 이 락인이 커버해야 하는 구간도 좁아진다.
                        ts_threshold = highest_price * LONG_TERM_TS_TRAIL_PCT
                        if highest_price >= entry_price * LONG_TERM_BREAKEVEN_TRIGGER:
                            ts_threshold = max(ts_threshold, entry_price)
                    else:
                        effective_atr = atr if atr > 0 else (entry_price * 0.02)
                        ts_threshold = update_reversible_trailing_stop(
                            entry_price,
                            highest_price,
                            effective_atr,
                            smoothed_er,
                            entry_stop_pct,
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
                # RSI arm은 최소 +5% 수익 확인 후 허용 — 그렇지 않으면 근접 손익분기점에서도
                # RSI만으로 조기 익절돼 winner를 지나치게 일찍 자르게 된다
                scale_trigger = (rsi > 52 and profit_pct >= 0.05) or profit_pct >= 0.07
                sell_slip = SLIPPAGE_SELL_NORMAL
                if (
                    scale_trigger
                    and not is_scaled_out
                    and not is_long_term
                    and is_armed
                    and (price * (1.0 - sell_slip) > entry_price)
                ):
                    sell_units = units * SCALE_OUT_RATIO
                    # [Guide-3] 매도 슬리피지 적용
                    fill_sell_price = _apply_slippage(price, is_buy=False)
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
                    new_ts_val = max(
                        entry_price * SCALE_OUT_TS_PCT, highest_price * TS_TRAIL_PCT
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
                    price_str = f"${fill_sell_price:.2f}"
                    ts_desc = f"본절+1% ${new_ts_val:.2f}"
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

    async def _execute_scale_in(
        self,
        ticker: str,
        price: float,
        acc: dict,
        dna_score: float,
        rsi: float | None = None,
        rvol: float | None = None,
        adx: float | None = None,
        macd_diff: float | None = None,
        is_extended: bool | None = None,
        z_score_20: float | None = None,
        ma20_deviation_pct: float | None = None,
        breakout_deviation_pct: float | None = None,
    ) -> bool:
        """이미 보유 중인 승자 포지션에 대한 1회 한정 추가 매수.

        매수 락(_get_buy_lock)만 사용하고 청산 락(_get_exit_lock)은 절대 잡지 않는다 —
        같은 이유(체결 확인 대기가 TS 매도를 지연시키면 안 됨)로 _execute_entry와 동일한
        원칙을 따른다. paper_positions.scaled_in 컬럼에 대한 CAS(scaled_in=False 조건부
        UPDATE)로 동시 중복 스케일인과, 그 사이 포지션이 청산된 경우를 함께 방어한다."""
        async with self._get_buy_lock(ticker):
            invested = await self.calculate_invested_capital()
            total_equity = acc["cash_available"] + invested
            if total_equity <= 0:
                return False
            room = max(0.0, total_equity * MAX_CONCENTRATION_PCT - invested)
            buy_budget = min(acc["cash_available"] * 0.5, SCALE_IN_MAX_BUDGET, room)
            if buy_budget < MIN_BUY_BUDGET:
                return False

            est_fill_price = _apply_slippage(price, is_buy=True)
            est_units = buy_budget / est_fill_price

            # CAS 클레임: scaled_in=False인 동안에만 성공 — 성공 시 이 프로세스가 유일한
            # 스케일인 실행자임이 보장된다 (다른 코루틴/프로세스가 먼저 선점했으면 0행 반환)
            claim_res = await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .update({"scaled_in": True})
                .eq("ticker", ticker)
                .eq("scaled_in", False)
                .execute
            )
            if not claim_res.data:
                return False

            executed = await self._on_order_buy(
                ticker, est_units, est_fill_price, "MARKET", None, None
            )
            if executed is None:
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update({"scaled_in": False})
                    .eq("ticker", ticker)
                    .execute
                )
                return False
            add_units, fill_price = executed

            # 클레임 이후 실주문 체결까지 사이에 TS/Scale-Out이 먼저 반영됐을 수 있으므로
            # units/entry_price/highest_price는 반드시 최신 값으로 다시 읽어 병합한다.
            fresh = await self.get_position(ticker)
            if not fresh:
                await self.webhook.send_alert(
                    title=f"⚠️ [SCALE-IN 경합] {ticker}",
                    description=(
                        f"추가 매수 체결({add_units:.4f}주 @ ${fill_price:.4f}) 직후 "
                        f"기존 포지션을 찾을 수 없음 — 수동 확인 필요"
                    ),
                    color=0xE74C3C,
                )
                return False

            old_units = fresh["units"]
            old_entry = fresh["entry_price"]
            new_units = old_units + add_units
            new_entry = (old_units * old_entry + add_units * fill_price) / new_units

            # Scale-Out으로 이미 방어 모드(고정 타이트 TS, k=1.2 ATR)였던 포지션에
            # Scale-In이 들어오면 새로 태운 자금까지 그 좁은 TS를 그대로 물려받아
            # 정상적인 되돌림에도 쉽게 털린다 — is_scaled_out을 해제해 일반 포지션과
            # 동일한 가역적 스위칭 스탑(ATR/ER 적응형)으로 복귀시킨다. 이미 실현된
            # Scale-Out 수익은 paper_history에 별도 행으로 남아있어 손실 없음. 대신
            # 이제부터는 이 포지션도 다시 Scale-Out 대상이 될 수 있다 — 재차 커진
            # 포지션이 추가로 오르면 재차 일부 익절할 수 있어야 하므로 의도된 동작.
            new_status = "HOLD" if fresh.get("is_scaled_out") else fresh.get("status")
            await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .update(
                    {
                        "units": new_units,
                        "entry_price": new_entry,
                        "highest_price": max(fresh["highest_price"], fill_price),
                        "current_price": fill_price,
                        "is_scaled_out": False,
                        "status": new_status,
                    }
                )
                .eq("ticker", ticker)
                .execute
            )

            executed_cost = add_units * fill_price
            await self._apply_cash_delta(-executed_cost)

            await self._log_decision(
                ticker=ticker,
                gate="SCALE_IN",
                outcome="EXECUTED",
                signal="BUY",
                dna_score=dna_score,
                rsi=rsi,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
                price=price,
                note=(
                    f"추가매수 체결 ${executed_cost:.2f} | {add_units:.4f}주 @ "
                    f"${fill_price:.4f} | 평단 ${old_entry:.4f}→${new_entry:.4f}"
                ),
            )
            await self.webhook.send_alert(
                title=f"➕ [PAPER SCALE-IN] {ticker}",
                description=(
                    f"추가 매수 ${executed_cost:.2f} ({add_units:.4f}주 @ ${fill_price:.4f})\n"
                    f"평단가: ${old_entry:.4f} → ${new_entry:.4f} | 총 보유: {new_units:.4f}주"
                ),
                color=0x2ECC71,
            )
            return True

    async def _execute_entry(
        self,
        ticker: str,
        price: float,
        signal_type: str,
        rsi: float | None,
        ai_report: str,
        dna_score: float,
        recommended_weight: float,
        atr: float,
        acc: dict,
        recent_history_rows: list[dict],
        order_kind: str = "MARKET",
        limit_price: float | None = None,
        rvol: float | None = None,
        adx: float | None = None,
        macd_diff: float | None = None,
        is_extended: bool | None = None,
        z_score_20: float | None = None,
        ma20_deviation_pct: float | None = None,
        breakout_deviation_pct: float | None = None,
        smoothed_er: float | None = None,
    ) -> bool | None:
        """신규 진입 admission control(포지션 수 상한·재진입 쿨다운·집중도·예산) + 실주문
        제출 + 포지션 확정. 호출자가 이미 DNA 게이트·서킷브레이커·쿨다운·변동성 필터를
        통과시킨 뒤 호출해야 한다 — 즉시매수 경로(_process_signal_locked의 STRONG BUY
        분기, order_kind="MARKET")와 눌림목 확인 후 진입 경로(_evaluate_pullback_watch,
        order_kind="LIMIT") 양쪽에서 재사용된다.

        rvol/adx/macd_diff/is_extended/smoothed_er는 engine_decisions 로깅 전용이며
        (2026-07-29/07-31), 호출부가 없으면 None으로 남는다."""
        atr_pct = round(atr / price * 100, 4) if price else None
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
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"동시 포지션 {pos_count_res.count}개 ≥ 한도 {MAX_CONCURRENT_POSITIONS}개",
                    )
                    return None
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
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"청산 후 {self.REENTRY_COOLDOWN_MINUTES}분 쿨다운 중",
                    )
                    return None
                # 포트폴리오 집중도 게이트: 총 자산 대비 투입 비중 75%(MAX_CONCENTRATION_PCT) 초과 시 신규 진입 차단
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
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"투입 비중 {conc_pct:.1f}% ≥ 한도 {MAX_CONCENTRATION_PCT*100:.0f}%",
                    )
                    return None
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
                    # 이 분기는 KellySizer 자체 상한(_kelly_sizer.max_weight, 기본 0.15)이
                    # "최대 확신"의 기준이다 — 위 분기의 0.25(FULL_CONVICTION_FRACTION)와
                    # 스케일이 달라 정규화 기준도 따로 잡아야 한다.
                    conviction_ref = _kelly_sizer.max_weight
                    print(
                        f"⚠️ [{ticker}] Kelly 동적 폴백: {effective_fraction*100:.1f}% 적용"
                    )
                else:
                    effective_fraction = min(recommended_weight / 100.0, 0.25)
                    conviction_ref = FULL_CONVICTION_FRACTION
                # 계좌 잔고가 커질수록(현재 cash_available ~$77k) cash*effective_fraction이
                # 항상 MAX_BUY_BUDGET을 상회해, weight가 0.02든 0.15든 실제 주문액은
                # 매번 동일한 $1,000로 뭉개지는 문제가 있었다 — 변동성 타겟팅이 계산은
                # 되지만 라이브 주문 크기에는 전혀 반영되지 않았다(2026-08-05 리뷰에서
                # 발견). weight를 conviction_ref(해당 분기의 최대 비중) 대비 비율로
                # MAX_BUY_BUDGET에 곱해, 확신/변동성에 비례해 $1,000 이하로 실제
                # 축소되도록 한다. cash_available 기준 상한은 계좌가 작아지는 경우를
                # 대비해 그대로 병존.
                buy_budget = min(
                    acc["cash_available"] * effective_fraction,
                    MAX_BUY_BUDGET * (effective_fraction / conviction_ref),
                )
                if buy_budget < MIN_BUY_BUDGET:
                    await self._log_decision(
                        ticker=ticker,
                        gate="MIN_BUDGET",
                        outcome="BLOCKED",
                        signal=signal_type,
                        dna_score=dna_score,
                        rsi=rsi,
                        rvol=rvol,
                        adx=adx,
                        macd_diff=macd_diff,
                        is_extended=is_extended,
                        z_score_20=z_score_20,
                        ma20_deviation_pct=ma20_deviation_pct,
                        breakout_deviation_pct=breakout_deviation_pct,
                        atr_pct=atr_pct,
                        price=price,
                        note=f"매수 예산 ${buy_budget:.2f} < 최소 ${MIN_BUY_BUDGET}",
                    )
                    return None

                # [Guide-3] 슬리피지 보정 — 매수는 시장가보다 불리하게 체결 (실주문 전 추정치)
                est_fill_price = _apply_slippage(price, is_buy=True)
                est_units = buy_budget / est_fill_price
                # 장기 보유 모드 판정: 진입가가 $50 이하인 경우. price(신호가)가 아닌 실제
                # 체결가(est_fill_price) 기준으로 판정해 entry_stop_pct 계산과 동일 기준을 쓴다.
                is_long_term_signal = est_fill_price <= LONG_TERM_MAX_PRICE
                # ATR 기반 초기 스탑 폭 — 진입 시점에 1회 계산해 고정한다(_compute_entry_stop_pct
                # 참고). atr<=0(데이터 부족)이면 기존 고정 %와 동일한 값으로 폴백된다.
                entry_stop_pct = _compute_entry_stop_pct(
                    est_fill_price,
                    atr,
                    self.atr_stop_enabled,
                    is_long_term_signal,
                )

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
                    "ts_threshold": est_fill_price * (1.0 - entry_stop_pct),
                    "entry_stop_pct": entry_stop_pct,
                    "units": est_units,
                    "is_scaled_out": False,
                    "scale_out_bar_count": 0,
                    "scaled_in": False,
                }
                try:
                    claim_res = await asyncio.to_thread(
                        self.supabase.table("paper_positions").insert(claim_pos).execute
                    )
                except Exception as e:
                    if "duplicate key" in str(e).lower() or "23505" in str(e):
                        print(
                            f"⏳ [{ticker}] 동시 진입 감지 — 다른 프로세스가 이미 클레임함, 스킵"
                        )
                        return None
                    raise
                if not claim_res.data:
                    print(f"⚠️ [{ticker}] 진입 클레임 INSERT가 빈 결과 반환 — 스킵")
                    return None

            # 스프레드 게이트: 주문 제출 직전 1회만 호출(429 방지, 클래스 상단 주석
            # 참고). 조회 실패(None)나 stale 판정이면 확인 불가로 간주해 차단하지
            # 않는다 — 이 조회 자체가 실주문 지연·차단의 원인이 되면 안 된다.
            shadow_spread_pct, shadow_quote_stale = await _fetch_quote_spread(ticker)
            if (
                shadow_spread_pct is not None
                and not shadow_quote_stale
                and shadow_spread_pct > SPREAD_GATE_MAX_PCT
            ):
                print(
                    f"⛔ [{ticker}] 스프레드 {shadow_spread_pct:.2f}% > "
                    f"{SPREAD_GATE_MAX_PCT}% — 진입 차단, 클레임 롤백"
                )
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .delete()
                    .eq("ticker", ticker)
                    .execute
                )
                await self._log_decision(
                    ticker=ticker,
                    gate="SPREAD_TOO_WIDE",
                    outcome="BLOCKED",
                    signal=signal_type,
                    dna_score=dna_score,
                    rsi=rsi,
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    spread_pct=shadow_spread_pct,
                    quote_stale=shadow_quote_stale,
                    price=price,
                    note=f"스프레드 {shadow_spread_pct:.2f}% > {SPREAD_GATE_MAX_PCT}% 초과 — 진입 차단",
                )
                return None

            # 실거래 훅: LiveTradingManager에서 Alpaca 주문 제출, 실제 (체결 수량, 체결 단가) 반환.
            # 실패 시 클레임 롤백 + DB 기록 차단. order_kind="LIMIT"(눌림목 확인 진입)이면
            # limit_price에 실제 Alpaca 지정가 주문을 제출한다(시장가 폴백은 없음 — 미체결
            # 시 주문이 취소되고 None 반환됨, LiveTradingManager._submit_alpaca_order 참고).
            # 마지막 인자는 브로커 사이드 Stop-Market 초기 스탑가(LIVE 전용) — 진입 시점
            # ATR 기반 entry_stop_pct로 계산한 재해 하한선. 1분봉 폴링 TS가 주력이고,
            # 이 스탑은 봉 공백·서버 다운 중의 갭다운 방어용 최후 방어선이다.
            executed = await self._on_order_buy(
                ticker,
                est_units,
                est_fill_price,
                order_kind,
                limit_price,
                est_fill_price * (1.0 - entry_stop_pct),
            )
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
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    price=price,
                    note="실주문 제출/체결확인 실패 — Alpaca가 거절했거나 제한시간 내 미체결 (Discord 알림 참고)",
                )
                return None
            units, fill_price = executed
            ts_threshold = fill_price * (1.0 - entry_stop_pct)

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
                    # 실주문은 이미 Alpaca에서 체결됐으므로(_on_order_buy 성공) 여기서
                    # 포지션 행을 지우면 DB만 롤백되고 실제 보유 주식은 그대로 남아
                    # 엔진이 추적을 잃는 유령 포지션이 된다(2026-07-22 CHAI/INUV/SLGB/MED
                    # 사고 원인). 현금 차감만 실패했을 뿐 포지션 확정(HOLD) UPDATE는 이미
                    # 성공했으므로 행은 그대로 두고 예외만 던져 아래 except에서 알림한다.
                    raise RuntimeError(
                        f"Cash UPDATE failed for {ticker}, position kept as HOLD "
                        f"(cash reconciliation required)"
                    )

                slip_pct = (fill_price / price - 1) * 100
                report_line = f"\n💡 {ai_report}" if ai_report else ""
                stop_desc = (
                    "-5% (장기보유, 최고가 트레일링)" if is_long_term_signal else "-10%"
                )
                await self.webhook.send_alert(
                    title=f"🚀 [PAPER BUY] {ticker}",
                    description=(
                        f"시장가: ${price:.4f} → 체결가: ${fill_price:.4f} (슬리피지 {slip_pct:+.2f}%)\n"
                        f"수량: {units:.2f}주 | DNA: {dna_score:.0f} | 매수금액: ${buy_budget:.2f}\n"
                        f"손절선: ${ts_threshold:.4f} ({stop_desc}) | 비중: {effective_fraction*100:.1f}%{report_line}"
                    ),
                    color=0x2ECC71,
                )
                spread_note = ""
                if shadow_spread_pct is not None:
                    stale_tag = " [STALE]" if shadow_quote_stale else ""
                    spread_note = f" | 스프레드 {shadow_spread_pct:.2f}%{stale_tag}"
                await self._log_decision(
                    ticker=ticker,
                    gate="EXECUTED",
                    outcome="EXECUTED",
                    signal="BUY",
                    dna_score=dna_score,
                    rsi=rsi,
                    rvol=rvol,
                    adx=adx,
                    macd_diff=macd_diff,
                    is_extended=is_extended,
                    z_score_20=z_score_20,
                    ma20_deviation_pct=ma20_deviation_pct,
                    breakout_deviation_pct=breakout_deviation_pct,
                    atr_pct=atr_pct,
                    spread_pct=shadow_spread_pct,
                    quote_stale=shadow_quote_stale,
                    efficiency_ratio=smoothed_er,
                    price=fill_price,
                    note=f"매수 체결 ${buy_budget:.2f} | {units:.2f}주 | TS ${ts_threshold:.4f}{spread_note}",
                )
                # 관심종목 자동 등록 (STRONG BUY 매수 → HOLDING)
                await self._sync_watchlist_buy(
                    ticker, fill_price, ts_threshold, dna_score
                )
                return True
            except Exception as e:
                print(f"❌ Buy Error: {e}")
                # 실주문 체결(_on_order_buy) 이후의 실패이므로 Alpaca에는 이미 실제
                # 포지션이 존재한다. 클레임 행을 지우는 대신 실체결 데이터로 강제
                # UPDATE를 한 번 더 시도해 최소한 HOLD 상태로 확정시켜 TS 스위퍼가
                # 이 포지션을 놓치지 않게 한다 — 그마저 실패하면 행을 보존한 채
                # 수동 확인을 요청하는 알림만 보낸다 (2026-07-22 CHAI/INUV/SLGB/MED
                # phantom position 사고 재발 방지).
                try:
                    await asyncio.to_thread(
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
                except Exception as recover_err:
                    print(f"❌ [{ticker}] 매수 확정 복구 재시도도 실패: {recover_err}")
                await self.webhook.send_alert(
                    title=f"🚨 [정산 불일치 위험] {ticker}",
                    description=(
                        f"매수 주문은 Alpaca에 이미 체결됐습니다 ({units:.2f}주 @ "
                        f"${fill_price:.4f}) — 이후 기록 단계에서 오류: `{e}`\n"
                        f"paper_positions/paper_account을 수동으로 확인하세요. "
                        f"포지션 행은 삭제하지 않고 보존했습니다."
                    ),
                    color=0xFF0000,
                )
                raise

    async def _fetch_recent_history_rows(self, ticker: str) -> list[dict]:
        """티커의 최근 paper_history 10건(백필 행 제외)을 closed_at 내림차순으로 조회.

        신규 진입 게이트(휩쏘 방지/재진입 쿨다운)와 동일한 조회·필터 로직이며,
        눌림목 확인 후 진입 시에도 재진입 쿨다운을 지켜야 하므로 재사용한다.
        """
        recent_history = await asyncio.to_thread(
            self.supabase.table("paper_history")
            .select("closed_at,exit_reason,pnl_pct")
            .eq("ticker", ticker)
            .order("closed_at", desc=True)
            .limit(10)
            .execute
        )
        return [
            r for r in (recent_history.data or []) if not is_backfilled_phantom_trade(r)
        ]

    async def _register_pullback_watch(
        self,
        ticker: str,
        price: float,
        dna_score: float,
        atr: float,
        recommended_weight: float,
        signal_type: str,
        strength: str,
        rsi: float | None,
    ) -> None:
        """Spike Guard가 차단한 신호를 즉시 잊는 대신, 눌림목(되돌림)·반등을 계속
        추적하도록 pullback_watches에 감시 행을 등록한다. 같은 티커에 이미 WATCHING
        행이 있으면(부분 유니크 인덱스) 조용히 건너뛴다 — 이미 감시 중이므로 새로
        등록할 필요가 없다.
        """
        try:
            now = datetime.now(timezone.utc)
            payload = {
                "ticker": ticker.upper(),
                "dna_score": dna_score,
                "atr": atr,
                "recommended_weight": recommended_weight,
                "signal_type": signal_type,
                "strength": strength,
                "rsi_at_signal": rsi,
                "signal_price": price,
                "peak_price": price,
                "last_price": price,
                "status": "WATCHING",
                "expires_at": (
                    now + timedelta(minutes=PULLBACK_MAX_WAIT_MINUTES)
                ).isoformat(),
            }
            await asyncio.to_thread(
                self.supabase.table("pullback_watches").insert(payload).execute
            )
            print(f"👁️ [Pullback Watch] {ticker} 감시 등록 @ ${price:.4f}")
        except Exception as e:
            if "duplicate key" in str(e).lower() or "23505" in str(e):
                return  # 이미 감시 중 — 정상
            print(f"⚠️ [Pullback Watch 등록 실패] {ticker}: {e}")

    async def _evaluate_pullback_watch(
        self,
        ticker: str,
        price: float,
        rsi: float | None,
        signal_type: str,
        dna_score: float,
        recommended_weight: float,
        atr: float,
        ai_report: str,
        rvol: float | None = None,
        adx: float | None = None,
        macd_diff: float | None = None,
        is_extended: bool | None = None,
        z_score_20: float | None = None,
        ma20_deviation_pct: float | None = None,
        breakout_deviation_pct: float | None = None,
    ) -> bool | None:
        """활성 눌림목 감시 행을 평가한다.

        반환값: 감시 행이 없으면 None(호출자가 평소 로직으로 진행), 감시 행이 있으면
        True(진입 체결 성공)/False(감시 갱신·무효화·만료 — 호출자는 이번 신호 처리를
        여기서 끝낸다).

        rvol/adx/macd_diff/is_extended는 engine_decisions 로깅 전용이다(2026-07-29)."""
        atr_pct = round(atr / price * 100, 4) if price else None
        try:
            res = await asyncio.to_thread(
                self.supabase.table("pullback_watches")
                .select("*")
                .eq("ticker", ticker.upper())
                .eq("status", "WATCHING")
                .limit(1)
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Pullback Watch 조회 실패] {ticker}: {e}")
            return None
        rows = res.data or []
        if not rows:
            return None
        watch = rows[0]

        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(watch["expires_at"].replace("Z", "+00:00"))
        peak_price = max(float(watch["peak_price"]), price)
        last_price = float(watch["last_price"])
        retrace_min = PULLBACK_RETRACE_MIN_PCT_NORMAL
        retrace_pct = (peak_price - price) / peak_price if peak_price > 0 else 0.0

        if now > expires_at:
            await asyncio.to_thread(
                self.supabase.table("pullback_watches")
                .update({"status": "EXPIRED", "resolved_at": now.isoformat()})
                .eq("id", watch["id"])
                .execute
            )
            await self._log_decision(
                ticker=ticker,
                gate="PULLBACK_EXPIRED",
                outcome="BLOCKED",
                signal=signal_type,
                dna_score=dna_score,
                rsi=rsi,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
                atr_pct=atr_pct,
                price=price,
                note=f"눌림목 감시 {PULLBACK_MAX_WAIT_MINUTES}분 경과 — 만료",
            )
            print(f"⌛ [Pullback Watch] {ticker} 만료 — 감시 종료")
            return False

        if retrace_pct > PULLBACK_RETRACE_MAX_PCT:
            await asyncio.to_thread(
                self.supabase.table("pullback_watches")
                .update({"status": "INVALIDATED", "resolved_at": now.isoformat()})
                .eq("id", watch["id"])
                .execute
            )
            await self._log_decision(
                ticker=ticker,
                gate="PULLBACK_INVALIDATED",
                outcome="BLOCKED",
                signal=signal_type,
                dna_score=dna_score,
                rsi=rsi,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
                atr_pct=atr_pct,
                price=price,
                note=f"고점 대비 하락폭 {retrace_pct*100:.1f}% > 상한 {PULLBACK_RETRACE_MAX_PCT*100:.0f}% — 추세 붕괴로 무효화",
            )
            print(
                f"🚫 [Pullback Watch] {ticker} 무효화 — 하락폭 {retrace_pct*100:.1f}%"
            )
            return False

        reclaim_confirmed = (
            retrace_pct >= retrace_min
            and price > last_price
            and (rsi is None or rsi >= PULLBACK_MIN_RSI)
        )
        if not reclaim_confirmed:
            await asyncio.to_thread(
                self.supabase.table("pullback_watches")
                .update({"peak_price": peak_price, "last_price": price})
                .eq("id", watch["id"])
                .execute
            )
            return False

        # 되돌림 + 반등 확인 — 감시를 FILLED로 마킹하고 진입 시도.
        # 재진입 쿨다운은 감시 등록 시점이 아니라 지금 다시 확인해야 한다(그 사이
        # 다른 사유로 청산 이력이 새로 쌓였을 수 있음).
        recent_history_rows = await self._fetch_recent_history_rows(ticker)
        if self._is_in_cooldown_from_rows(recent_history_rows):
            await asyncio.to_thread(
                self.supabase.table("pullback_watches")
                .update({"status": "INVALIDATED", "resolved_at": now.isoformat()})
                .eq("id", watch["id"])
                .execute
            )
            await self._log_decision(
                ticker=ticker,
                gate="PULLBACK_COOLDOWN",
                outcome="BLOCKED",
                signal=signal_type,
                dna_score=dna_score,
                rsi=rsi,
                rvol=rvol,
                adx=adx,
                macd_diff=macd_diff,
                is_extended=is_extended,
                z_score_20=z_score_20,
                ma20_deviation_pct=ma20_deviation_pct,
                breakout_deviation_pct=breakout_deviation_pct,
                atr_pct=atr_pct,
                price=price,
                note="되돌림·반등 확인됐으나 재진입 쿨다운 중 — 무효화",
            )
            return False

        acc = await self.get_account()
        executed = await self._execute_entry(
            ticker=ticker,
            price=price,
            signal_type=signal_type,
            rsi=rsi,
            ai_report=ai_report,
            dna_score=dna_score if dna_score > 0 else float(watch["dna_score"]),
            recommended_weight=(
                recommended_weight
                if recommended_weight > 0
                else float(watch["recommended_weight"])
            ),
            atr=atr if atr > 0 else float(watch["atr"]),
            acc=acc,
            recent_history_rows=recent_history_rows,
            rvol=rvol,
            adx=adx,
            macd_diff=macd_diff,
            is_extended=is_extended,
            z_score_20=z_score_20,
            ma20_deviation_pct=ma20_deviation_pct,
            breakout_deviation_pct=breakout_deviation_pct,
            # 되돌림·반등이 확인된 현재가를 지정가로 제출 — LIVE 모드는 이 가격에
            # 실제 Alpaca 지정가 주문을 걸고(paper 모드는 봉 종가 단위라 이 가격에
            # 즉시 체결한 것으로 근사), 시장가 추격 매수보다 불리한 체결을 방지한다.
            order_kind="LIMIT",
            limit_price=price,
        )
        await asyncio.to_thread(
            self.supabase.table("pullback_watches")
            .update(
                {
                    "status": "FILLED" if executed else "WATCHING",
                    "peak_price": peak_price,
                    "last_price": price,
                    "resolved_at": now.isoformat() if executed else None,
                }
            )
            .eq("id", watch["id"])
            .execute
        )
        if executed:
            print(f"✅ [Pullback Watch] {ticker} 되돌림·반등 확인 — 진입 실행")
        return bool(executed)
