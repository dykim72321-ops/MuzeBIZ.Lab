"""
run_comparison.py를 슬리피지 0%로 실행하는 래퍼 스크립트.

engine.paper_engine._apply_slippage를 monkey-patch하여
base_pct=0으로 강제 오버라이드한 후 동일한 비교 백테스트를 수행한다.
"""

import sys
import os
import json

# python_engine을 sys.path에 추가
ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_ROOT)

# ── Step 1: _apply_slippage를 슬리피지 0% 버전으로 교체 ──────────────────────
import engine.paper_engine as _pe

_original_apply_slippage = _pe._apply_slippage


def _zero_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    """슬리피지를 0으로 가정 — 가격을 그대로 반환."""
    return round(price, 6)


# monkey-patch: paper_engine 모듈의 함수 자체를 교체
_pe._apply_slippage = _zero_slippage

# run_comparison이 from engine.paper_engine import _apply_slippage로 가져가므로
# 모듈 레벨 바인딩도 교체해야 한다 — import 전에 패치 완료
print("=" * 70)
print("  🔬 슬리피지 0% 순수 백테스트 모드")
print("  _apply_slippage → 항상 원가 반환 (base_pct = 0)")
print("=" * 70)

# ── Step 2: run_comparison 모듈을 import (패치된 상태에서) ────────────────────
# run_comparison은 top-level에서 from engine.paper_engine import _apply_slippage를
# 수행하므로, 이미 바인딩된 이름을 다시 패치해야 한다.
sys.path.insert(0, os.path.join(ENGINE_ROOT, "backtest_harness"))
import run_comparison as _rc

# run_comparison 모듈 내부의 _apply_slippage 바인딩도 교체
_rc._apply_slippage = _zero_slippage

# ── Step 3: 실행 ──────────────────────────────────────────────────────────────
from run_comparison import (
    fetch_ticker,
    prep_signals,
    run_variant,
    compute_metrics,
    UNIVERSE,
    START_DATE,
    END_DATE,
    CACHE_DIR,
)
from run_comparison import (
    old_calculate_advanced_signals,
    new_calculate_advanced_signals,
)

print(
    f"\n▶ 데이터 다운로드/캐시 로드: {len(UNIVERSE)}개 종목 ({START_DATE} ~ {END_DATE})"
)
raw = {}
for t in UNIVERSE:
    try:
        df = fetch_ticker(t)
        if len(df) > 60:
            raw[t] = df
    except Exception as e:
        print(f"  ⚠️ {t} 다운로드 실패: {e}")
print(f"  → 사용 가능 {len(raw)}개 종목")

print("▶ OLD 신호 계산 중 (9e52902 이전 로직)...")
old_dfs = {
    t: prep_signals(d, old_calculate_advanced_signals, variant="OLD")
    for t, d in raw.items()
}
print("▶ NEW 신호 계산 중 (현재 저장소 로직)...")
new_dfs = {
    t: prep_signals(d, new_calculate_advanced_signals, variant="NEW")
    for t, d in raw.items()
}


def _signal_breakdown(df):
    """quant_engine.calculate_advanced_signals()가 남긴 중간 컬럼(RSI/RVOL/DNA_Score/
    rsi_rank/rvol_rank 등)으로 Strong_Buy를 만든 두 OR 경로(DNA 티어 vs numba 과매도)를
    각각 재현해 어느 경로가 신호를 냈는지 분리 집계한다. quant_engine.py 자체는
    tier1/tier2/tier_penny/numba_strong_buy를 지역 변수로만 두고 최종 Strong_Buy만
    컬럼으로 남기므로, 진단 전용으로 여기서 동일 조건식을 재계산한다
    (라이브 신호 로직은 건드리지 않음)."""
    is_not_overbought = df["RSI"] < 70.0
    is_penny = df["Close"] <= 1.0
    tier1 = (~is_penny) & (df["DNA_Score"] >= 80.0) & (df["RVOL"] > 1.0)
    tier2 = (~is_penny) & (df["DNA_Score"] >= 75.0) & (df["RVOL"] > 1.5)
    tier_penny = is_penny & (df["DNA_Score"] >= 80.0)
    dna_tier_signal = (tier1 | tier2 | tier_penny) & is_not_overbought

    numba_strong_buy = (
        (df["rsi_rank"] <= 0.05)
        & (df["rvol_rank"] >= 0.95)
        & (df["MACD_Line"] > df["MACD_Signal"])
        & is_not_overbought
        & (~df["Is_Extended"])
        & (df["ADX"] > 20)
    ).fillna(False)

    return {
        "dna_tier": int(dna_tier_signal.sum()),
        "numba": int(numba_strong_buy.sum()),
        "strong_buy_total": int(df["Strong_Buy"].sum()),
    }


