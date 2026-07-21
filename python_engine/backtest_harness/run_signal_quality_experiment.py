"""
run_signal_quality_experiment.py — Scale-Out은 유지한 채(paper_engine.py 실거래
로직과 동일), 진입 신호 품질/게이트 쪽 변수를 조정했을 때 Profit Factor가
개선되는지 하네스에서 먼저 검증한다.

run_scale_out_experiment.py 결과(2026-07-21): Scale-Out을 완전히 폐기하면
승률이 44%→32~34%로 떨어져 Avg Win 개선분을 상쇄, PF가 오히려 악화되거나
베이스라인과 비슷한 수준(0.656~0.774)에 그쳤다. 이번 실험은 청산 구조는
그대로 두고 "애초에 어떤 신호로 진입하는가"를 조정하는 방향을 탐색한다.

_apply_slippage를 0%로 monkey-patch해 구조적 효과만 순수 비교한다.
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
print("  🔬 신호 품질 실험 — Scale-Out 유지, 진입 게이트만 조정 (슬리피지 0%)")
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

# ── 신호 게이트 시나리오 ──────────────────────────────────────────────────────
# (label, numba_rsi_rank_max, numba_rvol_rank_min, tier1_dna_min, entry_stop_tight_pct)
signal_scenarios = [
    ("A. 베이스라인 (라이브 기본값)", 0.05, 0.95, 80.0, None),
    ("B. numba 완화 (하위/상위 15%)", 0.15, 0.85, 80.0, None),
    ("C. tier1 DNA 상향 (>=85, 더 엄격)", 0.05, 0.95, 85.0, None),
    ("D. numba 완화 + 초기스탑 -7%", 0.15, 0.85, 80.0, 0.07),
]

results = {}
signal_counts = {}
for label, rsi_max, rvol_min, dna_min, tight_pct in signal_scenarios:
    dfs = {
        t: prep_signals(
            d,
            new_calculate_advanced_signals,
            variant="NEW",
            numba_rsi_rank_max=rsi_max,
            numba_rvol_rank_min=rvol_min,
            tier1_dna_min=dna_min,
        )
        for t, d in raw.items()
    }
    total_signals = sum(int(dfs[t]["Strong_Buy"].sum()) for t in dfs)
    signal_counts[label] = total_signals
    print(f"▶ 시뮬레이션: {label} (Strong_Buy 신호 {total_signals}건)")
    pf = run_variant(
        dfs,
        "NEW",
        sizing="NEW",
        stop="NEW",
        scale_out_enabled=True,
        entry_stop_tight_pct=tight_pct,
    )
    results[label] = compute_metrics(pf)
    results[label]["raw_signal_count"] = total_signals

# ── 결과 출력 ────────────────────────────────────────────────────────────────
print("\n" + "=" * 130)
header = f"{'지표':<16}" + "".join(
    f"{label[:26]:>27}" for label, *_ in signal_scenarios
)
print(header)
print("=" * 130)
for key in [
    "raw_signal_count",
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
        f"{str(results[label].get(key)):>27}" for label, *_ in signal_scenarios
    )
    print(line)
print("=" * 130)

pf_baseline = results["A. 베이스라인 (라이브 기본값)"].get("profit_factor")
for label, *_ in signal_scenarios[1:]:
    pf_val = results[label].get("profit_factor")
    verdict = "PF>1.0 달성" if pf_val is not None and pf_val > 1.0 else "여전히 PF<1.0"
    delta = (
        f"(Δ {pf_val - pf_baseline:+.3f} vs 베이스라인)"
        if pf_val is not None and pf_baseline is not None
        else ""
    )
    print(f"  [{label}] PF={pf_val} — {verdict} {delta}")

output_path = os.path.join(
    ENGINE_ROOT, "backtest_harness", "signal_quality_experiment_result.json"
)
with open(output_path, "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n✅ 결과 저장됨: {output_path}")
