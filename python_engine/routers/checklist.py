"""
routers/checklist.py — /api/checklist/* 엔드포인트

실계좌(LIVE) 전환 준비도 체크리스트 (live_transition_checklist 테이블) 조회/토글.
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi import APIRouter, HTTPException, Security, status
from scipy import stats as scipy_stats

from api.deps import get_api_key
from app.state import app_state
from routers.strategy import _compute_bucket_stats
from utils.utils import is_backfilled_phantom_trade

router = APIRouter(prefix="/api/checklist", tags=["checklist"])

# ── 자동 검증 임계값 (evaluate_checklist에서 사용) ──
CHECKLIST_MIN_DAYS = 90
CHECKLIST_MIN_TRADES = 100
CHECKLIST_MIN_WIN_RATE = 55
CHECKLIST_MIN_PROFIT_FACTOR = 1.3
CHECKLIST_MAX_MDD = -15.0

# ── 개선 검증 트래커 상수 (get_improvement_status에서 사용) ──────────────────
# 도입일: 각 개선이 실제로 코드에 반영·배포된 날 (이후 데이터만 효과 측정에 사용)
IMPROVEMENT_ADOPTED = {
    "whipsaw_fix": "2026-07-13",  # 당일 재진입 금지 + 종목당 일일 거래 제한
    "penny_gate_80": "2026-07-17",  # 페니 DNA 게이트 65→80 상향
    "atr_stop": "2026-07-18",  # ATR 기반 초기 트레일링 스탑 (entry_stop_pct)
    "forward_return_logger": "2026-07-18",  # 신호 30m/60m forward return 자동 기록
    "extension_guard_tighten": "2026-07-20",  # Is_Extended 임계값 강화(페니 타이트화) + 스캔/실시간 정합
    "pullback_entry": "2026-07-23",  # 급등 스파이크 즉시매수 대신 눌림목(되돌림·반등) 대기 후 진입
    "rsi_falling_knife_fix": "2026-08-01",  # DNA_Score의 RSI 컴포넌트를 과매도=반등매수(일반)에서
    # 낙폭방어(페니와 동일, 떨어지는 칼날)로 통일 — engine_decisions 실측 76건에서 RSI가
    # forward_return_30m과 유의한 음의 상관(r=-0.229, p=0.047)으로 확인돼 반전
    "watchlist_universe_expansion": "2026-08-04",  # 실시간 스트림 구독 상한 30→100 +
    # get_watchlist_tickers() 정렬 기준을 고정 DNA값에서 재스캔 시각(recency) 우선으로 변경
    "scale_in": "2026-08-04",  # 보유 포지션 +15% 이상 수익 시 1회 한정 추가매수 신규 도입
    "alpha_zscore_mean_reversion": "2026-08-05",  # 평균회귀 가설: (Close-MA20)/STD20
    "alpha_ma20_momentum": "2026-08-05",  # 모멘텀 가설: (Close-MA20)/MA20 이격도
    "alpha_breakout_volatility": "2026-08-05",  # 변동성 돌파 가설: 목표가 대비 괴리율
}
# 2026-07-18 수익률 전수분석(198건)에서 산출된 개선 전 기준선 — 효과 비교용
BASELINE_TS_WIN_RATE = 8.8  # Trailing Stop 청산 승률 (개선 전)
BASELINE_PENNY_WIN_RATE = 13.5  # 페니 종목(진입가 ≤ $1) 승률 (개선 전)
BASELINE_OVERALL_WIN_RATE = (
    19.2  # 전체 신규 진입(Scale-Out 제외) 승률 (개선 전, 6/17~7/17 198건)
)
# 판정에 필요한 최소 표본 수 — 미달이면 COLLECTING 상태로 표시
TARGET_FWD_SAMPLES = 100  # forward return 수집 목표 건수
TARGET_TS_EXITS = 30  # ATR 스탑 효과 판정에 필요한 TS 청산 수
TARGET_PENNY_TRADES = 20  # 페니 게이트 효과 판정에 필요한 페니 거래 수
TARGET_EXTENSION_TRADES = 30  # 확장도 가드 효과 판정에 필요한 신규 진입 수
TARGET_PULLBACK_TRADES = 20  # 눌림목 진입 효과 판정에 필요한 신규 진입 수
TARGET_RSI_FIX_TRADES = 20  # RSI 낙폭방어 전환 효과 판정에 필요한 신규 진입 수
TARGET_WATCHLIST_EXPANSION_TRADES = 30  # 구독 확대 효과 판정에 필요한 신규 진입 수
TARGET_SCALE_IN_TRADES = (
    15  # Scale-In 효과 판정에 필요한 거래 수 (+15% 트리거라 발생 빈도 낮음)
)
# 신규 알파 팩터 가설 검증에 필요한 최소 독립 표본 수 — 매수 체결 여부와 무관하게
# OBSERVE_CANDIDATE(DNA≥50)부터 모든 신호에 기록되므로 거래 기반 항목보다 훨씬
# 빨리 채워질 것으로 예상해 forward_return_logger(100)보다 낮게 잡는다.
TARGET_ALPHA_FACTOR_SAMPLES = 60
WHIPSAW_OBSERVE_DAYS = 14  # whipsaw 재발 감시 기간 (일)

IMPROVEMENT_CUTOFFS = {k: f"{v}T00:00:00Z" for k, v in IMPROVEMENT_ADOPTED.items()}

# ── 자동 롤백 대상 항목 ──────────────────────────────────────────────────────
# forward_return_logger는 되돌릴 파라미터가 없어 제외한다(신호 로깅 자체이지 매매
# 판단 파라미터가 아님). extension_guard_tighten(확장도 가드 강화 + 급등 스파이크
# 가드)은 2026-07-20부터 PaperTradingManager.extension_guard_penny_tight_enabled /
# spike_guard_enabled 두 인스턴스 속성으로 핫스왑 가능해져 이 목록에 포함한다.
# penny_gate_80은 2026-07-30 페니($1 이하) 포지션 관리 레거시 제거로 되돌릴
# 파라미터(self.penny_dna_gate)가 engine에서 사라져 목록에서 제외됨 — 아래
# IMPROVEMENT_ADOPTED/TARGET_PENNY_TRADES 등은 과거 결정의 감사 기록으로 유지한다.
# rsi_falling_knife_fix는 quant_engine.py의 DNA_Score 산식 자체를 바꾼 것이라 처음엔
# PaperTradingManager 인스턴스 속성이 아니라는 이유로 제외돼 있었으나(도입 3일 만에
# REGRESSED 확정되고도 git revert 없이는 못 되돌리는 공백이 실제로 발견됨), 2026-08-04
# quant_engine._rsi_mean_reversion_mode 모듈 레벨 플래그(set_rsi_mean_reversion_mode())를
# 추가해 atr_stop과 동일한 방식으로 핫스왑 가능해져 이 목록에 포함했다.
# watchlist_universe_expansion도 같은 이유로 제외 — 구독 상한(30→100)과 정렬 기준
# 변경은 get_watchlist_tickers()의 함수 로직 자체이지 인스턴스 속성이 아니라
# 런타임 토글이 없다. scale_in은 atr_stop처럼 PaperTradingManager.scale_in_enabled
# 인스턴스 속성으로 만들어 rollback 가능하게 뒀다(신규 자본 배치 로직이라 다른
# 항목보다 안전장치가 더 필요하다고 판단).
ROLLBACK_ACTIONABLE_ITEMS = {
    "atr_stop",
    "whipsaw_fix",
    "extension_guard_tighten",
    "pullback_entry",
    "scale_in",
    "rsi_falling_knife_fix",
}
# flip-flop 방지: 같은 상태(REGRESSED)가 이만큼 연속 확인돼야 실제 조치를 실행한다.
# evaluate_improvement_rollback()은 24시간 주기로 호출되므로 사실상 "이틀 연속" 의미.
CONSECUTIVE_REGRESSED_THRESHOLD = 2


def _dedup_signal_episodes(rows: list[dict], gap_minutes: int = 15) -> list[dict]:
    """같은 종목이 짧은 간격으로 반복 기록된 행을 하나의 시장 사건(episode)으로 묶어
    가장 이른 행 하나만 남긴다.

    예: 종목이 급락하며 COOLDOWN_ACTIVE 게이트에 10분 간격으로 계속 걸리면
    engine_decisions에 같은 사건이 수십 행 쌓인다 — forward_return_30m도 거의
    동일한 가격 궤적을 반영하므로 서로 독립 표본이 아니다. 이걸 그대로 세면
    "표본 100건 달성" 같은 진행률·평균값이 실제 독립 신호 수보다 부풀려진다
    (2026-07-27: GSUN 크래시 1건이 10행으로 중복 집계돼 forward_return_logger
    항목이 VERIFIED로 오판정된 사례에서 발견)."""
    by_ticker: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ticker[r["ticker"]].append(r)

    kept: list[dict] = []
    for ticker_rows in by_ticker.values():
        ticker_rows.sort(key=lambda r: r["ts"])
        last_kept_dt: datetime | None = None
        for r in ticker_rows:
            ts_dt = datetime.fromisoformat(r["ts"].replace("Z", "+00:00"))
            if last_kept_dt is None or (ts_dt - last_kept_dt) > timedelta(
                minutes=gap_minutes
            ):
                kept.append(r)
                last_kept_dt = ts_dt
    return kept


def _verify_status(
    n: int,
    target: int,
    metric: float,
    baseline: float,
    expectancy: float | None = None,
    expectancy_baseline: float | None = None,
) -> str:
    """
    승률(metric) 및 거래당 기대수익률(expectancy %E)을 결합한 퀀트 엄밀 검증 수식.
    n < target: 표본 수집 단계 (ON_TRACK or COLLECTING)
    expectancy <= expectancy_baseline: 승률과 무관하게 개선 전보다 나아지지 않았으면
      손실 방지 킬스위치에 의해 즉시 REGRESSED

    ※ expectancy는 2026-08-08부로 달러($E)가 아니라 투입원금 대비 수익률(%E)이다 —
      달러 기준일 때 이 킬스위치가 개선 품질이 아니라 포지션 사이징 레짐을 측정해
      정상 개선을 REGRESSED로 오판정하고 자동 롤백까지 실행했다.
      상세 근거는 _calc_metrics_expectancy() docstring 참고.

    ※ 같은 날 발견된 2차 결함(2026-08-08): 이 킬스위치가 expectancy를 0과 비교하고
      있었다. 전략 전체의 기준 기대수익률이 -3.00%(2026-07-30 이전 178포지션 실측)인
      상황에서 "절대값이 0 이하면 롤백"은 어떤 개선을 넣어도 무조건 걸리는 조건이라,
      개선의 우열을 전혀 판별하지 못하고 전부 되돌린다. 실제 피해 사례:
      rsi_falling_knife_fix는 채택 전 -3.05% → 활성 중 -1.10%로 뚜렷이 개선됐는데도
      "-1.10% <= 0"에 걸려 도입 3일 만에 자동 롤백됐다.
      따라서 비교 대상을 0이 아니라 채택 전 같은 모집단의 %E(expectancy_baseline)로
      바꾼다. baseline이 주어지지 않으면 종전대로 0을 쓴다(하위호환).
    """
    if n >= 5 and expectancy is not None:
        floor = expectancy_baseline if expectancy_baseline is not None else 0.0
        if expectancy <= floor:
            return "REGRESSED"
    if n < target:
        return "ON_TRACK" if n >= 5 and metric > baseline else "COLLECTING"
    return "VERIFIED" if metric > baseline else "REGRESSED"


@router.get("")
async def get_checklist(api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("*")
        .order("sort_order", desc=False)
        .execute
    )
    return res.data or []


@router.get("/improvements")
async def get_improvement_status(api_key: str = Security(get_api_key)):
    """개선 항목의 검증 진행 현황 조회 엔드포인트. 실계산은 compute_improvement_status()에 위임
    (evaluate_improvement_rollback() 스케줄러도 동일 함수를 재사용해 판정 로직을 단일화한다).
    ※ 페니 게이트 80 항목은 2026-07-30 레거시 제거(DNA 게이트 75 통일)로 삭제됨."""
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )
    return await compute_improvement_status(supabase)


def _calc_metrics_expectancy(
    sub_trades: list,
) -> tuple[float, float, float, int, float]:
    """sub_trades 리스트에서 포지션 승률(pos_wr), Expectancy(%E), Sortino Ratio,
    포지션(라운드트립) 수, 참고용 달러 Expectancy($E)를 산출.

    네 번째 반환값(pos_trades)은 목표 진행률(n_ts/n_penny/n_ext/n_pullback)에도
    써야 한다 — len(sub_trades)(원본 청산 행 수)를 그대로 쓰면 Scale-Out 이중
    렌더링뿐 아니라, 부분체결 유령 보유 사고 복구로 같은 진입가의 청산이 두
    행으로 쪼개진 잔재(SLGB/MED/CHAI, 2026-07-25 사고)까지 서로 다른 거래로
    오집계돼 pos_wr 계산과 다른 기준의 n이 나온다 (2026-07-27).

    ── Expectancy를 달러에서 투입원금 대비 수익률(%)로 전환 (2026-08-08) ──
    기존에는 profit_amt(달러) 합산으로 $E를 계산해 자동 롤백 킬스위치
    (_verify_status의 expectancy<=0)에 그대로 먹였는데, 이 값은 개선 로직의
    품질이 아니라 "그 표본이 어느 포지션 사이징 레짐에 걸쳐 있는지"를 측정하고
    있었다. 실측(2026-08-08, paper_history 276건 전수):

      포지션 $3,000+ 구간 88건의 승률이 3.4%, 합계 -$11,332 — 계좌 총손실
      -$11,024의 103%가 이 한 구간에서 나왔다. 반면 $0~100 구간 15건은 승률
      53.3%. 승리 거래 평균 포지션 $1,123 vs 패배 거래 $2,412로, 시스템이
      이기는 거래에 작게·지는 거래에 크게 걸고 있었다.

      2026-07-30 MAX_BUY_BUDGET $5,000→$1,000 하향 전후로 승률은 20.0%로
      완전히 동일한데 거래당 손익만 -$47.5 → -$10.4, PF 0.342 → 0.502로
      개선됐다 — 신호는 그대로인데 사이징만 바뀌어 결과가 달라진 직접 증거.

    그 결과 개선 항목의 $E가 채택일과 완벽히 단조 정렬됐다(atr_stop 7/18
    -31.52 → extension_guard 7/20 -29.99 → pullback 7/23 -18.49 →
    rsi_falling_knife 8/1 -0.83 → watchlist_expansion 8/4 +2.54). 일찍 채택된
    항목일수록 $5,000 포지션이 날뛰던 7월 구간을 표본에 더 많이 포함하기 때문에
    구조적으로 발생하는 교란이며, 실제로 VERIFIED 판정을 받은 유일한 항목이
    7/30 예산 수정 이후 채택된 것 하나뿐이었다. 즉 롤백된 항목들은 개선이
    나빠서가 아니라 잣대가 사이징을 보고 있어서 롤백됐을 가능성이 높다.

    투입원금(notional)으로 나눠 정규화하면 $50 포지션과 $5,000 포지션이 같은
    무게로 평가되어 사이징 레짐과 무관하게 로직 자체의 효과만 남는다.
    paper_history에 수량·투입금액 컬럼이 없어 notional은
    profit_amt / (pnl_pct/100)으로 역산한다 (두 값 모두 DB에 있고 정합성
    검증 결과 276건 전부 (exit-entry)/entry와 1%p 이내 일치).
    """
    if not sub_trades:
        return 0.0, 0.0, 0.0, 0, 0.0

    # 포지션 그룹핑 (Scale-Out 이중 렌더링 방지) — pos_wr뿐 아니라 Expectancy/Sortino도
    # 반드시 이 그룹 단위(포지션의 합산 손익)로 계산해야 한다. 원본 청산 행(Scale-Out
    # 부분매도 + 최종 청산) 단위로 계산하면, 부분익절 후 결국 손실로 마감한 포지션 1건이
    # "승 1건 + 패 1건"으로 이중 집계되어 pos_wr과 다른 표본 단위의 Expectancy가 나오고,
    # 이 값이 자동 롤백 킬스위치(expectancy<=0)에 그대로 쓰여 오판정을 유발할 수 있다.
    grouped: dict[str, dict] = {}
    for t in sub_trades:
        ticker = t.get("ticker", "unknown")
        entry_price = float(t.get("entry_price") or 0.0)
        profit = float(t.get("profit_amt") or 0.0)
        pnl_pct = float(t.get("pnl_pct") or 0.0)

        key = f"{ticker}_{round(entry_price, 4)}"
        bucket = grouped.setdefault(
            key, {"total_pnl": 0.0, "notional": 0.0, "pcts": []}
        )
        bucket["total_pnl"] += profit
        # Scale-Out 행은 매도한 비중분의 원금만 잡히므로, 같은 포지션의 행들을
        # 더하면 실제 투입원금 총액에 수렴한다.
        if abs(pnl_pct) > 1e-9:
            bucket["notional"] += abs(profit) / (abs(pnl_pct) / 100.0)
        bucket["pcts"].append(pnl_pct)

    pos_trades = len(grouped)
    pos_pnls = [b["total_pnl"] for b in grouped.values()]

    # 포지션별 투입원금 대비 수익률(%). notional을 역산할 수 없는 행만 있는
    # 포지션(pnl_pct=0 등)은 pnl_pct 평균으로 폴백한다.
    pos_returns: list[float] = []
    for b in grouped.values():
        if b["notional"] > 1e-9:
            pos_returns.append(b["total_pnl"] / b["notional"] * 100.0)
        elif b["pcts"]:
            pos_returns.append(sum(b["pcts"]) / len(b["pcts"]))
        else:
            pos_returns.append(0.0)

    # 윈저화(5~95 백분위 클리핑) — %로 정규화하면 사이징 교란은 사라지지만, 이번엔
    # 소액 포지션에서 터진 초대형 수익률(실측 YYGH +954%, 투입원금 $50)이 평균을
    # 통째로 좌우한다. 실제로 동일금액 반사실 PF는 전체 2.255 → 상위 2건 제외 시
    # 0.542로 붕괴해, 단일 거래가 킬스위치 판정을 양방향으로 뒤집을 수 있었다.
    # 표본이 충분할 때만 적용한다(n<10이면 백분위 자체가 무의미).
    if pos_trades >= 10:
        lo, hi = np.percentile(pos_returns, [5, 95])
        pos_returns = [float(min(max(r, lo), hi)) for r in pos_returns]

    wins = sum(1 for r in pos_returns if r > 0)
    losses = sum(1 for r in pos_returns if r < 0)
    pos_wr = (wins / pos_trades * 100.0) if pos_trades > 0 else 0.0

    total_profit = sum(r for r in pos_returns if r > 0)
    total_loss = sum(-r for r in pos_returns if r < 0)
    loss_amts = [-r for r in pos_returns if r < 0]

    prob_win = wins / pos_trades if pos_trades > 0 else 0.0
    avg_w = total_profit / wins if wins > 0 else 0.0
    avg_l = total_loss / losses if losses > 0 else 0.0
    expectancy = (prob_win * avg_w) - ((1.0 - prob_win) * avg_l)

    net_pnl = total_profit - total_loss
    avg_pnl = net_pnl / pos_trades if pos_trades > 0 else 0.0
    downside_std = float(np.std(loss_amts)) if loss_amts else 0.0
    sortino = (
        (avg_pnl / downside_std) if downside_std > 0 else (99.0 if avg_pnl > 0 else 0.0)
    )

    # 참고 표시용 구(舊) 달러 Expectancy — 판정에는 쓰지 않는다. 대시보드에
    # %E와 나란히 띄워 사이징 교란의 크기를 눈으로 확인할 수 있게 남긴다.
    d_wins = [p for p in pos_pnls if p > 0]
    d_losses = [-p for p in pos_pnls if p < 0]
    d_prob = len(d_wins) / pos_trades if pos_trades > 0 else 0.0
    d_avg_w = sum(d_wins) / len(d_wins) if d_wins else 0.0
    d_avg_l = sum(d_losses) / len(d_losses) if d_losses else 0.0
    expectancy_usd = (d_prob * d_avg_w) - ((1.0 - d_prob) * d_avg_l)

    return (
        round(pos_wr, 1),
        round(expectancy, 2),
        round(sortino, 2),
        pos_trades,
        round(expectancy_usd, 2),
    )


async def compute_improvement_status(supabase) -> dict:
    """개선 항목(Forward Return 로거 / ATR 초기 스탑 / Whipsaw 수정 / 확장도 가드 등)의
    검증 진행 현황을 퀀트 정밀 지표(포지션 승률, Expectancy E)로 자동 분석.
    ※ 페니 게이트 80 항목은 2026-07-30 레거시 제거(DNA 게이트 75 통일)로 삭제됨.
    """
    now_utc = datetime.now(timezone.utc)

    # ── 데이터 일괄 조회 (2회 왕복) ──────────────────────────────────────────
    hist_res, dec_res, rollback_res = await asyncio.gather(
        asyncio.to_thread(
            supabase.table("paper_history")
            .select(
                "ticker,entry_price,pnl_pct,profit_amt,exit_reason,closed_at,scaled_in"
            )
            # 채택일 이전 구간까지 함께 가져온다 — _verify_status의 킬스위치가
            # expectancy를 0이 아니라 "채택 전 같은 모집단의 %E"와 비교하도록
            # 바뀌면서(2026-08-08) 각 항목의 기준선 산출에 도입 전 청산 이력이
            # 필요해졌다. 항목별 부분집합은 모두 closed_at >= 자기 cutoff 조건을
            # 따로 갖고 있어 범위를 넓혀도 기존 집계는 영향받지 않는다.
            .order("closed_at", desc=False)
            .execute
        ),
        asyncio.to_thread(
            supabase.table("engine_decisions")
            .select(
                "ticker,gate,outcome,dna_score,price,note,forward_return_30m,forward_30m_checked,"
                "z_score_20,ma20_deviation_pct,breakout_deviation_pct,ts"
            )
            .gte("ts", IMPROVEMENT_CUTOFFS["penny_gate_80"])
            .order(
                "ts", desc=True
            )  # PostgREST가 limit(2000) 요청도 1000행으로 제한하므로,
            # 오름차순이면 테이블이 자라날수록 최신 데이터가 통째로 잘려나간다 —
            # z_score_20/ma20_deviation_pct/breakout_deviation_pct(2026-08-05 도입)가
            # 표본 0건에 영구히 머물렀던 원인. 내림차순으로 최신 1000행을 보장한다.
            .limit(2000)
            .execute
        ),
        # 자동 롤백이 실제로 실행된 시각 — 개선의 "관측 창"을 여기서 끊는다.
        asyncio.to_thread(
            supabase.table("improvement_rollback_log")
            .select("item_key,checked_at")
            .eq("action_taken", True)
            .order("checked_at", desc=False)
            .execute
        ),
    )
    # phantom position 사고 복구 시 넣은 백필 행은 같은 사건을 겪은 실제 청산 행(예: Trailing
    # Stop, EOD Force Exit)과 나란히 존재해 동일 거래를 두 번 집계하게 만든다 — 승률/Expectancy
    # 계산에서 제외한다 (2026-07-23, 검증 트래커가 이 중복으로 REGRESSED를 오판정한 사례 발견).
    trades = [t for t in (hist_res.data or []) if not is_backfilled_phantom_trade(t)]
    decisions = dec_res.data or []

    # 항목별 최초 자동 롤백 시각 — 이 시점 이후의 거래는 해당 개선이 꺼진 채로
    # 발생했으므로 그 개선의 성과로 집계하면 안 된다 (2026-08-08).
    rolled_back_at: dict[str, str] = {}
    for r in rollback_res.data or []:
        rolled_back_at.setdefault(r["item_key"], r["checked_at"])

    def _active_window(cutoff_key: str, filt=None) -> list:
        """개선이 실제로 켜져 있던 구간의 청산만 남긴다.

        종전에는 "채택일 이후 전체"를 성과 모집단으로 썼는데, 자동 롤백으로 이미
        비활성화된 뒤의 거래까지 그 개선의 실적으로 집계돼 판정이 정반대로 뒤집힐 수
        있었다. 실측(2026-08-08): atr_stop은 07-18 채택 → 07-23 롤백으로 실제 활성
        구간이 5일(7포지션)뿐인데, 종전 집계는 07-18 이후 62포지션 전부를 실적으로
        잡아 "채택 후 %E -2.60% > 채택 전 -3.66% → VERIFIED"라는 결론을 냈다.
        그 -2.60%의 대부분은 atr_stop이 꺼져 있던 기간(특히 2026-07-30 MAX_BUY_BUDGET
        하향 이후 구간)의 성과였다.
        """
        cut = IMPROVEMENT_CUTOFFS[cutoff_key]
        end = rolled_back_at.get(cutoff_key)
        return [
            t
            for t in trades
            if t["closed_at"] >= cut
            and (end is None or t["closed_at"] < end)
            and (filt is None or filt(t))
        ]

    # 각 개선 항목의 "채택 전 같은 모집단" %E — 킬스위치 비교 기준선.
    # filt는 항목별 부분집합 조건(예: atr_stop은 Trailing Stop 청산만)을 그대로 재사용해야
    # 채택 전/후가 동일한 모집단 정의 위에서 비교된다.
    def _baseline_expectancy(cutoff_key: str, filt=None) -> float | None:
        cut = IMPROVEMENT_CUTOFFS[cutoff_key]
        pre = [t for t in trades if t["closed_at"] < cut and (filt is None or filt(t))]
        if len(pre) < 5:
            return None
        return _calc_metrics_expectancy(pre)[1]

    base_ts = _baseline_expectancy(
        "atr_stop", lambda t: t["exit_reason"] == "Trailing Stop"
    )
    base_ext = _baseline_expectancy("extension_guard_tighten")
    base_pullback = _baseline_expectancy("pullback_entry")
    base_rsi_fix = _baseline_expectancy("rsi_falling_knife_fix")
    base_wexp = _baseline_expectancy("watchlist_universe_expansion")
    base_si = _baseline_expectancy("scale_in")

    items = []

    # ── 1. Forward Return 로거 ───────────────────────────────────────────────
    fwd_adopted = IMPROVEMENT_ADOPTED["forward_return_logger"]
    fwd_rows_raw = [
        d for d in decisions if d["ts"] >= IMPROVEMENT_CUTOFFS["forward_return_logger"]
    ]
    fwd_rows = _dedup_signal_episodes(fwd_rows_raw)
    collected = [
        d
        for d in fwd_rows
        if d.get("forward_30m_checked") and d.get("forward_return_30m") is not None
    ]
    n_collected = len(collected)
    metrics = [
        {
            "label": "수집 표본(독립 사건)",
            "value": f"{n_collected} / {TARGET_FWD_SAMPLES}건",
        },
        {"label": "대기 중 신호", "value": f"{len(fwd_rows) - n_collected}건"},
        {
            "label": "원본 로그 행수(중복 포함)",
            "value": f"{len(fwd_rows_raw)}건",
        },
    ]
    note = "신호 발생 30분/60분 후 실제 수익률을 자동 축적 중"
    if n_collected >= 10:
        high = [
            d["forward_return_30m"]
            for d in collected
            if (d.get("dna_score") or 0) >= 80
        ]
        low = [
            d["forward_return_30m"] for d in collected if (d.get("dna_score") or 0) < 80
        ]
        if high:
            avg_high = sum(high) / len(high)
            metrics.append(
                {"label": "DNA≥80 평균 30m 수익률", "value": f"{avg_high:+.2f}%"}
            )
        if low:
            avg_low = sum(low) / len(low)
            metrics.append(
                {"label": "DNA<80 평균 30m 수익률", "value": f"{avg_low:+.2f}%"}
            )
        note = "표본 축적 중 — 목표 도달 시 DNA 가중치 재추정 가능"
    items.append(
        {
            "key": "forward_return_logger",
            "label": "Forward Return 로거",
            "adopted_at": fwd_adopted,
            "status": "VERIFIED" if n_collected >= TARGET_FWD_SAMPLES else "COLLECTING",
            "progress_pct": min(round(n_collected / TARGET_FWD_SAMPLES * 100), 100),
            "metrics": metrics,
            "note": note,
        }
    )

    # ── 2. ATR 기반 초기 스탑 ────────────────────────────────────────────────
    atr_adopted = IMPROVEMENT_ADOPTED["atr_stop"]
    ts_exits_after = _active_window(
        "atr_stop", lambda t: t["exit_reason"] == "Trailing Stop"
    )
    pos_wr_ts, exp_ts, sortino_ts, n_ts, exp_usd_ts = _calc_metrics_expectancy(
        ts_exits_after
    )

    metrics = [
        {"label": "도입 후 TS 청산(포지션)", "value": f"{n_ts} / {TARGET_TS_EXITS}건"}
    ]
    if len(ts_exits_after) != n_ts:
        metrics.append({"label": "원본 청산 행수", "value": f"{len(ts_exits_after)}건"})
    if n_ts > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_ts:.1f}%"}
        )
        metrics.append({"label": "거래당 기대수익률 (%E)", "value": f"{exp_ts:+.2f}%"})
        if base_ts is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_ts:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_ts:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_ts:.2f}"})
    metrics.append(
        {"label": "개선 전 TS 승률(기준선)", "value": f"{BASELINE_TS_WIN_RATE}%"}
    )

    atr_status = _verify_status(
        n_ts,
        TARGET_TS_EXITS,
        pos_wr_ts,
        BASELINE_TS_WIN_RATE,
        expectancy=exp_ts if n_ts >= 5 else None,
        expectancy_baseline=base_ts,
    )
    items.append(
        {
            "key": "atr_stop",
            "label": "ATR 기반 초기 스탑",
            "adopted_at": atr_adopted,
            "status": atr_status,
            "progress_pct": min(round(n_ts / TARGET_TS_EXITS * 100), 100),
            "metrics": metrics,
            "note": "변동성 맞춤 스탑이 TS 청산 승률 및 Expectancy(채택 전 %E 초과) 손실 방지를 달성하는지 검증 중",
        }
    )

    # ── 3. (삭제됨) 페니 게이트 80 ─────────────────────────────────────────────
    # 2026-07-30 페니($1 이하) 포지션 관리 레거시 제거로 DNA 게이트가 75 단일값으로
    # 통일됨 — 더 이상 별도 검증 항목으로 추적할 의미가 없어 대시보드에서 제거.
    # IMPROVEMENT_ADOPTED["penny_gate_80"] 등 감사 기록 상수는 유지한다.

    # ── 4. Whipsaw 수정 ──────────────────────────────────────────────────────
    whip_adopted = IMPROVEMENT_ADOPTED["whipsaw_fix"]
    whip_adopted_dt = datetime.fromisoformat(
        IMPROVEMENT_CUTOFFS["whipsaw_fix"].replace("Z", "+00:00")
    )
    whip_since = max(
        whip_adopted_dt,
        now_utc - timedelta(days=WHIPSAW_OBSERVE_DAYS),
    )
    whip_since_iso = whip_since.isoformat()
    by_ticker_day = defaultdict(int)
    for t in trades:
        if t["exit_reason"] == "Scale-Out 50%":
            continue  # 부분 익절은 라운드트립이 아니므로 재진입으로 세지 않음
        if t["closed_at"] < whip_since_iso:
            continue
        by_ticker_day[(t["ticker"], t["closed_at"][:10])] += 1
    whip_days = sum(1 for v in by_ticker_day.values() if v >= 2)
    days_observed = (now_utc - whip_adopted_dt).days
    if whip_days > 0:
        whip_status = "REGRESSED"
    elif days_observed >= WHIPSAW_OBSERVE_DAYS:
        whip_status = "VERIFIED"
    else:
        whip_status = "ON_TRACK"
    items.append(
        {
            "key": "whipsaw_fix",
            "label": "Whipsaw 재진입 방지",
            "adopted_at": whip_adopted,
            "status": whip_status,
            "progress_pct": min(round(days_observed / WHIPSAW_OBSERVE_DAYS * 100), 100),
            "metrics": [
                {
                    "label": f"최근 {WHIPSAW_OBSERVE_DAYS}일 같은날 반복 청산",
                    "value": f"{whip_days}건",
                },
                {"label": "관찰 경과", "value": f"{days_observed}일"},
            ],
            "note": "당일 재진입 금지 도입 후 같은 종목 반복 손절(6/30 유형) 재발 감시",
        }
    )

    # ── 5. 확장도·급등 매수 방지 가드 ────────────────────────────────────────
    ext_adopted = IMPROVEMENT_ADOPTED["extension_guard_tighten"]
    ext_trades = _active_window("extension_guard_tighten")
    pos_wr_ext, exp_ext, sortino_ext, n_ext, exp_usd_ext = _calc_metrics_expectancy(
        ext_trades
    )

    metrics = [
        {
            "label": "도입 후 신규 진입(포지션)",
            "value": f"{n_ext} / {TARGET_EXTENSION_TRADES}건",
        }
    ]
    if len(ext_trades) != n_ext:
        metrics.append({"label": "원본 청산 행수", "value": f"{len(ext_trades)}건"})
    if n_ext > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_ext:.1f}%"}
        )
        metrics.append({"label": "거래당 기대수익률 (%E)", "value": f"{exp_ext:+.2f}%"})
        if base_ext is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_ext:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_ext:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_ext:.2f}"})
    metrics.append(
        {"label": "개선 전 전체 승률(기준선)", "value": f"{BASELINE_OVERALL_WIN_RATE}%"}
    )

    ext_status = _verify_status(
        n_ext,
        TARGET_EXTENSION_TRADES,
        pos_wr_ext,
        BASELINE_OVERALL_WIN_RATE,
        expectancy=exp_ext if n_ext >= 5 else None,
        expectancy_baseline=base_ext,
    )
    items.append(
        {
            "key": "extension_guard_tighten",
            "label": "확장도·급등 매수 방지 가드",
            "adopted_at": ext_adopted,
            "status": ext_status,
            "progress_pct": min(round(n_ext / TARGET_EXTENSION_TRADES * 100), 100),
            "metrics": metrics,
            "note": "고점 매수 비중을 줄여 포지션 승률 및 Expectancy(채택 전 %E 초과) 손실 방지를 달성하는지 검증 중",
        }
    )

    # ── 6. 눌림목(Pullback) 2차 대기 지정가 진입 ─────────────────────────────
    # 급등 스파이크로 Spike Guard가 차단한 신호를 즉시 잊는 대신 눌림목 감시(
    # pullback_watches)로 추적해 되돌림·반등 확인 후 진입시킨다(paper_engine.py
    # _evaluate_pullback_watch). 도입 후 전체 신규 진입 대비 승률·Expectancy를
    # 기존 전체 승률 기준선(BASELINE_OVERALL_WIN_RATE)과 비교해 검증한다 —
    # extension_guard_tighten과 동일하게 "도입일 이후 신규 진입 전체"를 모집단으로 삼는다.
    pullback_adopted = IMPROVEMENT_ADOPTED["pullback_entry"]
    pullback_trades = _active_window("pullback_entry")
    (
        pos_wr_pullback,
        exp_pullback,
        sortino_pullback,
        n_pullback,
        exp_usd_pullback,
    ) = _calc_metrics_expectancy(pullback_trades)

    metrics = [
        {
            "label": "도입 후 신규 진입(포지션)",
            "value": f"{n_pullback} / {TARGET_PULLBACK_TRADES}건",
        }
    ]
    if len(pullback_trades) != n_pullback:
        metrics.append(
            {"label": "원본 청산 행수", "value": f"{len(pullback_trades)}건"}
        )
    if n_pullback > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_pullback:.1f}%"}
        )
        metrics.append(
            {"label": "거래당 기대수익률 (%E)", "value": f"{exp_pullback:+.2f}%"}
        )
        if base_pullback is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_pullback:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_pullback:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_pullback:.2f}"})
    metrics.append(
        {"label": "개선 전 전체 승률(기준선)", "value": f"{BASELINE_OVERALL_WIN_RATE}%"}
    )

    pullback_status = _verify_status(
        n_pullback,
        TARGET_PULLBACK_TRADES,
        pos_wr_pullback,
        BASELINE_OVERALL_WIN_RATE,
        expectancy=exp_pullback if n_pullback >= 5 else None,
        expectancy_baseline=base_pullback,
    )
    items.append(
        {
            "key": "pullback_entry",
            "label": "눌림목 2차 대기 지정가 진입",
            "adopted_at": pullback_adopted,
            "status": pullback_status,
            "progress_pct": min(round(n_pullback / TARGET_PULLBACK_TRADES * 100), 100),
            "metrics": metrics,
            "note": "급등 즉시매수 대신 되돌림·반등 확인 후 진입이 승률 및 Expectancy(채택 전 %E 초과) 손실 방지를 달성하는지 검증 중",
        }
    )

    # ── 7. RSI 낙폭방어 전환 (DNA_Score 컴포넌트 수정) ──────────────────────
    # 일반 종목의 RSI 채점을 "과매도=반등 매수 기회"(정방향)에서 페니와 동일한
    # "낙폭 방어(떨어지는 칼날)"로 전환. forward_return_logger 실측(76건)에서
    # RSI가 30m 수익률과 유의한 음의 상관(r=-0.229, p=0.047)으로 나온 것이 근거.
    # extension_guard_tighten/pullback_entry와 동일하게 "도입일 이후 신규 진입
    # 전체"를 모집단으로 승률·Expectancy를 기존 전체 승률 기준선과 비교한다.
    rsi_fix_adopted = IMPROVEMENT_ADOPTED["rsi_falling_knife_fix"]
    rsi_fix_trades = _active_window("rsi_falling_knife_fix")
    (
        pos_wr_rsi_fix,
        exp_rsi_fix,
        sortino_rsi_fix,
        n_rsi_fix,
        exp_usd_rsi_fix,
    ) = _calc_metrics_expectancy(rsi_fix_trades)

    metrics = [
        {
            "label": "도입 후 신규 진입(포지션)",
            "value": f"{n_rsi_fix} / {TARGET_RSI_FIX_TRADES}건",
        }
    ]
    if len(rsi_fix_trades) != n_rsi_fix:
        metrics.append({"label": "원본 청산 행수", "value": f"{len(rsi_fix_trades)}건"})
    if n_rsi_fix > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_rsi_fix:.1f}%"}
        )
        metrics.append(
            {"label": "거래당 기대수익률 (%E)", "value": f"{exp_rsi_fix:+.2f}%"}
        )
        if base_rsi_fix is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_rsi_fix:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_rsi_fix:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_rsi_fix:.2f}"})
    metrics.append(
        {"label": "개선 전 전체 승률(기준선)", "value": f"{BASELINE_OVERALL_WIN_RATE}%"}
    )

    rsi_fix_status = _verify_status(
        n_rsi_fix,
        TARGET_RSI_FIX_TRADES,
        pos_wr_rsi_fix,
        BASELINE_OVERALL_WIN_RATE,
        expectancy=exp_rsi_fix if n_rsi_fix >= 5 else None,
        expectancy_baseline=base_rsi_fix,
    )
    items.append(
        {
            "key": "rsi_falling_knife_fix",
            "label": "RSI 낙폭방어 전환",
            "adopted_at": rsi_fix_adopted,
            "status": rsi_fix_status,
            "progress_pct": min(round(n_rsi_fix / TARGET_RSI_FIX_TRADES * 100), 100),
            "metrics": metrics,
            "note": "RSI 과매도 채점을 반등 매수에서 낙폭 방어로 전환한 것이 승률 및 Expectancy(채택 전 %E 초과) 개선을 달성하는지 검증 중",
        }
    )

    # ── 8. Watchlist 실시간 구독 유니버스 확대 ──────────────────────────────
    # 실시간 스트림 구독 상한을 30→100으로 늘리고, get_watchlist_tickers()
    # 정렬 기준을 고정 initial_dna_score에서 재스캔 시각(recency) 우선으로
    # 바꿔 낡은 DNA 고정값이 신선한 발굴 종목의 구독 슬롯을 영구 점거하던
    # 문제를 해결했다(HYFM DNA93이 순위 1,800위 밖에서 3위로 즉시 이동한 것으로
    # 실측 확인). extension_guard_tighten/pullback_entry와 동일하게 "도입일
    # 이후 신규 진입 전체"를 모집단으로 승률·Expectancy를 기존 전체 승률
    # 기준선과 비교한다.
    wexp_adopted = IMPROVEMENT_ADOPTED["watchlist_universe_expansion"]
    wexp_trades = _active_window("watchlist_universe_expansion")
    pos_wr_wexp, exp_wexp, sortino_wexp, n_wexp, exp_usd_wexp = (
        _calc_metrics_expectancy(wexp_trades)
    )

    metrics = [
        {
            "label": "도입 후 신규 진입(포지션)",
            "value": f"{n_wexp} / {TARGET_WATCHLIST_EXPANSION_TRADES}건",
        }
    ]
    if len(wexp_trades) != n_wexp:
        metrics.append({"label": "원본 청산 행수", "value": f"{len(wexp_trades)}건"})
    if n_wexp > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_wexp:.1f}%"}
        )
        metrics.append(
            {"label": "거래당 기대수익률 (%E)", "value": f"{exp_wexp:+.2f}%"}
        )
        if base_wexp is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_wexp:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_wexp:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_wexp:.2f}"})
    metrics.append(
        {"label": "개선 전 전체 승률(기준선)", "value": f"{BASELINE_OVERALL_WIN_RATE}%"}
    )

    wexp_status = _verify_status(
        n_wexp,
        TARGET_WATCHLIST_EXPANSION_TRADES,
        pos_wr_wexp,
        BASELINE_OVERALL_WIN_RATE,
        expectancy=exp_wexp if n_wexp >= 5 else None,
        expectancy_baseline=base_wexp,
    )
    items.append(
        {
            "key": "watchlist_universe_expansion",
            "label": "Watchlist 실시간 구독 유니버스 확대",
            "adopted_at": wexp_adopted,
            "status": wexp_status,
            "progress_pct": min(
                round(n_wexp / TARGET_WATCHLIST_EXPANSION_TRADES * 100), 100
            ),
            "metrics": metrics,
            "note": "구독 상한 확대(30→100)+정렬 기준 개선(recency)이 승률 및 Expectancy(채택 전 %E 초과) 개선을 달성하는지 검증 중",
        }
    )

    # ── 9. Scale-In (보유 승자 추가매수) ────────────────────────────────────
    # 기존 엔진은 포지션당 최초 진입 이후 추가 매수 로직이 전혀 없어(ANTX 사례),
    # +15% 이상 수익 중인 포지션에 한해 1회 한정 추가매수를 신규 도입했다.
    # 다른 항목과 달리 "도입 후 전체 신규 진입"이 아니라 실제로 Scale-In이
    # 실행된 거래만(paper_history.scaled_in=True) 골라 그 거래들의 최종
    # 승률·Expectancy를 검증한다 — Scale-In 자체가 그 거래의 결과에 미친
    # 영향을 다른 거래들의 노이즈 없이 확인하기 위함.
    scale_in_adopted = IMPROVEMENT_ADOPTED["scale_in"]
    scale_in_trades = _active_window("scale_in", lambda t: t.get("scaled_in"))
    pos_wr_si, exp_si, sortino_si, n_si, exp_usd_si = _calc_metrics_expectancy(
        scale_in_trades
    )

    metrics = [
        {
            "label": "Scale-In 실행 거래(포지션)",
            "value": f"{n_si} / {TARGET_SCALE_IN_TRADES}건",
        }
    ]
    if n_si > 0:
        metrics.append(
            {"label": "포지션 라운드트립 승률", "value": f"{pos_wr_si:.1f}%"}
        )
        metrics.append({"label": "거래당 기대수익률 (%E)", "value": f"{exp_si:+.2f}%"})
        if base_si is not None:
            metrics.append(
                {
                    "label": "채택 전 %E (기준선)",
                    "value": f"{base_si:+.2f}%",
                }
            )
        metrics.append(
            {"label": "(참고) 거래당 기대값 ($E)", "value": f"{exp_usd_si:+.2f}$"}
        )
        metrics.append({"label": "Sortino Ratio", "value": f"{sortino_si:.2f}"})
    metrics.append(
        {"label": "개선 전 전체 승률(기준선)", "value": f"{BASELINE_OVERALL_WIN_RATE}%"}
    )

    scale_in_status = _verify_status(
        n_si,
        TARGET_SCALE_IN_TRADES,
        pos_wr_si,
        BASELINE_OVERALL_WIN_RATE,
        expectancy=exp_si if n_si >= 5 else None,
        expectancy_baseline=base_si,
    )
    items.append(
        {
            "key": "scale_in",
            "label": "Scale-In (보유 승자 추가매수)",
            "adopted_at": scale_in_adopted,
            "status": scale_in_status,
            "progress_pct": min(round(n_si / TARGET_SCALE_IN_TRADES * 100), 100),
            "metrics": metrics,
            "note": "+15% 이상 수익 포지션에 1회 한정 추가매수가 해당 거래의 승률·Expectancy(채택 전 %E 초과)를 개선하는지 검증 중",
        }
    )

    # ── 10. 신규 알파 팩터 가설 검증 (평균회귀/모멘텀/변동성 돌파) ──────────────
    # 2026-08-05 도입: DNA_Score(합성값) 자체의 예측력 부재가 확인된 뒤(위 rsi_falling_
    # knife_fix 참고), 매수 타이밍의 새 후보 팩터 3개의 raw 값을 engine_decisions에
    # 기록하기 시작했다. 이 항목들은 "이미 채택된 파라미터"의 사후 검증이 아니라
    # "아직 채택 안 한 후보"의 탐색적 상관분석이라 다른 항목과 판정 방식이 다르다 —
    # 승률/Expectancy 대신 forward_return_30m과의 Pearson 상관계수(r)·유의확률(p)을
    # 쓰고, VERIFIED는 "유의미한 상관관계 확인"(p<0.05)을, REGRESSED는 "표본은
    # 충분히 쌓였으나 유의미한 관계 없음"(p>=0.05)을 의미한다 — 다른 항목의
    # REGRESSED(악화·롤백 필요)와는 뉘앙스가 다르므로 note에 매번 명시한다.
    alpha_adopted_ts = IMPROVEMENT_CUTOFFS["alpha_zscore_mean_reversion"]
    alpha_rows_raw = [d for d in decisions if d["ts"] >= alpha_adopted_ts]
    alpha_rows = _dedup_signal_episodes(alpha_rows_raw)
    alpha_collected = [
        d
        for d in alpha_rows
        if d.get("forward_30m_checked") and d.get("forward_return_30m") is not None
    ]
    n_alpha = len(alpha_collected)

    def _factor_correlation(field: str) -> tuple[float | None, float | None, int]:
        pairs = [
            (d[field], d["forward_return_30m"])
            for d in alpha_collected
            if d.get(field) is not None
        ]
        if len(pairs) < 5:
            return None, None, len(pairs)
        xs = np.array([p[0] for p in pairs], dtype=float)
        ys = np.array([p[1] for p in pairs], dtype=float)
        if np.std(xs) == 0 or np.std(ys) == 0:
            return None, None, len(pairs)
        r, p = scipy_stats.pearsonr(xs, ys)
        return round(float(r), 4), round(float(p), 4), len(pairs)

    # expected_sign: 가설이 맞다면 상관계수가 어느 부호여야 하는지.
    # 평균회귀는 "낮은 Z(과매도)일수록 forward_return이 높다" → 음의 상관.
    # 모멘텀/변동성 돌파는 "이격·돌파폭이 클수록 forward_return도 높다" → 양의 상관.
    # 부호와 무관하게 p<0.05만 보면 반대 방향으로 유의미한(=가설을 반증하는)
    # 결과도 VERIFIED로 잘못 표시되므로 반드시 함께 확인해야 한다.
    alpha_factor_specs = [
        (
            "alpha_zscore_mean_reversion",
            "평균회귀 (Z-Score)",
            "z_score_20",
            "negative",
            "Z-Score와 forward_return_30m의 상관관계 — 음의 상관(과매도일수록 반등)이면 평균회귀 가설 지지",
        ),
        (
            "alpha_ma20_momentum",
            "모멘텀 (MA20 이격도)",
            "ma20_deviation_pct",
            "positive",
            "MA20 이격도와 forward_return_30m의 상관관계 — 양의 상관(이격 클수록 상승 지속)이면 모멘텀 가설 지지",
        ),
        (
            "alpha_breakout_volatility",
            "변동성 돌파 (목표가 괴리율)",
            "breakout_deviation_pct",
            "positive",
            "돌파 목표가 대비 괴리율과 forward_return_30m의 상관관계 — 양의 상관이면 변동성 돌파 가설 지지",
        ),
    ]
    for key, label, field, expected_sign, hypothesis_note in alpha_factor_specs:
        r, p, n_field = _factor_correlation(field)
        # 진행률/판정 게이트는 반드시 이 팩터 자체의 유효 표본(n_field) 기준이어야 한다.
        # n_alpha(에피소드 전체)로 게이트하면, 예컨대 breakout_deviation_pct처럼 라이브
        # 스트림 첫날엔 전일 데이터 부재로 자주 None인 팩터가 "표본 부족" 상태인데도
        # 다른 팩터 덕에 채워진 n_alpha만으로 목표 도달 판정을 받아, 실제로는 데이터가
        # 모자란 것을 "유의미한 관계 없음(REGRESSED)"으로 오판정하게 된다.
        metrics = [
            {
                "label": "유효 표본(이 팩터)",
                "value": f"{n_field} / {TARGET_ALPHA_FACTOR_SAMPLES}건",
            },
            {
                "label": "관찰 에피소드 전체",
                "value": f"{n_alpha}건",
            },
        ]
        if r is not None:
            metrics.append({"label": "상관계수 (r)", "value": f"{r:+.3f}"})
            metrics.append({"label": "유의확률 (p)", "value": f"{p:.4f}"})
        if n_field >= TARGET_ALPHA_FACTOR_SAMPLES:
            sign_ok = r is not None and (
                (r < 0) if expected_sign == "negative" else (r > 0)
            )
            if r is not None and p < 0.05 and sign_ok:
                factor_status = "VERIFIED"
                note = f"{hypothesis_note} — 유의미한 상관관계 확인(p<0.05, 가설 방향 일치)"
            elif r is not None and p < 0.05 and not sign_ok:
                factor_status = "REGRESSED"
                note = f"{hypothesis_note} — 유의미하지만 가설과 반대 방향(p<0.05) — 가설 반증. 채택된 개선이 아니라 후보 탐색 결과이며 되돌릴 파라미터도 없음"
            else:
                factor_status = "REGRESSED"
                note = f"{hypothesis_note} — 목표 표본 도달, 유의미한 관계 없음(p≥0.05). 채택된 개선이 아니라 후보 탐색 결과이며 되돌릴 파라미터도 없음"
        else:
            factor_status = "ON_TRACK" if n_field >= 5 else "COLLECTING"
            note = f"{hypothesis_note} — 표본 축적 중"
        items.append(
            {
                "key": key,
                "label": label,
                "adopted_at": IMPROVEMENT_ADOPTED[key],
                "status": factor_status,
                "progress_pct": min(
                    round(n_field / TARGET_ALPHA_FACTOR_SAMPLES * 100), 100
                ),
                "metrics": metrics,
                "note": note,
            }
        )

    # ── 자동 롤백 이력 병합 ──────────────────────────────────────────────────
    # evaluate_improvement_rollback()이 이미 조치를 실행한 항목은 대시보드에서
    # "자동 롤백 적용됨" 배지로 보이도록 최신 조치 로그를 items에 붙인다.
    rollback_res = await asyncio.to_thread(
        supabase.table("improvement_rollback_log")
        .select("item_key,action_detail,checked_at")
        .in_("item_key", list(ROLLBACK_ACTIONABLE_ITEMS))
        .eq("action_taken", True)
        .order("checked_at", desc=True)
        .execute
    )
    rollback_by_key = {}
    for row in rollback_res.data or []:
        rollback_by_key.setdefault(
            row["item_key"], row
        )  # 최신순 정렬이므로 첫 값만 사용

    for item in items:
        applied = rollback_by_key.get(item["key"])
        item["auto_rollback_applied"] = applied is not None
        item["auto_rollback_detail"] = applied["action_detail"] if applied else None

    return {"generated_at": now_utc.isoformat(), "items": items}


@router.post("/{item_key}/toggle")
async def toggle_checklist_item(item_key: str, api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    current = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("is_checked, is_automated")
        .eq("item_key", item_key)
        .single()
        .execute
    )
    if not current.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="체크리스트 항목 없음"
        )

    if current.data.get("is_automated"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="자동 검증 항목은 수동으로 토글할 수 없습니다.",
        )

    new_checked = not current.data["is_checked"]
    updated = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .update(
            {
                "is_checked": new_checked,
                "checked_at": (
                    datetime.now(timezone.utc).isoformat() if new_checked else None
                ),
            }
        )
        .eq("item_key", item_key)
        .execute
    )
    return updated.data[0]


async def evaluate_checklist():
    """paper_history 기반 성과를 계산해 자동 검증 항목(is_checked/auto_note/checked_at)을 갱신.

    main.py의 auto_checklist_eval_scheduler가 24시간마다 호출한다.
    """
    supabase = app_state.supabase
    if not supabase:
        return

    print("🔄 [Checklist Eval] 자동 검증을 시작합니다...")
    res = await asyncio.to_thread(
        supabase.table("paper_history")
        .select("pnl_pct,profit_amt,closed_at,ticker,exit_reason,entry_price")
        .order("closed_at", desc=False)
        .execute
    )
    trades = [t for t in (res.data or []) if not is_backfilled_phantom_trade(t)]
    stats = _compute_bucket_stats(trades)
    now_utc = datetime.now(timezone.utc)

    first_trade_dt = None
    if trades and trades[0].get("closed_at"):
        first_trade_dt = datetime.fromisoformat(
            trades[0]["closed_at"].replace("Z", "+00:00")
        )
    days_passed = (now_utc - first_trade_dt).days if first_trade_dt else 0
    total_trades = stats.get("total_trades", 0)
    # Scale-Out 50% 부분매도가 승리 체결 행을 따로 만들어 체결 단위 win_rate를 부풀릴 수
    # 있으므로, 실계좌 전환 게이트는 포지션(ticker+entry_price 그룹) 단위 승률을 쓴다
    # — ReportsPage.tsx/spread_gate_readout.py가 이미 pos_win_rate를 정확한 지표로 채택.
    win_rate = stats.get("pos_win_rate", 0)
    profit_factor = stats.get("profit_factor", 0)
    mdd = stats.get("mdd", 0)

    sys_settings_res = await asyncio.to_thread(
        supabase.table("system_settings").select("*").eq("id", 1).single().execute
    )
    sys_settings = sys_settings_res.data or {}

    import os

    apca_paper_env = os.getenv("APCA_PAPER", "true").lower()
    live_env_tested = apca_paper_env == "false"
    live_env_note = (
        "LIVE 모드 감지됨" if live_env_tested else "현재 Paper 모드 (APCA_PAPER=true)"
    )

    pdt_reviewed = False
    pdt_note = "LIVE 계좌 정보 없음"
    live_account_funded = False
    live_account_note = "LIVE 계좌 정보 없음"

    if live_env_tested and app_state.trading_client:
        try:
            account = await asyncio.to_thread(app_state.trading_client.get_account)
            account_equity = float(account.equity)
            if float(account.multiplier or 1) == 1:
                pdt_reviewed = True
                pdt_note = "Cash Account (PDT 면제)"
            elif account_equity >= 25000:
                pdt_reviewed = True
                pdt_note = f"Equity ${account_equity:,.0f} (≥$25K)"
            elif getattr(account, "pattern_day_trader", False):
                pdt_reviewed = True
                pdt_note = "PDT 상태 확인됨"
            else:
                pdt_reviewed = False
                pdt_note = f"Margin 계좌 (Equity ${account_equity:,.0f} < $25K)"

            if account.status == "ACTIVE" and account_equity > 0:
                live_account_funded = True
                live_account_note = f"ACTIVE / ${account_equity:,.0f}"
            else:
                live_account_note = f"상태: {account.status} / ${account_equity:,.0f}"
        except Exception:
            pdt_note = "LIVE 계좌 조회 실패"
            live_account_note = "LIVE 계좌 조회 실패"

    risk_threshold = sys_settings.get("alert_threshold", 0)
    risk_defined = risk_threshold > 0
    risk_capital_note = (
        f"Alert Threshold: {risk_threshold}% 설정됨"
        if risk_defined
        else "리스크 한도 설정 필요"
    )

    webhook_url = sys_settings.get("webhook_url") or os.getenv("DISCORD_WEBHOOK_URL")
    alerting_verified = bool(webhook_url)
    alerting_note = (
        "Discord Webhook 설정됨" if alerting_verified else "Discord Webhook 누락"
    )

    # kill_switch_verified("비상 정지 ARM/DISARM·전량 청산 절차 리허설 완료")는 ARMED/DISARMED
    # 현재 상태만으로는 리허설을 실제로 수행했는지 알 수 없어 자동 판정 대상에서 제외한다 —
    # 상수 True로 항상 통과 처리하면 리허설을 한 번도 안 해도 영구히 체크된 것으로 보인다.
    # is_automated=false로 전환해(마이그레이션 참고) 사용자가 직접 리허설 후 수동 체크하도록 한다.

    # (item_key, 통과 여부, 안내 문구)
    conditions = [
        (
            "min_3month_period",
            first_trade_dt is not None and days_passed >= CHECKLIST_MIN_DAYS,
            (
                f"{days_passed}일 경과 / 목표 {CHECKLIST_MIN_DAYS}일"
                if first_trade_dt
                else "거래 내역 없음"
            ),
        ),
        (
            "min_trade_count",
            total_trades >= CHECKLIST_MIN_TRADES,
            f"거래 {total_trades}건 / 목표 {CHECKLIST_MIN_TRADES}건",
        ),
        (
            "win_rate_threshold",
            win_rate >= CHECKLIST_MIN_WIN_RATE
            and profit_factor >= CHECKLIST_MIN_PROFIT_FACTOR,
            f"승률 {win_rate:.1f}% PF {profit_factor:.2f} / 목표 {CHECKLIST_MIN_WIN_RATE}% PF {CHECKLIST_MIN_PROFIT_FACTOR}",
        ),
        (
            "mdd_acceptable",
            mdd >= CHECKLIST_MAX_MDD,
            f"MDD {mdd:.1f}% / 목표 {CHECKLIST_MAX_MDD}% 이내",
        ),
        (
            "live_env_tested",
            live_env_tested,
            live_env_note,
        ),
        (
            "pdt_reviewed",
            pdt_reviewed,
            pdt_note,
        ),
        (
            "risk_capital_defined",
            risk_defined,
            risk_capital_note,
        ),
        (
            "alerting_verified",
            alerting_verified,
            alerting_note,
        ),
        (
            "live_account_funded",
            live_account_funded,
            live_account_note,
        ),
    ]

    current_res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("item_key, is_checked, auto_note")
        .in_("item_key", [key for key, _, _ in conditions])
        .execute
    )
    current_state = {item["item_key"]: item for item in (current_res.data or [])}

    for key, new_checked, new_note in conditions:
        curr = current_state.get(key)
        if not curr:
            continue
        old_checked = curr.get("is_checked", False)
        old_note = curr.get("auto_note", "")
        if old_checked == new_checked and old_note == new_note:
            continue

        # 항목은 마이그레이션 시딩 시 이미 생성되어 있고 여기선 갱신만 하므로,
        # upsert(INSERT ... ON CONFLICT) 대신 update를 사용한다. upsert는 충돌 여부와
        # 무관하게 후보 INSERT 행이 NOT NULL 컬럼(category/label 등, 이 payload엔 없음)
        # 검증을 먼저 통과해야 해서 기존 행이 있어도 실패한다.
        update_fields = {"is_checked": new_checked, "auto_note": new_note}
        if new_checked and not old_checked:
            update_fields["checked_at"] = now_utc.isoformat()
        elif not new_checked and old_checked:
            update_fields["checked_at"] = None

        await asyncio.to_thread(
            supabase.table("live_transition_checklist")
            .update(update_fields)
            .eq("item_key", key)
            .execute
        )
        print(
            f"✅ [Checklist Eval] {key} 갱신: {old_checked}->{new_checked} ({new_note})"
        )


def _apply_rollback_action(key: str, engines: list) -> str:
    """REGRESSED 연속 확정된 개선 항목의 파라미터를 이전 값으로 되돌린다.

    engines에 담긴 PaperTradingManager/LiveTradingManager 인스턴스를 직접 mutate하므로
    프로세스 재시작 없이 다음 신호부터 즉시 반영된다. 반환값은 Discord 알림·로그에 쓰인다.
    """
    if key == "atr_stop":
        for e in engines:
            e.atr_stop_enabled = False
        return "ATR 기반 초기 스탑 비활성화 → 고정 % 스탑(-10%)으로 롤백"
    if key == "whipsaw_fix":
        for e in engines:
            e.max_daily_trades_per_ticker = 1
            e.REENTRY_COOLDOWN_MINUTES = 60
        return "종목당 일일 거래한도 2→1건, 재진입 쿨다운 15→60분으로 강화"
    if key == "extension_guard_tighten":
        for e in engines:
            e.extension_guard_penny_tight_enabled = False
            e.spike_guard_enabled = False
        return "페니 확장도 임계값을 일반 종목과 동일하게 완화 + 급등 스파이크 가드 비활성화로 롤백"
    if key == "pullback_entry":
        for e in engines:
            e.pullback_entry_enabled = False
        return "눌림목 감시(pullback_watches) 비활성화 → Spike Guard 즉시 차단(stateless)으로 롤백"
    if key == "scale_in":
        for e in engines:
            e.scale_in_enabled = False
        return "Scale-In(추가매수) 비활성화 → 포지션당 최초 진입만 유지"
    if key == "rsi_falling_knife_fix":
        from services import quant_engine

        quant_engine.set_rsi_mean_reversion_mode(True)
        return "DNA_Score RSI 채점을 낙폭방어형 → 평균회귀형(2026-08-01 이전)으로 롤백"
    return "알 수 없는 항목 — 조치 없음"


async def _persist_rollback_settings(supabase, key: str) -> None:
    """엔진 인스턴스 mutate와 별개로 system_settings에도 저장 — 서버 재시작 후에도
    run_startup_sequence()가 이 값을 읽어 롤백 상태를 유지하도록 한다."""
    field_map = {
        "atr_stop": {"atr_stop_enabled": False},
        "whipsaw_fix": {
            "max_daily_trades_per_ticker": 1,
            "reentry_cooldown_minutes": 60,
        },
        "extension_guard_tighten": {
            "extension_guard_penny_tight_enabled": False,
            "spike_guard_enabled": False,
        },
        "pullback_entry": {"pullback_entry_enabled": False},
        "scale_in": {"scale_in_enabled": False},
        "rsi_falling_knife_fix": {"rsi_mean_reversion_mode": True},
    }
    fields = field_map.get(key)
    if not fields:
        return
    await asyncio.to_thread(
        supabase.table("system_settings").update(fields).eq("id", 1).execute
    )


async def evaluate_improvement_rollback():
    """개선 검증 트래커가 REGRESSED를 CONSECUTIVE_REGRESSED_THRESHOLD회 연속(24시간 주기 호출
    기준 이틀 연속) 판정하면 해당 개선의 파라미터를 자동으로 되돌리고 Discord로 통보한다.

    schedulers/tasks.py의 auto_improvement_rollback_scheduler가 24시간마다 호출한다.
    한 항목당 자동 조치는 평생 1회만 실행한다 — 롤백 이후에도 REGRESSED가 이어지면
    이미 완화된 파라미터로도 개선되지 않는다는 뜻이므로, 더 되돌릴 곳이 없어 반복 조치는
    의미가 없고(무한 flip-flop 방지) 사람이 재검토해야 한다는 신호로 로그만 남긴다.
    """
    supabase = app_state.supabase
    if not supabase:
        return

    result = await compute_improvement_status(supabase)
    engines = [
        e for e in (app_state.paper_engine, app_state.live_engine) if e is not None
    ]

    for item in result["items"]:
        key = item["key"]
        if key not in ROLLBACK_ACTIONABLE_ITEMS:
            continue
        item_status = item["status"]

        prev_res = await asyncio.to_thread(
            supabase.table("improvement_rollback_log")
            .select("status,consecutive_regressed,action_taken")
            .eq("item_key", key)
            .order("checked_at", desc=True)
            .limit(1)
            .execute
        )
        prev_rows = prev_res.data or []
        prev = prev_rows[0] if prev_rows else None

        ever_rolled_back_res = await asyncio.to_thread(
            supabase.table("improvement_rollback_log")
            .select("id")
            .eq("item_key", key)
            .eq("action_taken", True)
            .limit(1)
            .execute
        )
        already_rolled_back = bool(ever_rolled_back_res.data)

        if item_status == "REGRESSED":
            consecutive = (
                prev["consecutive_regressed"] + 1
                if prev and prev.get("status") == "REGRESSED"
                else 1
            )
        else:
            consecutive = 0

        action_taken = False
        action_detail = None
        if (
            item_status == "REGRESSED"
            and consecutive >= CONSECUTIVE_REGRESSED_THRESHOLD
            and not already_rolled_back
        ):
            action_detail = _apply_rollback_action(key, engines)
            await _persist_rollback_settings(supabase, key)
            action_taken = True
            print(f"🔻 [ImprovementRollback] {key} 자동 롤백 실행: {action_detail}")

            webhook = engines[0].webhook if engines else app_state.webhook
            if webhook:
                try:
                    await webhook.send_alert(
                        title=f"⚠️ 개선 검증 트래커 — {item['label']} 자동 롤백",
                        description=(
                            f"REGRESSED가 {consecutive}회 연속 판정되어 파라미터를 자동으로 되돌렸습니다.\n\n"
                            f"**조치:** {action_detail}\n\n"
                            f"도입일: {item['adopted_at']} · 확인 시각: {result['generated_at']}"
                        ),
                        color=0xE11D48,
                    )
                except Exception as webhook_err:
                    print(f"⚠️ [ImprovementRollback] Discord 알림 실패: {webhook_err}")

        await asyncio.to_thread(
            supabase.table("improvement_rollback_log")
            .insert(
                {
                    "item_key": key,
                    "status": item_status,
                    "consecutive_regressed": consecutive,
                    "action_taken": action_taken,
                    "action_detail": action_detail,
                }
            )
            .execute
        )
