"""
run_long_term_trail_experiment.py — 2026-08-01: 라이브 계좌의 실제 청산 이력을 분석한
결과, PF가 극소수 대박 거래(YYGH +954%/+843%, JLHL +106%/+100%)에 전적으로 의존하고
있음을 확인했다(상위 5건 제외 시 PF 2.60 → 0.26로 붕괴). 이 구조에서는 트레일링
스탑을 단순히 "타이트하게" 조이는 게 오히려 독이 될 수 있다 — 손실은 줄지만 계좌를
먹여 살리는 그 희귀한 폭등도 일찍 끊어버릴 위험이 있기 때문이다.

이 스크립트는 paper_engine.py의 "장기 보유 모드"(entry_price<=$50, ATR/Scale-Out
스킵, highest_price 대비 고정 % 트레일링만 적용)를 하네스에 재현해(run_comparison.py에
2026-08-01 추가) 트레일링 폭을 여러 값으로 바꿔가며 PF·MDD·대박 거래 포착 여부가
어떻게 달라지는지 확인한다. 라이브 기본값은 -5%(LONG_TERM_TS_TRAIL_PCT=0.95).

run_scale_out_experiment.py와 동일하게 슬리피지 0%로 monkey-patch해 구조 자체의
효과만 순수하게 비교한다.

실행:
  python_engine/.venv/bin/python backtest_harness/run_long_term_trail_experiment.py
"""

import sys
import os
import json

ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_ROOT)

import engine.paper_engine as _pe


def _zero_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    return round(price, 6)


_pe._apply_slippage = _zero_slippage

print("=" * 78)
print("  🔬 장기 보유 모드 트레일링 스탑 폭 실험 (슬리피지 0%)")
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

# ── 실험 시나리오: 트레일링 폭을 -15%~-3%까지 스윕 ──────────────────────────
scenarios = [
    ("A. -15% (넓게 — 대박 포착 우선)", 0.85),
    ("B. -10%", 0.90),
    ("C. -7%", 0.93),
    ("D. -5% (라이브 기본값)", 0.95),
    ("E. -3% (타이트 — 손실 축소 우선)", 0.97),
]

results = {}
for label, trail_pct in scenarios:
    print(f"▶ 시뮬레이션: {label}")
    pf = run_variant(
        new_dfs,
        "NEW",
        sizing="NEW",
        stop="NEW",
        long_term_trail_pct=trail_pct,
    )
    results[label] = compute_metrics(pf)

print("\n" + "=" * 150)
header = f"{'지표':<16}" + "".join(f"{label[:28]:>29}" for label, *_ in scenarios)
print(header)
print("=" * 150)
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
        f"{str(results[label].get(key)):>29}" for label, *_ in scenarios
    )
    print(line)
print("=" * 150)

baseline_label = "D. -5% (라이브 기본값)"
pf_baseline = results[baseline_label].get("profit_factor")
print(f"\n기준(라이브 기본값 -5%) PF = {pf_baseline}")
for label, *_ in scenarios:
    if label == baseline_label:
        continue
    pf_val = results[label].get("profit_factor")
    delta = (
        f"(Δ {pf_val - pf_baseline:+.3f})"
        if pf_val is not None and pf_baseline is not None
        else ""
    )
    print(f"  [{label}] PF={pf_val} {delta}")

output_path = os.path.join(
    ENGINE_ROOT, "backtest_harness", "long_term_trail_experiment_result.json"
)
with open(output_path, "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n✅ 결과 저장됨: {output_path}")
