import pandas as pd
import ta


def _rsi14_last(df: pd.DataFrame) -> float:
    if len(df) < 14:
        return 50.0
    try:
        rsi_series = ta.momentum.RSIIndicator(close=df["Close"], window=14).rsi()
        val = rsi_series.iloc[-1]
        return float(val) if pd.notna(val) else 50.0
    except Exception:
        return 50.0


def _atr14_last(df: pd.DataFrame) -> float:
    if len(df) < 14:
        return 0.0
    try:
        atr_series = ta.volatility.AverageTrueRange(
            high=df["High"], low=df["Low"], close=df["Close"], window=14
        ).average_true_range()
        val = atr_series.iloc[-1]
        return float(val) if pd.notna(val) else 0.0
    except Exception:
        return 0.0


def _er14_last(df: pd.DataFrame) -> float:
    """Kaufman's Efficiency Ratio (ER) 경량 계산.

    services/quant_engine.py의 calculate_advanced_signals()가 쓰는 공식
    (lookback=10, +1e-8 epsilon, EWM span=15 스무딩)과 반드시 동일해야 한다.
    다른 lookback/epsilon을 쓰면 횡보(sum_vol≈0)에서 분모가 0에 가까워져
    ER이 1.0(강한 추세로 오인)으로 튀는 반면 정식 공식은 ~0.0(횡보)이 되는
    정반대 결과가 나와, HOLD 경량 경로와 전체 DNA 경로의 트레일링 스탑
    k_t 레짐 판단이 같은 가격 데이터에서도 서로 어긋나게 된다.
    """
    try:
        er_lookback = 10
        if len(df) < er_lookback + 1:
            return 0.5
        change = df["Close"].diff(er_lookback).abs()
        volatility = df["Close"].diff(1).abs().rolling(window=er_lookback).sum()
        er = change / (volatility + 1e-8)
        smoothed_val = er.ewm(span=15, adjust=False).mean().iloc[-1]
        return float(smoothed_val) if not pd.isna(smoothed_val) else 0.5
    except Exception:
        return 0.5


def _rsi_atr_er_last(df: pd.DataFrame) -> tuple[float, float, float]:
    rsi = _rsi14_last(df)
    atr = _atr14_last(df)
    er = _er14_last(df)
    return rsi, atr, er
