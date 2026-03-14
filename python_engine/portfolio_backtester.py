import yfinance as yf
import pandas as pd
import numpy as np
import ta
import warnings


# 경고 무시
warnings.filterwarnings("ignore")


class DNAValidator:
    def __init__(
        self,
        tickers: list,
        start_date: str = "2023-01-01",
        end_date: str = "2024-03-01",
        gamma: float = 0.8,  # 수익 모멘텀
        delta: float = 1.5,  # 손실 공포
        lambda_val: float = 2.0,  # 시간 감가
    ):
        self.tickers = tickers
        self.start_date = start_date
        self.end_date = end_date
        self.gamma = gamma
        self.delta = delta
        self.lambda_val = lambda_val

    def fetch_data(self):
        print(
            f"📥 데이터 다운로드 중: {len(self.tickers)}개 종목 (Penny Stock Universe)..."
        )
        # 데이터가 누락되는 경우를 대비해 여유 있게 가져옴
        df = yf.download(
            self.tickers, start=self.start_date, end=self.end_date, progress=False
        )
        return df

    def calculate_dna_score(
        self, buy_price, current_price, target_price, stop_price, days_held
    ):
        """JS useDNACalculator.ts와 동일한 비선형 스코어링 로직"""
        if current_price >= target_price:
            return 100.0

        # 기본 점수 산출
        if current_price >= buy_price:
            # 수익 구간 (비선형 가중치 GAMMA)
            ratio = (current_price - buy_price) / (target_price - buy_price + 1e-9)
            base_score = 50 + 50 * (ratio**self.gamma)
        else:
            # 손실 구간 (비선형 가중치 DELTA)
            ratio = (buy_price - current_price) / (buy_price - stop_price + 1e-9)
            base_score = 50 - 50 * (ratio**self.delta)

        # 시간 감가 (Time Decay)
        time_penalty = min(40, days_held * self.lambda_val)

        final_score = max(0, min(100, base_score - time_penalty))
        return final_score

    def simulate_ticker(self, ticker, data):
        """단일 종목에 대해 DNA 전략 시뮬레이션"""
        df = pd.DataFrame(data).dropna()
        if len(df) < 20:
            return None

        # 1. ATR5 계산 (백엔드 로직 동일)
        df["ATR5"] = ta.volatility.AverageTrueRange(
            high=df["High"], low=df["Low"], close=df["Close"], window=5
        ).average_true_range()

        # 2. 보조 지표 계산 (고도화된 진입 시그널용)
        df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()
        adx_obj = ta.trend.ADXIndicator(df["High"], df["Low"], df["Close"], window=14)
        df["ADX"] = adx_obj.adx()
        df["DI_plus"] = adx_obj.adx_pos()
        df["DI_minus"] = adx_obj.adx_neg()

        # 상대 거래량 (RVOL)
        df["Vol_Avg"] = df["Volume"].shift(1).rolling(window=20).mean()
        df["RVOL"] = df["Volume"] / (df["Vol_Avg"] + 1e-9)

        # 3. 시뮬레이션 변수
        trades = []
        is_holding = False
        entry_price = 0
        entry_date = None
        target_price = 0
        stop_price = 0

        for i in range(20, len(df)):  # RVOL을 위해 20봉 이후부터
            current_close = df["Close"].iloc[i]
            current_high = df["High"].iloc[i]
            current_low = df["Low"].iloc[i]
            current_date = df.index[i]
            current_atr = df["ATR5"].iloc[i]

            if not is_holding:
                # 고도화된 진입 조건:
                # 1. RSI 40 이상 (회복세)
                # 2. ADX 상승 (추세 강화) + DI+ > DI-
                # 3. 거래량 폭발 (RVOL > 1.5)
                cond1 = df["RSI"].iloc[i] > 40
                cond2 = (
                    df["ADX"].iloc[i] > df["ADX"].iloc[i - 1]
                    and df["DI_plus"].iloc[i] > df["DI_minus"].iloc[i]
                )
                cond3 = df["RVOL"].iloc[i] > 1.5

                if cond1 and cond2 and cond3:
                    is_holding = True
                    entry_price = current_close
                    entry_date = current_date

                    effective_atr = (
                        current_atr
                        if (current_atr > 0 and not np.isnan(current_atr))
                        else entry_price * 0.20
                    )
                    target_price = entry_price + (effective_atr * 2.5)
                    stop_price = max(
                        entry_price - (effective_atr * 1.2), entry_price * 0.5
                    )
            else:
                days_held = (current_date - entry_date).days
                score = self.calculate_dna_score(
                    entry_price, current_close, target_price, stop_price, days_held
                )

                # 1. 장중 목표가 달성 (최우선)
                if current_high >= target_price:
                    pnl = (target_price - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": target_price,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN",
                        }
                    )
                    is_holding = False

                # 2. 장중 손절가 이탈
                elif current_low <= stop_price:
                    pnl = (stop_price - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": stop_price,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "LOSS",
                        }
                    )
                    is_holding = False

                # 3. DNA Score가 0점 이하로 떨어져 강제 청산 (종가 기준)
                elif score <= 0:
                    pnl = (current_close - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": current_close,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN" if pnl > 0 else "LOSS",
                        }
                    )
                    is_holding = False

        return trades

    def run(self):
        data = self.fetch_data()
        all_trades = []

        # yfinance multi-index 처리
        if isinstance(data.columns, pd.MultiIndex):
            pass
        else:
            # 단일 종목일 경우 처리
            pass

        for ticker in self.tickers:
            try:
                if isinstance(data.columns, pd.MultiIndex):
                    ticker_data = data.xs(ticker, axis=1, level=1)
                else:
                    ticker_data = data

                trades = self.simulate_ticker(ticker, ticker_data)
                if trades:
                    all_trades.extend(trades)
            except Exception as e:
                print(f"⚠️ {ticker} 에러: {e}")

        self.report(all_trades)

    def report(self, trades):
        if not trades:
            print("❌ 시뮬레이션 결과 거래 내역이 없습니다.")
            return

        df = pd.DataFrame(trades)
        win_rate = (
            (len(df[df["result"] == "WIN"]) / len(df)) * 100 if len(df) > 0 else 0
        )
        avg_pnl = df["pnl"].mean() * 100
        avg_win = df[df["result"] == "WIN"]["pnl"].mean() * 100
        avg_loss = df[df["result"] == "LOSS"]["pnl"].mean() * 100
        profit_factor = (
            abs(
                df[df["result"] == "WIN"]["pnl"].sum()
                / df[df["result"] == "LOSS"]["pnl"].sum()
            )
            if df[df["result"] == "LOSS"]["pnl"].sum() != 0
            else float("inf")
        )

        print("\n" + "=" * 60)
        print("  🧬 DNA Scoring Engine | Statistical Backtest Report")
        print("=" * 60)
        print(f"  총 거래 횟수 : {len(df)}회")
        print(f"  📈 승률 (Win Rate) : {win_rate:.2f}%")
        print(f"  💰 평균 수익률 : {avg_pnl:+.2f}%")
        print(f"  🚀 평균 익절률 : {avg_win:.2f}%")
        print(f"  🛡️ 평균 손절률 : {avg_loss:.2f}%")
        print(f"  📊 손익비 (Profit Factor) : {profit_factor:.2f}x")
        print(f"  ⏱️ 평균 보유일 : {df['days'].mean():.1f}일")
        print("-" * 60)

        # 판정
        if win_rate > 55 and profit_factor > 1.5:
            print("  🏆 [판정] 최적화 성공: 통계적 우위와 강력한 하방 방어 증명됨.")
        elif win_rate > 50:
            print(
                "  🟡 [판정] 유효함: 수익 모델로서의 가치는 있으나 파라미터 미세 조정 권장."
            )
        else:
            print("  🔴 [판정] 경고: 현재 파라미터는 페니 스탁의 노이즈에 취약함.")
        print("=" * 60 + "\n")


if __name__ == "__main__":
    # 상장 유지 및 거래가 활발한 페니 스탁/소형주 유니버스
    penny_universe = [
        "SOFI",
        "PLTR",
        "AMC",
        "GME",
        "RIOT",
        "MARA",
        "CLOV",
        "PLUG",
        "AAL",
        "NCLH",
        "CCL",
        "DNA",
        "TLRY",
        "SNDL",
        "NIO",
        "XPEV",
    ]

    validator = DNAValidator(
        tickers=penny_universe, start_date="2023-01-01", end_date="2024-03-11"
    )
    validator.run()
