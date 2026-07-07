"""
routers/simulate.py — /api/simulate 엔드포인트

DNA 점수·포지션 사이징·Chandelier TS 수식을 서버에서 계산하여 반환.
프론트엔드 DnaSimulatorPage가 이 엔드포인트를 호출하므로 백엔드 수식을
TypeScript에서 수동 복제할 필요가 없어진다.

수식 원본:
  - DNA Score   : main.py → calculate_dna_score()
  - Sizing      : main.py → calculate_position_sizing() (ATR% 스칼라 버전)
  - Chandelier  : paper_engine.py → process_signal() TS 블록
  - Scale-Out   : paper_engine.py → PENNY_SCALE_OUT_*, TS_TRAIL_PCT
"""

import math
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

# paper_engine 상수 직접 참조 — 수식이 바뀌면 여기서도 자동 반영
from paper_engine import (
    CHANDELIER_K_NORMAL,
    CHANDELIER_K_PENNY,
    PENNY_BREAKEVEN_TRIGGER,
    PENNY_MAX_PRICE,
    PENNY_SCALE_OUT_PROFIT,
    PENNY_SCALE_OUT_RSI,
    PENNY_TIGHT_TS_PCT,
    PENNY_TS_INIT_PCT,
    PENNY_TS_TRAIL_PCT,
    TS_INIT_PCT,
    TS_TRAIL_PCT,
)

router = APIRouter(tags=["simulate"])

MacdStatus = Literal["golden", "dead", "rising", "falling"]

# ── 요청 스키마 ───────────────────────────────────────────────────────────────


class SimulateRequest(BaseModel):
    # DNA 입력
    rsi: float = Field(..., ge=0, le=100)
    rvol: float = Field(..., ge=0)
    macd_status: MacdStatus
    adx: float = Field(..., ge=0)
    di_positive: bool
    is_extended: bool
    is_penny: bool
    # 포지션 사이징 입력
    win_rate: float = Field(0.55, ge=0.01, le=0.99)
    profit_ratio: float = Field(2.0, ge=0.1)
    atr_pct: float = Field(0.03, ge=0.001, le=1.0)
    # Chandelier / Scale-Out 입력
    entry_price: float = Field(10.0, ge=0.001)
    highest_pct: float = Field(5.0, ge=0.0)  # 진입 후 최고 상승%


# ── 응답 스키마 ───────────────────────────────────────────────────────────────


class DnaDeltas(BaseModel):
    base: float
    rsi: float
    macd: float
    adx: float
    rvol: float
    ext: float


class DnaResult(BaseModel):
    score: float
    deltas: DnaDeltas
    tier: str
    tier_color: str
    signal: str


class SizingResult(BaseModel):
    ann_vol: float
    vol_weight: float
    kelly_f: float
    optimal_kelly: float
    final_weight: float
    buy_budget_pct: float


class ChandelierResult(BaseModel):
    k: float
    floor: float
    ts_fixed: float
    ts_chandelier: float
    effective: float


class ScaleOutResult(BaseModel):
    fires: bool
    rsi_trigger: bool
    profit_trigger: bool
    profit_ok: bool
    post_scale_ts: float
    post_scale_ts_label: str


class SimulateResponse(BaseModel):
    dna: DnaResult
    sizing: SizingResult
    chandelier: ChandelierResult
    scale_out: ScaleOutResult
    # 백엔드 상수 — 프론트에서 참조용
    constants: dict


# ── 계산 함수들 ───────────────────────────────────────────────────────────────


