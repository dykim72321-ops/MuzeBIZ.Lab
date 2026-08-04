"""
run_long_term_trail_atr_experiment.py — 2026-08-04: ISOU 실사례(당일 변동폭이
장기 보유 모드의 고정 -3% 트레일보다 넓어 정상적인 일중 노이즈에도 조기 청산된
사례) 분석 후 제기된 질문 — "고정 %가 아니라 종목 변동성(ATR)에 맞춰 트레일
폭이 자동으로 늘어나고 줄어들게 하면 어떨까?"를 검증한다.

run_long_term_trail_experiment.py(2026-08-01)가 이미 고정 % 트레일 폭을
-15%~-3%로 스윕해 -3%(PF 1.677)가 최적이라는 결론을 냈고, 그 결과로 라이브
LONG_TERM_TS_TRAIL_PCT가 0.95→0.97로 변경됐다(3c136e7). 이 스크립트는 그
"-3% 고정"을 이기는 대안이 있는지, ATR 기반 적응형 트레일(highest - k*ATR)로
같은 조건에서 비교한다.

주의(run_long_term_trail_experiment.py docstring과 동일 경고): 라이브 계좌
실제 청산 이력에서 PF가 극소수 대박 거래(YYGH, JLHL)에 전적으로 의존하는
구조임이 확인됐다 — 트레일을 조이는 방향의 변경은 손실은 줄이지만 그 희귀한
대박도 일찍 끊어버릴 위험이 있다. 그래서 PF/승률뿐 아니라 "최대 단일거래
수익률"과 "상위 5건 제외 시 PF"도 함께 리포트해 이 리스크를 직접 확인한다.

실행:
  python_engine/.venv/bin/python backtest_harness/run_long_term_trail_atr_experiment.py
"""

import sys
import os
import json

import numpy as np

ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_ROOT)

import engine.paper_engine as _pe


def _zero_slippage(
    price: float, is_buy: bool, is_penny: bool, volume: int = 0
) -> float:
    return round(price, 6)


_pe._apply_slippage = _zero_slippage

print("=" * 78)
print("  🔬 장기 보유 모드 트레일링 스탑 — 고정% vs ATR 적응형 (슬리피지 0%)")
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


def extra_stats(pf) -> dict:
    """PF/승률 뒤에 가려지는 '대박 의존도'를 직접 확인한다."""
    trades = pf.closed_trades
    if not trades:
        return {"max_trade_pct": None, "pf_excl_top5": None, "top5_pct": []}
    pnls = sorted((t["pnl_pct"] * 100 for t in trades), reverse=True)
    top5 = pnls[:5]
    rest = pnls[5:]
    wins_rest = [p for p in rest if p > 0]
    losses_rest = [p for p in rest if p <= 0]
    pf_excl = (
        round(sum(wins_rest) / abs(sum(losses_rest)), 3)
        if losses_rest and sum(losses_rest) != 0
        else None
    )
    return {
        "max_trade_pct": round(pnls[0], 2) if pnls else None,
        "top5_pct": [round(p, 2) for p in top5],
        "pf_excl_top5": pf_excl,
    }


# ── 시나리오: 기존 최적 고정 -3%를 기준선으로, ATR 배수(k) 여러 값과 비교 ────
scenarios = [
    ("D. -5% 고정 (2026-08-03 이전 라이브)", {"long_term_trail_pct": 0.95}),
    ("E. -3% 고정 (현재 라이브 기본값)", {"long_term_trail_pct": 0.97}),
    ("F. ATR k=1.5 (타이트 적응형)", {"long_term_atr_k": 1.5}),
    ("G. ATR k=2.0", {"long_term_atr_k": 2.0}),
    ("H. ATR k=2.5", {"long_term_atr_k": 2.5}),
    ("I. ATR k=3.0 (넓은 적응형)", {"long_term_atr_k": 3.0}),
]

results = {}
extras = {}
for label, kwargs in scenarios:
    print(f"▶ 시뮬레이션: {label}")
    pf = run_variant(new_dfs, "NEW", sizing="NEW", stop="NEW", **kwargs)
    results[label] = compute_metrics(pf)
    extras[label] = extra_stats(pf)

print("\n" + "=" * 165)
header = f"{'지표':<16}" + "".join(f"{label[:30]:>31}" for label, *_ in scenarios)
print(header)
print("=" * 165)
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
        f"{str(results[label].get(key)):>31}" for label, *_ in scenarios
    )
    print(line)
print("-" * 165)
for key in ["max_trade_pct", "pf_excl_top5"]:
    line = f"{key:<16}" + "".join(
        f"{str(extras[label].get(key)):>31}" for label, *_ in scenarios
    )
    print(line)
print("=" * 165)

baseline_label = "E. -3% 고정 (현재 라이브 기본값)"
pf_baseline = results[baseline_label].get("profit_factor")
print(f"\n기준(현재 라이브, -3% 고정) PF = {pf_baseline}")
for label, *_ in scenarios:
    if label == baseline_label:
        continue
    pf_val = results[label].get("profit_factor")
    delta = (
        f"(Δ {pf_val - pf_baseline:+.3f})"
        if pf_val is not None and pf_baseline is not None
        else ""
    )
    print(
        f"  [{label}] PF={pf_val} {delta} | 최대단일거래={extras[label].get('max_trade_pct')}% | 상위5건제외PF={extras[label].get('pf_excl_top5')}"
    )

output_path = os.path.join(
    ENGINE_ROOT,
    "backtest_harness",
    "long_term_trail_atr_experiment_result.json",
)
with open(output_path, "w") as f:
    json.dump({"metrics": results, "extra": extras}, f, ensure_ascii=False, indent=2)
print(f"\n✅ 결과 저장됨: {output_path}")
