"""
test_dna_sync.py — DataFrame 버전과 Scalar 버전의 DNA Score 동기화 검증

다양한 시장 시나리오(과매도/과매수/골든크로스/데드크로스/고RVOL 등)에서
calculate_advanced_signals()의 DNA_Score 열과
calculate_dna_score() 스칼라 함수의 출력이 ±0.1 이내로 일치하는지 확인한다.

실행: python test_dna_sync.py
"""

from __future__ import annotations

import sys
import numpy as np
import pandas as pd

sys.path.insert(0, ".")
from services.quant_engine import (
    calculate_advanced_signals,
    calculate_dna_score,
    calculate_position_sizing,
)


def _make_df(
    n: int = 60,
    base_price: float = 10.0,
    trend: float = 0.001,
    vol: float = 0.02,
    base_volume: float = 100000,
    volume_spike_idx: int = -1,
    seed: int = 42,
) -> pd.DataFrame:
    """테스트용 합성 OHLCV 데이터프레임 생성"""
    rng = np.random.RandomState(seed)
    dates = pd.date_range("2024-01-01", periods=n, freq="min", tz="America/New_York")
    closes = [base_price]
    for i in range(1, n):
        ret = trend + vol * rng.randn()
        closes.append(closes[-1] * (1 + ret))
    closes = np.array(closes)
    highs = closes * (1 + rng.uniform(0.001, 0.01, n))
    lows = closes * (1 - rng.uniform(0.001, 0.01, n))
    opens = (highs + lows) / 2
    volumes = rng.uniform(0.8, 1.2, n) * base_volume
    if volume_spike_idx >= 0:
        volumes[volume_spike_idx] = base_volume * 6  # RVOL 극단 스파이크

    df = pd.DataFrame(
        {"Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": volumes},
        index=dates,
    )
    return df


def test_dna_score_sync():
    """DataFrame DNA_Score vs Scalar calculate_dna_score() 동기화 검증"""
    scenarios = [
        {"name": "기본 횡보", "trend": 0.0, "vol": 0.01, "seed": 1},
        {"name": "강한 상승", "trend": 0.005, "vol": 0.01, "seed": 2},
        {"name": "강한 하락", "trend": -0.005, "vol": 0.01, "seed": 3},
        {"name": "높은 변동성", "trend": 0.0, "vol": 0.05, "seed": 4},
        {
            "name": "거래량 폭증",
            "trend": 0.002,
            "vol": 0.02,
            "seed": 5,
            "volume_spike_idx": -1,
        },
        {
            "name": "저가 페니",
            "trend": 0.001,
            "vol": 0.03,
            "seed": 6,
            "base_price": 0.5,
        },
        {
            "name": "고가 종목",
            "trend": 0.001,
            "vol": 0.01,
            "seed": 7,
            "base_price": 150.0,
        },
        {"name": "급등 후 하락", "trend": -0.003, "vol": 0.04, "seed": 8},
        {"name": "안정 상승", "trend": 0.002, "vol": 0.005, "seed": 9},
        {"name": "변동 없음", "trend": 0.0, "vol": 0.001, "seed": 10},
    ]

    passed = 0
    failed = 0

    for sc in scenarios:
        df = _make_df(
            n=60,
            base_price=sc.get("base_price", 10.0),
            trend=sc["trend"],
            vol=sc["vol"],
            seed=sc["seed"],
            volume_spike_idx=sc.get("volume_spike_idx", -1),
        )

        # DataFrame 버전
        df_out = calculate_advanced_signals(df.copy())
        df_score = float(df_out["DNA_Score"].iloc[-1])

        # Scalar 버전 — DataFrame 결과에서 동일 입력 추출
        latest = df_out.iloc[-1]
        prev = df_out.iloc[-2] if len(df_out) >= 2 else df_out.iloc[-1]

        scalar_score = calculate_dna_score(
            rsi=float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0,
            macd_diff=(
                float(latest["MACD_Diff"]) if not pd.isna(latest["MACD_Diff"]) else 0.0
            ),
            macd_diff_prev=(
                float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
            ),
            adx=float(latest["ADX"]) if not pd.isna(latest["ADX"]) else 0.0,
            di_plus=float(latest["+DI"]) if not pd.isna(latest["+DI"]) else 0.0,
            di_minus=float(latest["-DI"]) if not pd.isna(latest["-DI"]) else 0.0,
            rvol=float(latest["RVOL"]) if not pd.isna(latest["RVOL"]) else 1.0,
            is_extended=bool(latest["Is_Extended"]),
            price=float(latest["Close"]),
        )

        diff = abs(df_score - scalar_score)
        status = "✅" if diff <= 0.1 else "❌"
        if diff <= 0.1:
            passed += 1
        else:
            failed += 1

        print(
            f"  {status} {sc['name']:12s} | DF={df_score:6.1f} | Scalar={scalar_score:6.1f} | Δ={diff:.2f}"
        )

    print(f"\n{'=' * 50}")
    print(f"  결과: {passed} passed, {failed} failed (total {passed + failed})")
    print(f"{'=' * 50}")
    return failed == 0