def _calc_dna(
    rsi: float,
    rvol: float,
    macd_status: MacdStatus,
    adx: float,
    di_positive: bool,
    is_extended: bool,
    is_penny: bool,
) -> DnaResult:
    from services.quant_engine import calculate_dna_score

    # MacdStatus to macd_diff logic
    # In simulate.py, we only have macd_status ('golden', 'dead', 'rising', 'falling')
    macd_diff = 1.0 if macd_status in ("golden", "rising") else -1.0
    macd_diff_prev = (
        -1.0
        if macd_status == "golden"
        else (
            1.0 if macd_status == "dead" else (0.5 if macd_status == "rising" else -0.5)
        )
    )

    di_plus = 1.0 if di_positive else 0.0
    di_minus = 0.0 if di_positive else 1.0

    final_score, deltas = calculate_dna_score(
        rsi=rsi,
        macd_diff=macd_diff,
        macd_diff_prev=macd_diff_prev,
        adx=adx,
        di_plus=di_plus,
        di_minus=di_minus,
        rvol=rvol,
        is_extended=is_extended,
        return_deltas=True,
    )

    # Tier 판정 — 임계값은 services/quant_engine.py의 tier1/tier2/tier_penny와 동일
    is_not_overbought = (
        rsi < 70
    )  # quant_engine.py: RSI≥70은 이미 소진된 급등으로 간주해 차단
    is_penny_buy = is_penny and final_score >= 65 and is_not_overbought
    is_tier1 = not is_penny and final_score >= 80 and is_not_overbought
    is_tier2 = not is_penny and final_score >= 75 and rvol > 1.5 and is_not_overbought
    is_sell = final_score <= 40

    tier = "HOLD"
    tier_color = "text-slate-700"
    signal = "NORMAL"
    if is_penny_buy:
        tier, tier_color, signal = "Tier-Penny", "text-cyan-700", "STRONG BUY"
    elif is_tier1:
        tier, tier_color, signal = "Tier-1", "text-emerald-700", "STRONG BUY"
    elif is_tier2:
        tier, tier_color, signal = "Tier-2", "text-teal-700", "BUY"
    elif is_sell:
        tier, tier_color, signal = "SELL", "text-rose-700", "STRONG SELL"
    elif not is_not_overbought and final_score >= 65:
        tier, tier_color, signal = "HOLD", "text-amber-700", "HOLD (RSI 과매수 차단)"

    # Momentum Interceptor (main.py MomentumValidator, rvol_threshold=1.5) — 모든 BUY 등급에 적용
    if signal in ("STRONG BUY", "BUY") and rvol < 1.5:
        signal = "HOLD (Momentum Blocked)"
        tier_color = "text-amber-700"

    return DnaResult(
        score=final_score,
        deltas=DnaDeltas(
            base=50,
            rsi=deltas["rsi"],
            macd=deltas["macd"],
            adx=deltas["adx"],
            rvol=deltas["rvol"],
            ext=deltas["ext"],
        ),
        tier=tier,
        tier_color=tier_color,
        signal=signal,
    )


def _calc_sizing(win_rate: float, profit_ratio: float, atr_pct: float) -> SizingResult:
    ann_vol = atr_pct * math.sqrt(252)
    vol_weight = 0.15 / ann_vol if ann_vol > 1e-9 else 0.0

    q = 1 - win_rate
    b = profit_ratio
    kelly_f = (b * win_rate - q) / b if b > 0 else 0.0
    optimal_kelly = max(0.0, kelly_f) * 0.25

    avg_weight = (vol_weight + optimal_kelly) / 2.0
    final_weight = min(avg_weight, vol_weight * 2.0, 1.0)
    buy_budget_pct = min(final_weight, 0.25) * 100

    return SizingResult(
        ann_vol=round(ann_vol * 100, 2),
        vol_weight=round(vol_weight * 100, 2),
        kelly_f=round(kelly_f, 4),
        optimal_kelly=round(optimal_kelly * 100, 2),
        final_weight=round(final_weight * 100, 2),
        buy_budget_pct=round(buy_budget_pct, 2),
    )


