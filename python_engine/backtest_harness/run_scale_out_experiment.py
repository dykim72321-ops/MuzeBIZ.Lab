"""
run_scale_out_experiment.py — Phase 2 사전검증: "Scale-Out 폐기 + ATR Trailing Stop
일원화"가 실제로 Profit Factor를 개선하는지 paper_engine.py를 건드리지 않고
백테스트 하네스에서 먼저 검증한다.

run_comparison.py의 Portfolio에 추가된 두 실험 스위치를 사용한다:
  - scale_out_enabled=False: 50% 분할 익절을 건너뛰고 전량을
    update_reversible_trailing_stop()(ATR 기반 Chandelier Exit)에만 맡긴다.
  - entry_stop_tight_pct: 초기 스탑 폭을 고정값(TS_INIT_PCT/PENNY_TS_INIT_PCT)
    대신 지정값으로 오버라이드한다 (예: 0.07 = -7%).

_apply_slippage를 0%로 monkey-patch해(run_zero_slippage.py와 동일 기법) 슬리피지
노이즈를 제거한 순수 구조 비교를 한다 — 슬리피지가 섞이면 "Scale-Out 구조 자체"의
개선 효과와 "슬리피지 비용" 효과가 뒤섞여 해석이 어려워지기 때문이다.
"""

import sys
import os
import json

ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_ROOT)

import engine.paper_engine as _pe

_original_apply_slippage = _pe._apply_slippage


def _zero_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    return round(price, 6)


_pe._apply_slippage = _zero_slippage

print("=" * 78)
print("  🔬 Phase 2 사전검증 — Scale-Out 폐기 + ATR TS 일원화 (슬리피지 0%)")
print("=" * 78)

sys.path.insert(0, os.path.join(ENGINE_ROOT, "backtest_harness"))
import run_comparison as _rc

_rc._apply_slippage = _zero_slippage

from run_comparison import (
    fetch_ticker,
    prep_signals,
    run_variant,
    compute_metrics,
    new_calculate_advanced_signals,
    UNIVERSE,
    START_DATE,
    END_DATE,
)

print(f"\n▶ 데이터 로드: {len(UNIVERSE)}개 종목 ({START_DATE} ~ {END_DATE})")
raw = {}
for t in UNIVERSE:
    try:
        df = fetch_ticker(t)
        if len(df) > 60:
            raw[t] = df
    except Exception as e:
        print(f"  ⚠️ {t} 다운로드 실패: {e}")

print("▶ NEW 신호 계산 중 (RVOL 보정 + Strong_Buy 재산출 반영)...")
new_dfs = {
    t: prep_signals(d, new_calculate_advanced_signals, variant="NEW")
    for t, d in raw.items()
}

# ── 실험 시나리오 ────────────────────────────────────────────────────────────
scenarios = [
    ("A. 베이스라인 (Scale-Out ON, 기존 초기스탑)", True, None),
    ("B. Scale-Out OFF (기존 초기스탑 -10%/-15%)", False, None),
    ("C. Scale-Out OFF + 초기스탑 -10% 균일", False, 0.10),
    ("D. Scale-Out OFF + 초기스탑 -7% 균일", False, 0.07),
]

results = {}
for label, scale_out_enabled, tight_pct in scenarios:
    print(f"▶ 시뮬레이션: {label}")
    pf = run_variant(
        new_dfs,
        "NEW",
        sizing="NEW",
        stop="NEW",
        scale_out_enabled=scale_out_enabled,
        entry_stop_tight_pct=tight_pct,
    )
    results[label] = compute_metrics(pf)

# ── 결과 출력 ────────────────────────────────────────────────────────────────
print("\n" + "=" * 130)
header = f"{'지표':<16}" + "".join(f"{label[:26]:>27}" for label, *_ in scenarios)
print(header)
print("=" * 130)
for key in [
    "trades",
    "win_rate",
    "profit_factor",
    "avg_win_pct",
    "avg_loss_pct",
    "win_loss_ratio",
    "avg_pnl_pct",
    "total_return_pct",
    "mdd_pct",
    "final_equity",
]:
    line = f"{key:<16}" + "".join(
        f"{str(results[label].get(key)):>27}" for label, *_ in scenarios
    )
    print(line)
print("=" * 130)

pf_baseline = results["A. 베이스라인 (Scale-Out ON, 기존 초기스탑)"].get(
    "profit_factor"
)
for label, *_ in scenarios[1:]:
    pf_val = results[label].get("profit_factor")
    verdict = "PF>1.0 달성" if pf_val is not None and pf_val > 1.0 else "여전히 PF<1.0"
    delta = (
        f"(Δ {pf_val - pf_baseline:+.3f} vs 베이스라인)"
        if pf_val is not None and pf_baseline is not None
        else ""
    )
    print(f"  [{label}] PF={pf_val} — {verdict} {delta}")

output_path = os.path.join(
    ENGINE_ROOT, "backtest_harness", "scale_out_experiment_result.json"
)
with open(output_path, "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n✅ 결과 저장됨: {output_path}")
