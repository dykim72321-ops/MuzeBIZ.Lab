"""
quant_engine.py — Quantitative Signal & Scoring Engine

main.py에서 분리된 퀀트 핵심 로직:
  - calculate_advanced_signals(): RSI + MACD + ADX + RVOL 기반 DNA 신호 엔진
  - calculate_dna_score(): 단일 시점의 DNA 점수 계산 (스칼라 버전)
  - calculate_dynamic_kelly(): 동적 Kelly Criterion 비중 산출
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
    df: pd.DataFrame, avg_daily_volume: float = 0.0
) -> pd.DataFrame:
    """
    RSI와 MACD를 결합한 고도화된 신호 엔진.
    avg_daily_volume: 30일 일봉 평균 거래량 (주입 시 분봉 RVOL 정확도 향상)
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

    ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
    df["Is_Extended"] = (
        (df["Close"] > day_open * 1.25)
        | (df["Close"] > df["Close"].shift(1) * 1.25)
        | (df["Close"] > ma20 * 1.30)
    )

    # ── Kaufman Efficiency Ratio (ER) ──────────────────────────────────────────
    er_lookback = 10
    change = df["Close"].diff(er_lookback).abs()
    volatility = df["Close"].diff(1).abs().rolling(window=er_lookback).sum()
    df["ER"] = change / (volatility + 1e-8)
    df["smoothed_er"] = df["ER"].ewm(span=15, adjust=False).mean()

    score = pd.Series(50.0, index=df.index)

    score += np.where(
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
    tier_penny = is_penny & (df["DNA_Score"] >= 65.0)

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
    return_deltas: bool = False,
):
    """RSI·MACD·ADX·RVOL을 합성한 0~100 DNA 점수."""
    score = 50.0
    d_rsi = d_macd = d_adx = d_rvol = d_ext = 0.0

    if pd.isna(rsi):
        d_rsi = 0.0
    elif rsi < 30:
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
    최근 N번의 매매 기록(ticker/entry_price/pnl_pct/profit_amt) 기반으로 동적 켈리 비중 산출.

    Scale-Out은 동일 포지션(ticker+entry_price)의 청산을 여러 paper_history 행으로
    남기므로, 행 단위로 승/패를 세면 한 번의 왕복매매가 여러 개의 "승리"로
    중복 집계되어 승률이 부풀려진다. ticker+entry_price로 그룹핑해
    포지션 단위 손익률로 환산한 뒤 승/패를 판정한다.
    """
    grouped: dict[str, dict[str, float]] = {}
    for r in recent_trades:
        ticker = r.get("ticker", "unknown")
        entry_price = r.get("entry_price", 0.0) or 0.0
        profit_amt = r.get("profit_amt", 0.0) or 0.0
        pnl_pct = r.get("pnl_pct", 0.0) or 0.0

        # entry_value(투입 금액) 자체는 저장되지 않으므로 profit_amt/pnl_pct로 역산
        entry_val = (profit_amt / (pnl_pct / 100.0)) if pnl_pct else 0.0

        key = f"{ticker}_{round(entry_price, 4)}"
        bucket = grouped.setdefault(key, {"total_pnl": 0.0, "total_entry_val": 0.0})
        bucket["total_pnl"] += profit_amt
        bucket["total_entry_val"] += entry_val

    position_pcts = [
        b["total_pnl"] / b["total_entry_val"]
        for b in grouped.values()
        if b["total_entry_val"] > 0
    ]

    if len(position_pcts) < min_trades:
        return None, 0.0, 0.0

    pnl_array = np.array(position_pcts)
    wins = pnl_array[pnl_array > 0]
    losses = pnl_array[pnl_array < 0]

    p = len(wins) / len(pnl_array)
    avg_win = np.mean(wins) if len(wins) > 0 else 0.0
    avg_loss = abs(np.mean(losses)) if len(losses) > 0 else 0.0

    if avg_loss == 0:
        b = float("inf")
        kelly_fraction = p
    elif avg_win == 0:
        b = 0.0
        kelly_fraction = 0.0
    else:
        b = avg_win / avg_loss
        kelly_fraction = p - ((1 - p) / b)

    kelly_fraction = max(0.0, float(kelly_fraction))
    if half_kelly:
        kelly_fraction *= 0.5

    final_weight = min(kelly_fraction, max_weight)
    return final_weight, p, b


# ── Position Sizing Engine ────────────────────────────────────────────────────


def calculate_position_sizing(
    df: pd.DataFrame,
    win_rate: float = 0.55,
    profit_ratio: float = 2.0,
    target_vol: float = 0.15,
    kelly_fraction: float = 0.25,
    dynamic_kelly_weight: float = None,
):
    """1단계(ATR 기반 변동성 조절)와 3단계(동적 켈리 공식)를 결합한 포지션 사이징 엔진"""
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
    ann_vol = atr_pct * np.sqrt(252)
    vol_weight = target_vol / (ann_vol + 1e-9)

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
        avg_weight = (vol_weight + optimal_kelly) / 2.0
        final_weight = min(avg_weight, vol_weight * 2.0, 1.0)

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
