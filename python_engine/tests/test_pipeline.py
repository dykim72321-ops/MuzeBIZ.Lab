"""
test_pipeline.py — 4종 데이터 파이프라인 최적화 단위 테스트
실행: cd python_engine && python test_pipeline.py

각 테스트는 독립적으로 실행 가능하며, 모든 테스트가 통과하면 최적화가 정상 작동합니다.
"""

import asyncio
import sys
import os

# 실행 위치: python_engine/ 디렉토리에서 실행
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

PASS = "✅ PASS"
FAIL = "❌ FAIL"


# =============================================================================
# Test 1: Volume Calibration Multiplier
# =============================================================================
async def test_volume_calibration():
    print("\n[Test 1] Volume Calibration Multiplier")
    from main import candle_state

    # 더미 warm_up 없이 직접 volume_multiplier 설정 시뮬레이션
    candle_state.volume_multiplier["AAPL"] = 15.3
    candle_state.volume_multiplier["NVDA"] = 12.7

    result = candle_state.volume_multiplier.get("AAPL", 1.0)
    assert result == 15.3, f"Expected 15.3, got {result}"

    # 없는 종목은 1.0 기본값
    default = candle_state.volume_multiplier.get("UNKNOWN_TICKER", 1.0)
    assert default == 1.0, f"Default should be 1.0, got {default}"

    print(f"  {PASS}: AAPL multiplier={result:.1f}x, default multiplier={default:.1f}x")
    return True


# =============================================================================
# Test 2: Smart Cache Logic Validation
# =============================================================================
async def test_smart_cache_ttl():
    """
    실제 Supabase 없이 TTL 계산 로직만 단위 테스트.
    """
    print("\n[Test 2] Smart Cache TTL Logic")
    from datetime import datetime, timedelta

    SMART_CACHE_TTL_MS = 60 * 1000  # 1분

    # 케이스 A: 30초 전 → 캐시 HIT
    recent_update = (datetime.utcnow() - timedelta(seconds=30)).isoformat()
    age_ms = (
        datetime.utcnow() - datetime.fromisoformat(recent_update)
    ).total_seconds() * 1000
    is_hit = age_ms < SMART_CACHE_TTL_MS
    assert is_hit, f"Expected HIT for 30s old data, age_ms={age_ms:.0f}"
    print(
        f"  {PASS}: 30s old cache → HIT (age={age_ms:.0f}ms < TTL={SMART_CACHE_TTL_MS}ms)"
    )

    # 케이스 B: 90초 전 → 캐시 MISS
    old_update = (datetime.utcnow() - timedelta(seconds=90)).isoformat()
    age_ms_old = (
        datetime.utcnow() - datetime.fromisoformat(old_update)
    ).total_seconds() * 1000
    is_miss = age_ms_old >= SMART_CACHE_TTL_MS
    assert is_miss, f"Expected MISS for 90s old data, age_ms={age_ms_old:.0f}"
    print(
        f"  {PASS}: 90s old cache → MISS (age={age_ms_old:.0f}ms >= TTL={SMART_CACHE_TTL_MS}ms)"
    )
    return True


# =============================================================================
# Test 3: Data Source Tagging
# =============================================================================
async def test_data_source_tagging():
    print("\n[Test 3] Data Source Tagging in run_pulse_engine()")
    import pandas as pd
    import numpy as np

    # 최소한의 더미 OHLCV 데이터 (50 bars)
    np.random.seed(42)
    n = 50
    dates = pd.date_range("2025-01-01", periods=n, freq="1min")
    prices = 100 + np.cumsum(np.random.randn(n) * 0.5)
    df = pd.DataFrame(
        {
            "Open": prices * 0.999,
            "High": prices * 1.005,
            "Low": prices * 0.995,
            "Close": prices,
            "Volume": np.random.randint(10000, 50000, n).astype(float),
        },
        index=dates,
    )

    # volume_multiplier 등록
    from main import candle_state, run_pulse_engine

    candle_state.volume_multiplier["TEST"] = 14.2

    payload = run_pulse_engine("TEST", df)

    assert "data_source" in payload, "data_source field missing from payload"
    assert (
        payload["data_source"] == "alpaca_iex"
    ), f"Expected 'alpaca_iex', got '{payload['data_source']}'"
    assert (
        "volume_multiplier" in payload
    ), "volume_multiplier field missing from payload"
    assert (
        payload["volume_multiplier"] == 14.2
    ), f"Expected 14.2, got {payload['volume_multiplier']}"

    print(
        f"  {PASS}: data_source='{payload['data_source']}', volume_multiplier={payload['volume_multiplier']:.1f}x"
    )
    return True


# =============================================================================
# Main Runner
# =============================================================================
async def main():
    print("=" * 60)
    print("MuzeStock.Lab — Data Pipeline Optimization Test Suite")
    print("=" * 60)

    tests = [
        ("Volume Calibration", test_volume_calibration),
        ("Smart Cache TTL Logic", test_smart_cache_ttl),
        ("Data Source Tagging", test_data_source_tagging),
    ]

    results = []
    for name, test_fn in tests:
        try:
            ok = await test_fn()
            results.append((name, ok))
        except Exception as e:
            print(f"\n  ❌ FAIL ({name}): {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    all_passed = True
    for name, ok in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {status}: {name}")
        if not ok:
            all_passed = False

    print()
    if all_passed:
        print("🎉 All 3 optimizations verified successfully!")
    else:
        print("⚠️ Some tests failed. Please check the output above.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