def test_position_sizing_timeframe():
    """ATR 연율화가 bars_per_day 파라미터에 따라 올바르게 변하는지 검증"""
    df = _make_df(n=60, base_price=10.0, trend=0.001, vol=0.02, seed=42)
    df_signals = calculate_advanced_signals(df.copy())

    # 일봉 기준 (bars_per_day=1)
    sizing_daily = calculate_position_sizing(df_signals, bars_per_day=1)
    # 1분봉 기준 (bars_per_day=390)
    sizing_minute = calculate_position_sizing(df_signals, bars_per_day=390)

    ratio = sizing_minute["annualized_volatility"] / (
        sizing_daily["annualized_volatility"] + 1e-9
    )
    expected_ratio = np.sqrt(390)  # ≈ 19.75

    print(f"\n  ATR 연율화 시간프레임 검증:")
    print(f"    일봉 ann_vol: {sizing_daily['annualized_volatility']:.4f}")
    print(f"    1분봉 ann_vol: {sizing_minute['annualized_volatility']:.4f}")
    print(f"    비율: {ratio:.2f} (기대값: {expected_ratio:.2f})")

    # 비율이 √390 ± 10% 이내인지 확인
    tolerance = 0.10
    passed = abs(ratio - expected_ratio) / expected_ratio < tolerance

    if passed:
        print(
            f"  ✅ ATR 스케일링 정상 (오차 {abs(ratio - expected_ratio) / expected_ratio * 100:.1f}%)"
        )
    else:
        print(
            f"  ❌ ATR 스케일링 오류 (오차 {abs(ratio - expected_ratio) / expected_ratio * 100:.1f}%)"
        )

    # vol_weight가 1분봉에서 더 작아야 함 (변동성이 높으니까)
    print(f"    일봉 vol_weight: {sizing_daily['vol_weight']:.4f}")
    print(f"    1분봉 vol_weight: {sizing_minute['vol_weight']:.4f}")

    if sizing_minute["vol_weight"] < sizing_daily["vol_weight"]:
        print(f"  ✅ 1분봉 vol_weight가 일봉보다 작음 (정상)")
    else:
        print(f"  ❌ 1분봉 vol_weight가 일봉보다 크거나 같음 (비정상)")
        passed = False

    return passed


def test_kelly_sizer_consistency():
    """KellySizer 통합 모듈 기본 동작 검증"""
    from services.kelly_sizer import KellySizer

    sizer = KellySizer(half_kelly=True, max_weight=0.15, min_weight=0.02, min_trades=3)

    # 1. EV <= 0 이면 0.0을 반환 (완벽한 회로차단기)
    trades_losing = [
        {"ticker": "AAPL", "entry_price": 10.0, "pnl_pct": 2.0, "profit_amt": 20.0},
        {"ticker": "MSFT", "entry_price": 20.0, "pnl_pct": -8.0, "profit_amt": -80.0},
        {"ticker": "TSLA", "entry_price": 15.0, "pnl_pct": -5.0, "profit_amt": -50.0},
    ]
    w_loss, p_loss, b_loss = sizer.compute(trades_losing)
    assert w_loss == 0.0, f"손실 전략이면 0.0 반환해야 하지만 {w_loss} 반환"
    print("  ✅ 기댓값 가드(EV≤0) → 0.0 차단 정상")

    # 1.5 거래 수가 0건일 때 None 반환
    w_empty, _, _ = sizer.compute([])
    assert w_empty is None, f"0건 거래 시 None이어야 하지만 {w_empty} 반환"
    print("  ✅ 거래 0건 → None 반환 정상")

    # 2. 충분한 거래 시 유효 비중 반환
    trades_enough = []
    for i in range(12):
        if i % 3 == 0:
            trades_enough.append(
                {
                    "ticker": f"T{i}",
                    "entry_price": 10.0,
                    "pnl_pct": -5.0,
                    "profit_amt": -50.0,
                }
            )
        else:
            trades_enough.append(
                {
                    "ticker": f"T{i}",
                    "entry_price": 10.0,
                    "pnl_pct": 8.0,
                    "profit_amt": 80.0,
                }
            )

    w, p, b = sizer.compute(trades_enough)
    assert w is not None, "충분한 거래 시 None이면 안 됨"
    assert 0.02 <= w <= 0.15, f"비중 {w}이 [0.02, 0.15] 범위 밖"
    print(f"  ✅ 충분한 거래 → kelly_weight={w:.4f}, win_rate={p:.2f}, payoff={b:.2f}")

    # 3. ATR 페널티 적용 검증
    w_no_penalty, _, _ = sizer.compute(
        trades_enough, current_atr=0.0, current_price=10.0
    )
    w_with_penalty, _, _ = sizer.compute(
        trades_enough, current_atr=0.5, current_price=10.0
    )
    assert w_with_penalty <= w_no_penalty, "ATR 페널티 적용 시 비중이 더 커선 안 됨"
    print(f"  ✅ ATR 페널티: {w_no_penalty:.4f} → {w_with_penalty:.4f} (감소 정상)")

    # 4. max_weight 캡 검증
    sizer_capped = KellySizer(half_kelly=False, max_weight=0.05, min_weight=0.02)
    w_capped, _, _ = sizer_capped.compute(trades_enough)
    assert w_capped <= 0.05, f"max_weight=0.05인데 {w_capped} 반환"
    print(f"  ✅ max_weight 캡: {w_capped:.4f} ≤ 0.05")

    return True


if __name__ == "__main__":
    print("=" * 50)
    print("  🧬 DNA Score 동기화 & 수학 공식 검증 테스트")
    print("=" * 50)

    print("\n[1/3] DNA Score DataFrame vs Scalar 동기화:")
    sync_ok = test_dna_score_sync()

    print("\n[2/3] ATR 연율화 시간프레임 검증:")
    atr_ok = test_position_sizing_timeframe()

    print("\n[3/3] KellySizer 통합 모듈 검증:")
    kelly_ok = test_kelly_sizer_consistency()

    print("\n" + "=" * 50)
    all_ok = sync_ok and atr_ok and kelly_ok
    if all_ok:
        print("  ✅ 모든 검증 통과!")
    else:
        print("  ❌ 일부 검증 실패 — 위 로그 확인")
        sys.exit(1)
    print("=" * 50)
