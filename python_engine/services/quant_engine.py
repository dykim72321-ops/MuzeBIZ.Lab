"""
quant_engine.py — Quantitative Signal & Scoring Engine

main.py에서 분리된 퀀트 핵심 로직:
  - calculate_advanced_signals(): RSI + MACD + ADX + RVOL 기반 DNA 신호 엔진
  - calculate_dna_score(): 단일 시점의 DNA 점수 계산 (스칼라 버전)
  - calculate_dynamic_kelly(): 동적 Kelly Criterion 비중 산출 (KellySizer 위임)
  - calculate_position_sizing(): ATR + Kelly 결합 포지션 사이징
  - generate_ai_investment_report(): 결정론적 AI 투자 리포트 생성

다른 모듈에서의 import 예시:
  from services.quant_engine import calculate_advanced_signals, calculate_dna_score
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import ta
from numba import njit


# ── 확장도(과열) 판정 임계값 ───────────────────────────────────────────────────
# quant_scanner.py(스캔 단계 watchlist 라벨링)도 반드시 이 상수를 그대로 import해 써야
# 한다 — 실시간 진입 필터(여기)와 스캔 라벨링이 서로 다른 기준을 쓰면 watchlist 등록
# 시점엔 "정상"으로 표시된 종목이 실제 진입 시점엔 과열로 걸러지는 정합성 문제가 생긴다.
# 페니 종목은 변동성·되돌림 폭이 커서 동일 %라도 반전 리스크가 크므로 일반 종목보다
# 타이트하게 적용한다(2026-07-20, "고점 매수" 승률 저하 개선).
EXTENSION_DAY_OPEN_PCT_NORMAL = 1.30
EXTENSION_DAY_OPEN_PCT_PENNY = 1.15
EXTENSION_PREV_CLOSE_PCT_NORMAL = 1.25
EXTENSION_PREV_CLOSE_PCT_PENNY = 1.15
EXTENSION_MA20_PCT_NORMAL = 1.30
EXTENSION_MA20_PCT_PENNY = 1.20

# ── 직전 N봉 급등 폭(Spike Guard) 판정 상수 ───────────────────────────────────
# "돌파 확인 봉 자체"를 바로 사는 대신, 최근 lookback 구간 저점 대비 얼마나 수직으로
# 튀었는지를 별도로 산출해 paper_engine.py의 신규 진입 게이트가 차단 기준으로 쓴다.
# Is_Extended(당일/이평선 대비 과열)와 달리 짧은 창(5봉=5분)에서의 "속도"를 보므로
# 상호 보완적이다. 페니는 원래 변동성이 커서 상한을 완화한다(paper_engine.py의
# VOLATILITY_MAX_RATIO/PENNY_VOLATILITY_MAX_RATIO와 동일한 완화 비율 관례를 따름).
SPIKE_GUARD_LOOKBACK = 5
SPIKE_GUARD_PCT_NORMAL = 0.05
SPIKE_GUARD_PCT_PENNY = 0.08


# ── DNA Signal Engine (DataFrame 버전) ────────────────────────────────────────


@njit(fastmath=True)
def safe_rolling_percentile_numba(arr, window_size):
    """
    C-Type 레벨에서 분모 0 및 윈도우 부족 예외를 완벽 차단한 비모수 백분위수 연산 엔진
    """
    n = len(arr)
    result = np.full(n, np.nan)

    if window_size <= 1 or n < window_size:
        return result

    denom = float(window_size - 1)
    for i in range(window_size - 1, n):
        window = arr[i - window_size + 1 : i + 1]
        current_val = arr[i]

        if np.max(window) == np.min(window):
            result[i] = 0.5
            continue

        less_count = 0
        for j in range(window_size):
            if window[j] < current_val:
                less_count += 1
        result[i] = float(less_count) / denom
    return result


def calculate_advanced_signals(
    df: pd.DataFrame,
    avg_daily_volume: float = 0.0,
    penny_extension_tight: bool = True,
) -> pd.DataFrame:
    """
    RSI와 MACD를 결합한 고도화된 신호 엔진.
    avg_daily_volume: 30일 일봉 평균 거래량 (주입 시 분봉 RVOL 정확도 향상)
    penny_extension_tight: False면 페니 종목의 Is_Extended 임계값을 일반 종목과 동일한
        완화된 값(EXTENSION_*_NORMAL)으로 되돌린다 — 개선 검증 트래커가 REGRESSED 연속
        판정 시 PaperTradingManager.extension_guard_penny_tight_enabled를 끄면 이 인자로
        전파되어 즉시 반영된다 (routers/checklist.py _apply_rollback_action 참고).
    """
    if len(df) < 26:
        df = df.copy()
        df["RSI"] = 50.0
        df["MACD_Line"] = 0.0
        df["MACD_Signal"] = 0.0
        df["MACD_Diff"] = 0.0
        df["ADX"] = 0.0
        df["+DI"] = 0.0
        df["-DI"] = 0.0
        df["RVOL"] = 1.0
        df["Is_Extended"] = False
        df["Recent_Spike_Pct"] = 0.0
        df["DNA_Score"] = 50.0
        df["Strong_Buy"] = False
        df["Strong_Sell"] = False
        return df

    df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

    macd_indicator = ta.trend.MACD(
        df["Close"], window_slow=26, window_fast=12, window_sign=9
    )
    df["MACD_Line"] = macd_indicator.macd()
    df["MACD_Signal"] = macd_indicator.macd_signal()
    df["MACD_Diff"] = macd_indicator.macd_diff()

    adx_indicator = ta.trend.ADXIndicator(
        high=df["High"], low=df["Low"], close=df["Close"], window=14
    )
    df["ADX"] = adx_indicator.adx()
    df["+DI"] = adx_indicator.adx_pos()
    df["-DI"] = adx_indicator.adx_neg()

    if avg_daily_volume > 0:
        avg_min_volume = avg_daily_volume / 390
        df["RVOL"] = df["Volume"] / (avg_min_volume + 1e-9)
    else:
        df["RVOL"] = 1.0

    if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
        _dates = df.index.tz_convert("America/New_York").date
    elif isinstance(df.index, pd.DatetimeIndex):
        _dates = df.index.date
    else:
        _dates = pd.to_datetime(df.index).date
    day_open = df.groupby(_dates)["Open"].transform("first")

    # paper_engine.PENNY_MAX_PRICE / quant_scanner.is_penny_item과 정합된 단일 경계값($1)
    is_penny_df = df["Close"] <= 1.0

    ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
    # penny_extension_tight=False(자동 롤백)면 페니도 일반 종목과 같은 완화된
    # 임계값을 쓰도록 되돌린다 — is_penny_df 자체는 여전히 참이어도 상수 선택만 바뀐다.
    penny_day_open_pct = (
        EXTENSION_DAY_OPEN_PCT_PENNY
        if penny_extension_tight
        else EXTENSION_DAY_OPEN_PCT_NORMAL
    )
    penny_prev_close_pct = (
        EXTENSION_PREV_CLOSE_PCT_PENNY
        if penny_extension_tight
        else EXTENSION_PREV_CLOSE_PCT_NORMAL
    )
    penny_ma20_pct = (
        EXTENSION_MA20_PCT_PENNY if penny_extension_tight else EXTENSION_MA20_PCT_NORMAL
    )
    day_open_pct = np.where(
        is_penny_df, penny_day_open_pct, EXTENSION_DAY_OPEN_PCT_NORMAL
    )
    prev_close_pct = np.where(
        is_penny_df, penny_prev_close_pct, EXTENSION_PREV_CLOSE_PCT_NORMAL
    )
    ma20_pct = np.where(is_penny_df, penny_ma20_pct, EXTENSION_MA20_PCT_NORMAL)
    df["Is_Extended"] = (
        (df["Close"] > day_open * day_open_pct)
        | (df["Close"] > df["Close"].shift(1) * prev_close_pct)
        | (df["Close"] > ma20 * ma20_pct)
    )

    # ── Kaufman Efficiency Ratio (ER) ──────────────────────────────────────────
    er_lookback = 10
    change = df["Close"].diff(er_lookback).abs()
    volatility = df["Close"].diff(1).abs().rolling(window=er_lookback).sum()
    df["ER"] = change / (volatility + 1e-8)
    df["smoothed_er"] = df["ER"].ewm(span=15, adjust=False).mean()

    # ── Spike Guard: 직전 N봉(분) 저점 대비 급등 폭 ─────────────────────────────
    recent_low_n = df["Low"].rolling(window=SPIKE_GUARD_LOOKBACK, min_periods=1).min()
    df["Recent_Spike_Pct"] = (
        (df["Close"] - recent_low_n) / recent_low_n.replace(0, np.nan)
    ).fillna(0.0)

    score = pd.Series(50.0, index=df.index)
    # is_penny_df는 위 Is_Extended 계산부에서 이미 산출됨 (단일 정의로 통합)

    # 일반 주식: 과매도(Mean-Reversion) 전략
    normal_rsi = np.where(
        df["RSI"].isna(),
        0,
        np.where(
            df["RSI"] < 30,
            20,
            np.where(
                df["RSI"] < 45,
                20 - (df["RSI"] - 30) / 15 * 5,
                np.where(
                    df["RSI"] < 55,
                    15 * (55 - df["RSI"]) / 10,
                    np.where(
                        df["RSI"] < 65,
                        np.where(df["RVOL"] >= 3.0, 0, -((df["RSI"] - 55) / 10 * 10)),
                        np.where(
                            df["RSI"] < 75,
                            np.where(
                                df["RVOL"] >= 3.0, 0, -(10 + (df["RSI"] - 65) / 10 * 10)
                            ),
                            np.where(
                                df["RVOL"] >= 5.0,
                                -5,
                                np.where(df["RVOL"] >= 3.0, -10, -20),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )

    # 페니 주식: 수급 돌파(Momentum) 전략
    penny_rsi = np.where(
        df["RSI"].isna(),
        0,
        np.where(
            df["RSI"] < 45,
            -20,  # 떨어지는 칼날 방지
            np.where(
                df["RSI"] < 60,
                -10,
                np.where(
                    df["RSI"] < 85,
                    np.where(df["RVOL"] >= 3.0, 20, 5),  # 수급 동반 돌파 가점
                    np.where(df["RVOL"] >= 3.0, 10, -10),
                ),
            ),
        ),  # 초과매수 구간
    )

    score += np.where(is_penny_df, penny_rsi, normal_rsi)

    macd_diff = df["MACD_Diff"]
    macd_diff_prev = df["MACD_Diff"].shift(1).bfill()
    is_golden = (macd_diff > 0) & (macd_diff_prev <= 0)
    is_dead = (macd_diff < 0) & (macd_diff_prev >= 0)
    score += np.where(
        macd_diff.isna(),
        0,
        np.where(
            is_golden,
            20,
            np.where(
                is_dead,
                -20,
                np.where(
                    macd_diff > macd_diff_prev,
                    5,
                    np.where(macd_diff == macd_diff_prev, 0, -8),
                ),
            ),
        ),
    )

    adx_is_bearish = df["-DI"] > df["+DI"]
    adx_is_bullish = df["+DI"] > df["-DI"]
    score += np.where(
        adx_is_bearish & (df["ADX"] > 25),
        -10,
        np.where(
            adx_is_bullish & (df["ADX"] > 25),
            10,
            np.where(adx_is_bullish & (df["ADX"] > 20), 5, 0),
        ),
    )

    score += np.where(
        df["RVOL"] > 5.0,
        15,
        np.where(
            df["RVOL"] > 3.0,
            10,
            np.where(df["RVOL"] > 2.0, 5, np.where(df["RVOL"] < 1.0, -5, 0)),
        ),
    )

    score -= np.where(
        df["Is_Extended"],
        np.where(df["RVOL"] >= 5.0, 12, 25),
        0,
    )

    df["DNA_Score"] = score.clip(0.0, 100.0).round(1)

    # RSI 과매수 상한 게이트: 다른 항목(MACD/ADX/RVOL) 보상으로 DNA가 높아도
    # 이미 소진된 급등(RSI≥70)은 진입 직후 되돌림에 걸려 Trailing Stop을 유발하므로 차단
    is_not_overbought = df["RSI"] < 70.0

    lookback = 60
    # Numba 주입을 위한 NumPy 고속 차원 정렬
    rsi_array = df["RSI"].to_numpy()
    rvol_array = df["RVOL"].to_numpy()

    # 랭킹 데이터 생성 및 매핑
    df["rsi_rank"] = safe_rolling_percentile_numba(rsi_array, lookback)
    df["rvol_rank"] = safe_rolling_percentile_numba(rvol_array, lookback)

    # 불안정한 Z-Score 대신 통계적 백분위수 랭크를 조건문에 직접 대입
    # tier1/tier2/tier_penny와 동일한 안전장치(과매수 상한·급등 제외·추세강도)를
    # 반드시 함께 요구한다 — 그렇지 않으면 lookback 윈도우 전체가 과매수 상태였던
    # 종목도 "상대적으로 낮은 5% 구간"이라는 이유만으로 매수 신호가 발생한다.
    numba_strong_buy = (
        (df["rsi_rank"] <= 0.05)  # 과거 lookback 기간 중 하위 5% 극단적 과매도
        & (df["rvol_rank"] >= 0.95)  # 과거 lookback 기간 중 상위 5% 거래량 폭증
        & (df["MACD_Line"] > df["MACD_Signal"])  # 골든크로스 조건 유지
        & is_not_overbought  # RSI 절대값 과매수 상한 게이트 (동일 적용)
        & (~df["Is_Extended"])  # 당일 급등(펌프) 종목 제외 (동일 적용)
        & (df["ADX"] > 20)  # 추세 강도 최소 기준 (동일 적용)
    )

    is_penny = df["Close"] <= 1.0
    tier1 = (~is_penny) & (df["DNA_Score"] >= 80.0) & (df["RVOL"] > 1.0)
    tier2 = (~is_penny) & (df["DNA_Score"] >= 75.0) & (df["RVOL"] > 1.5)
    # 페니주의 경우 DNA 게이트를 80으로 대폭 상향하여 어설픈 신호 차단
    # (paper_engine.py dna_gate(penny)=80, quant_scanner.py 스캔 라벨/워치리스트 컷도 동일하게 정합)
    tier_penny = is_penny & (df["DNA_Score"] >= 80.0)

    # 기존 전략(DNA)과 새로운 Numba 과매도 포착 전략을 병합 (Or 조건)
    df["Strong_Buy"] = (
        (tier1 | tier2 | tier_penny) & is_not_overbought
    ) | numba_strong_buy.fillna(False)
    df["Strong_Sell"] = df["DNA_Score"] <= 40.0

    return df


# ── DNA Score (Scalar 버전) ───────────────────────────────────────────────────


def calculate_dna_score(
    rsi: float,
    macd_diff: float,
    macd_diff_prev: float,
    adx: float,
    di_plus: float,
    di_minus: float,
    rvol: float,
    is_extended: bool,
    price: float = 10.0,
    return_deltas: bool = False,
):
    """RSI·MACD·ADX·RVOL을 합성한 0~100 DNA 점수."""
    score = 50.0
    d_rsi = d_macd = d_adx = d_rvol = d_ext = 0.0
    is_penny = price <= 1.0

    if pd.isna(rsi):
        d_rsi = 0.0
    else:
        if is_penny:
            # 페니주: 돌파 모멘텀 로직
            if rsi < 45:
                d_rsi = -20
            elif rsi < 60:
                d_rsi = -10
            elif rsi < 85:
                d_rsi = 20 if rvol >= 3.0 else 5
            else:
                d_rsi = 10 if rvol >= 3.0 else -10
        else:
            # 일반주: 과매도 반등 로직
            if rsi < 30:
                d_rsi = 20
            elif rsi < 45:
                d_rsi = 20 - (rsi - 30) / 15 * 5
            elif rsi < 55:
                d_rsi = 15 * (55 - rsi) / 10
            elif rsi < 65:
                d_rsi = 0 if rvol >= 3.0 else -((rsi - 55) / 10 * 10)
            elif rsi < 75:
                d_rsi = 0 if rvol >= 3.0 else -(10 + (rsi - 65) / 10 * 10)
            else:
                d_rsi = -5 if rvol >= 5.0 else (-10 if rvol >= 3.0 else -20)
    score += d_rsi

    if pd.isna(macd_diff) or pd.isna(macd_diff_prev):
        d_macd = 0.0
    elif macd_diff > 0 and macd_diff_prev <= 0:
        d_macd = 20
    elif macd_diff < 0 and macd_diff_prev >= 0:
        d_macd = -20
    elif macd_diff > macd_diff_prev:
        d_macd = 5
    elif macd_diff == macd_diff_prev:
        d_macd = 0
    else:
        d_macd = -8
    score += d_macd

    adx_is_bearish = di_minus > di_plus
    adx_is_bullish = di_plus > di_minus
    if adx_is_bearish and adx > 25:
        d_adx = -10
    elif adx_is_bullish and adx > 25:
        d_adx = 10
    elif adx_is_bullish and adx > 20:
        d_adx = 5
    score += d_adx

    if rvol > 5.0:
        d_rvol = 15
    elif rvol > 3.0:
        d_rvol = 10
    elif rvol > 2.0:
        d_rvol = 5
    elif rvol < 1.0:
        d_rvol = -5
    score += d_rvol

    if is_extended:
        d_ext = -12 if rvol >= 5.0 else -25
    score += d_ext

    final_score = round(max(0.0, min(100.0, score)), 1)
    if return_deltas:
        return final_score, {
            "rsi": round(d_rsi, 1),
            "macd": d_macd,
            "adx": d_adx,
            "rvol": d_rvol,
            "ext": d_ext,
        }
    return final_score


# ── Dynamic Kelly Criterion ──────────────────────────────────────────────────


def calculate_dynamic_kelly(
    recent_trades: list,
    max_weight: float = 0.20,
    half_kelly: bool = True,
    min_trades: int = 10,
):
    """
    하위 호환 래퍼 — 내부적으로 KellySizer를 사용.

    반환: (kelly_weight, win_rate, payoff_ratio)
    """
    from services.kelly_sizer import KellySizer

    sizer = KellySizer(
        half_kelly=half_kelly,
        max_weight=max_weight,
        min_trades=min_trades,
    )
    return sizer.compute(recent_trades)


# ── Position Sizing Engine ────────────────────────────────────────────────────


def calculate_position_sizing(
    df: pd.DataFrame,
    win_rate: float = 0.55,
    profit_ratio: float = 2.0,
    target_vol: float = 0.15,
    kelly_fraction: float = 0.25,
    dynamic_kelly_weight: float = None,
    bars_per_day: int = 1,
):
    """1단계(ATR 기반 변동성 조절)와 3단계(동적 켈리 공식)를 결합한 포지션 사이징 엔진

    Parameters
    ----------
    bars_per_day : int
        데이터의 시간프레임에 따른 하루당 바 수.
        - 일봉: 1 (기본값, 백테스터 호환)
        - 1분봉: 390 (미국 정규장 6.5시간 × 60분)
        연율화 공식: ann_vol = atr_pct × √(252 × bars_per_day)
    """
    if len(df) < 15:
        rvol = df["RVOL"].iloc[-1] if "RVOL" in df.columns and len(df) > 0 else 1.0
        return {
            "annualized_volatility": 0.0,
            "vol_weight": 0.0,
            "kelly_f": 0.0,
            "atr": 0.0,
            "recommended_weight": 0.0,
            "rvol": round(float(rvol), 2),
            "is_safe_to_trade": False,
        }

    atr_indicator = ta.volatility.AverageTrueRange(
        high=df["High"], low=df["Low"], close=df["Close"], window=14
    )
    atr = atr_indicator.average_true_range().iloc[-1]
    current_price = df["Close"].iloc[-1]

    atr_pct = atr / current_price if current_price > 0 else 1e-9
    ann_vol = atr_pct * np.sqrt(252 * bars_per_day)

    # 스케일 보정: 1분봉 ATR을 연환산하면 페널티가 과도해져 비중이 0에 수렴하는 현상 방지
    # 변동성이 극심하더라도 최소 5% 비중은 보장 (파편화 소액 거래 방지)
    raw_vol_weight = target_vol / (ann_vol + 1e-9)
    vol_weight = max(0.05, raw_vol_weight)

    if dynamic_kelly_weight is not None:
        optimal_kelly = dynamic_kelly_weight
        kelly_f = dynamic_kelly_weight
    else:
        p = win_rate
        q = 1 - p
        b = profit_ratio
        kelly_f = (b * p - q) / b if b > 0 else 0
        optimal_kelly = max(0, kelly_f) * kelly_fraction

    if kelly_f <= 0:
        final_weight = 0.0
    else:
        # 보수적 결합: 두 리스크 모델(변동성·켈리) 중 작은 값을 채택
        # 기존 산술평균은 서로 다른 차원의 비중을 의미 없이 평균해 이론적 근거가 없었음
        final_weight = min(vol_weight, optimal_kelly, 1.0)

    rvol = df["RVOL"].iloc[-1] if "RVOL" in df.columns else 1.0

    return {
        "annualized_volatility": round(float(ann_vol), 4),
        "vol_weight": round(float(vol_weight), 4),
        "kelly_f": round(float(kelly_f), 4),
        "atr": round(float(atr), 6),
        "recommended_weight": round(float(final_weight) * 100, 2),
        "rvol": round(float(rvol), 2),
        "is_safe_to_trade": final_weight > 0,
    }


# ── AI Investment Report ─────────────────────────────────────────────────────


def generate_ai_investment_report(data: dict) -> str:
    """규칙 기반(Deterministic) 동적 리포트 생성 엔진."""
    rsi = data.get("rsi", 50.0)
    signal = data.get("signal", "HOLD")
    vol = data.get("volatility_ann", 0.0)
    rec_weight = data.get("recommended_weight", 0.0)
    rvol = data.get("rvol", 1.0)
    adx = data.get("adx", 0.0)

    report = []

    if signal == "BUY":
        rvol_note = " (보통)" if rvol < 3.0 else f" (🔥 거래량 폭증: {rvol}x)"
        report.append(
            f"📈 [Micro-Cap 하이브리드 BUY] RSI {rsi} & MACD 골든크로스 확인."
        )
        report.append(f"   - 추세 강도(ADX): {adx} (안정)")
        report.append(f"   - 상대 거래량(RVOL): {rvol}{rvol_note}")
        if data.get("is_extended"):
            report.append("   - ⚠️ 주의: 당일 급등으로 인한 추격 매수 위험 관찰됨.")
    elif signal == "SELL":
        report.append(f"📉 [매도/위험] RSI {rsi} 과열 및 모멘텀 이탈.")
    else:
        report.append(f"⚖️ [관망] 뚜렷한 추세 신호 없음 (ADX: {adx}, RVOL: {rvol}).")

    report.append(
        f"최종 변동성은 {vol}%이며, 비대칭 트레일링 스탑(Asymmetric Stop)을 적용한 권장 비중은 {rec_weight}%입니다."
    )
    report.append("※ 본 데이터는 Micro-Cap 전용 하이브리드 엔진 분석 결과입니다.")

    return "\n".join(report)
