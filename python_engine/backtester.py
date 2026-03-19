import yfinance as yf
import pandas as pd
import numpy as np
import ta
import warnings

warnings.filterwarnings("ignore")


def run_backtest(
    ticker: str,
    period: str = "1y",
    initial_capital: float = 10000.0,
    deviation_threshold: float = -0.07,
    target_atr: float = 5.0,
):
    """
    Mean Reversion 유효성 검증 백테스트
    - 진입: RSI2 < 10 + Deviation < -7%
    - 청산: Target 5.0 ATR 또는 3일 Time Stop
    """
    # 1. 데이터 다운로드 및 전처리
    df = yf.download(ticker, period=period, progress=False)

    if df.empty:
        return {"error": "No data found"}

    # yfinance multi-index 대응
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    if "Close" not in df.columns:
        return {"error": "Close price not found"}

    df = df.copy()
    if isinstance(df["Close"], pd.DataFrame):
        df["Close"] = df["Close"].iloc[:, 0]

    if len(df) < 50:
        return {"error": "Not enough data (need 50+ bars)"}

    # 2. 기술적 지표 계산
    df["RSI2"] = ta.momentum.RSIIndicator(df["Close"], window=2).rsi()
    df["MA5"] = df["Close"].rolling(window=5).mean()
    df["Deviation"] = (df["Close"] - df["MA5"]) / df["MA5"]
    df["ATR5"] = ta.volatility.AverageTrueRange(
        high=df["High"], low=df["Low"], close=df["Close"], window=5
    ).average_true_range()

    # 3. 전략 시그널
    df["Entry_Signal"] = (df["RSI2"] < 10) & (df["Deviation"] < deviation_threshold)

    # 벡터 추출 (루프 성능 최적화)
    close_arr = df["Close"].values
    atr_arr = df["ATR5"].values
    signal_arr = df["Entry_Signal"].values

    # 4. State Machine — 포지션 추적
    positions = []
    strategy_returns = []

    is_holding = False
    entry_price = 0.0
    days_held = 0
    target_price = 0.0

    for i in range(len(df)):
        cp = float(close_arr[i])
        atr = float(atr_arr[i]) if not np.isnan(atr_arr[i]) else 0.0
        signal = bool(signal_arr[i])

        current_pos = 1.0 if is_holding else 0.0

        if not is_holding:
            if signal and not np.isnan(cp):
                is_holding = True
                entry_price = cp
                target_price = cp + (atr * target_atr)
                days_held = 0
                current_pos = 1.0
        else:
            days_held += 1
            # 청산 조건: 목표가 도달 또는 3일 경과
            if cp >= target_price or days_held >= 3:
                is_holding = False
                current_pos = 0.0

        # 일간 전략 수익률
        if i == 0:
            sr = 0.0
        else:
            prev_cp = float(close_arr[i - 1])
            mr = (cp - prev_cp) / prev_cp if prev_cp != 0 else 0.0
            # 전일 포지션 기준으로 수익률 계산
            prev_pos = positions[i - 1] if i > 0 else 0.0
            sr = mr * prev_pos

        strategy_returns.append(sr)
        positions.append(current_pos)

    df["Position"] = positions
    df["Strategy_Return"] = strategy_returns
    df["Market_Return"] = df["Close"].pct_change().fillna(0)

    # 5. 누적 자산 곡선 (Equity Curve)
    df["Benchmark_Equity"] = initial_capital * (1 + df["Market_Return"]).cumprod()
    df["Strategy_Equity"] = initial_capital * (1 + df["Strategy_Return"]).cumprod()

    # 6. MDD 계산
    rolling_max = df["Strategy_Equity"].cummax()
    drawdown = (df["Strategy_Equity"] - rolling_max) / rolling_max
    mdd = float(drawdown.min() * 100)

    # 7. React / Recharts 포맷으로 변환
    chart_data = []
    for date, row in df.iterrows():
        if pd.isna(row["Strategy_Equity"]):
            continue
        chart_data.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "benchmark": round(float(row["Benchmark_Equity"]), 2),
                "strategy": round(float(row["Strategy_Equity"]), 2),
                "rsi": round(float(row["RSI2"]), 2) if not pd.isna(row["RSI2"]) else 0,
            }
        )

    total_return_pct = (
        (df["Strategy_Equity"].iloc[-1] - initial_capital) / initial_capital * 100
    )
    benchmark_return_pct = (
        (df["Benchmark_Equity"].iloc[-1] - initial_capital) / initial_capital * 100
    )

    return {
        "ticker": ticker,
        "period": period,
        "initial_capital": initial_capital,
        "strategy": "Mean Reversion (RSI2<10, Dev<-7%, Target 5.0 ATR)",
        "total_return_pct": round(float(total_return_pct), 2),
        "benchmark_return_pct": round(float(benchmark_return_pct), 2),
        "outperformance": round(float(total_return_pct - benchmark_return_pct), 2),
        "mdd_pct": round(mdd, 2),
        "chart_data": chart_data,
    }