def _calc_chandelier(
    highest: float,
    atr_pct: float,
    is_penny: bool,
    entry_price: float,
) -> ChandelierResult:
    k = CHANDELIER_K_PENNY if is_penny else CHANDELIER_K_NORMAL
    atr_abs = entry_price * atr_pct
    floor_pct = PENNY_TS_INIT_PCT if is_penny else TS_INIT_PCT
    floor = entry_price * floor_pct
    # ATR 미공급 폴백은 paper_engine.py에서 TRAIL_PCT(최고가 추종 비율)를 쓴다 — INIT_PCT(초기 스탑)와 다름
    trail_pct = PENNY_TS_TRAIL_PCT if is_penny else TS_TRAIL_PCT
    ts_fixed = highest * trail_pct
    ts_chandelier = max(floor, highest - k * atr_abs)

    return ChandelierResult(
        k=k,
        floor=round(floor, 6),
        ts_fixed=round(ts_fixed, 6),
        ts_chandelier=round(ts_chandelier, 6),
        effective=round(ts_chandelier, 6),
    )


def _calc_scale_out(
    rsi: float,
    highest_pct: float,
    highest: float,
    is_penny: bool,
) -> ScaleOutResult:
    profit_pct = highest_pct / 100.0
    profit_ok = profit_pct >= 0.05

    if is_penny:
        rsi_trigger = rsi > PENNY_SCALE_OUT_RSI
        profit_trigger = profit_pct >= PENNY_SCALE_OUT_PROFIT
        fires = (rsi_trigger or profit_trigger) and profit_ok
        post_scale_ts = highest * PENNY_TIGHT_TS_PCT
        post_scale_ts_label = (
            f"최고가 × {PENNY_TIGHT_TS_PCT} (-{round((1-PENNY_TIGHT_TS_PCT)*100)}%)"
        )
    else:
        rsi_trigger = rsi > 60
        profit_trigger = False
        fires = rsi_trigger and profit_ok
        post_scale_ts = highest * 1.01
        post_scale_ts_label = "최고가 × 1.01 (본절+1%)"

    return ScaleOutResult(
        fires=fires,
        rsi_trigger=rsi_trigger,
        profit_trigger=profit_trigger,
        profit_ok=profit_ok,
        post_scale_ts=round(post_scale_ts, 6),
        post_scale_ts_label=post_scale_ts_label,
    )


# ── 엔드포인트 ────────────────────────────────────────────────────────────────


@router.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest) -> SimulateResponse:
    """DNA 점수·포지션 사이징·Chandelier TS를 서버에서 계산해 반환."""
    highest = req.entry_price * (1 + req.highest_pct / 100)

    dna = _calc_dna(
        rsi=req.rsi,
        rvol=req.rvol,
        macd_status=req.macd_status,
        adx=req.adx,
        di_positive=req.di_positive,
        is_extended=req.is_extended,
        is_penny=req.is_penny,
    )
    sizing = _calc_sizing(
        win_rate=req.win_rate,
        profit_ratio=req.profit_ratio,
        atr_pct=req.atr_pct,
    )
    chandelier = _calc_chandelier(
        highest=highest,
        atr_pct=req.atr_pct,
        is_penny=req.is_penny,
        entry_price=req.entry_price,
    )
    scale_out = _calc_scale_out(
        rsi=req.rsi,
        highest_pct=req.highest_pct,
        highest=highest,
        is_penny=req.is_penny,
    )

    return SimulateResponse(
        dna=dna,
        sizing=sizing,
        chandelier=chandelier,
        scale_out=scale_out,
        constants={
            "chandelier_k_normal": CHANDELIER_K_NORMAL,
            "chandelier_k_penny": CHANDELIER_K_PENNY,
            "ts_init_pct": TS_INIT_PCT,
            "ts_trail_pct": TS_TRAIL_PCT,
            "penny_ts_init_pct": PENNY_TS_INIT_PCT,
            "penny_ts_trail_pct": PENNY_TS_TRAIL_PCT,
            "penny_max_price": PENNY_MAX_PRICE,
            "penny_breakeven_trigger": PENNY_BREAKEVEN_TRIGGER,
            "penny_scale_out_rsi": PENNY_SCALE_OUT_RSI,
            "penny_scale_out_profit": PENNY_SCALE_OUT_PROFIT,
            "penny_tight_ts_pct": PENNY_TIGHT_TS_PCT,
        },
    )