signal_breakdown = {}
for t in raw:
    old_signals = int(old_dfs[t]["Strong_Buy"].sum())
    new_signals = int(new_dfs[t]["Strong_Buy"].sum())
    breakdown = _signal_breakdown(new_dfs[t])
    signal_breakdown[t] = breakdown
    print(
        f"    {t}: OLD Strong_Buy={old_signals}, NEW Strong_Buy={new_signals} "
        f"(dna_tier={breakdown['dna_tier']}, numba={breakdown['numba']})"
    )

combos = [
    ("OLD (기존 전체)", old_dfs, "OLD", "OLD", "OLD"),
    ("NEW 켈리만 (스탑=OLD)", new_dfs, "NEW", "NEW", "OLD"),
    ("NEW 스탑만 (켈리=OLD)", new_dfs, "NEW", "OLD", "NEW"),
    ("NEW (기존 전체)", new_dfs, "NEW", "NEW", "NEW"),
]
results = {}
for label, dfs, variant, sizing, stop in combos:
    print(f"▶ 시뮬레이션: {label}")
    pf = run_variant(dfs, variant, sizing=sizing, stop=stop)
    results[label] = compute_metrics(pf)

# ── Step 4: 결과 출력 ────────────────────────────────────────────────────────
print("\n" + "=" * 92)
header = f"{'지표':<18}" + "".join(f"{label:>18}" for label, *_ in combos)
print(header)
print("=" * 92)
for key in [
    "trades",
    "win_rate",
    "profit_factor",
    "avg_pnl_pct",
    "total_return_pct",
    "mdd_pct",
    "final_equity",
]:
    line = f"{key:<18}" + "".join(
        f"{str(results[label].get(key)):>18}" for label, *_ in combos
    )
    print(line)
print("=" * 92)

# ── Step 5: 결과 저장 ────────────────────────────────────────────────────────
output_path = os.path.join(CACHE_DIR, "..", "zero_slippage_result.json")
with open(output_path, "w") as f:
    json.dump(
        {**results, "signal_breakdown": signal_breakdown},
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"\n✅ 결과 저장됨: {output_path}")

# 기존 슬리피지 포함 결과와 비교 출력
existing_path = os.path.join(CACHE_DIR, "..", "comparison_result.json")
if os.path.exists(existing_path):
    with open(existing_path) as f:
        existing = json.load(f)
    print("\n" + "=" * 92)
    print("  📊 슬리피지 0% vs 슬리피지 포함 비교")
    print("=" * 92)
    for label_key in ["OLD (기존 전체)", "NEW (기존 전체)"]:
        zero = results.get(label_key, {})
        orig = existing.get(label_key, {})
        if zero and orig:
            print(f"\n  [{label_key}]")
            for metric in [
                "trades",
                "win_rate",
                "profit_factor",
                "avg_pnl_pct",
                "total_return_pct",
                "mdd_pct",
                "final_equity",
            ]:
                z = zero.get(metric, "N/A")
                o = orig.get(metric, "N/A")
                diff = ""
                if isinstance(z, (int, float)) and isinstance(o, (int, float)):
                    delta = z - o
                    diff = f"  (Δ {delta:+.3f})"
                print(
                    f"    {metric:<20}  0% slip: {str(z):>12}  | with slip: {str(o):>12}{diff}"
                )
    print("=" * 92)
