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
    if len(df) < 15:
        return 0.0
    try:
        change = abs(df["Close"].iloc[-1] - df["Close"].iloc[-15])
        volatility = df["Close"].diff().abs().rolling(window=14).sum().iloc[-1]
        if volatility == 0 or pd.isna(volatility):
            return 0.0
        return float(change / volatility)
    except Exception:
        return 0.0


def _rsi_atr_er_last(df: pd.DataFrame) -> tuple[float, float, float]:
    rsi = _rsi14_last(df)
    atr = _atr14_last(df)
    er = _er14_last(df)
    return rsi, atr, er
