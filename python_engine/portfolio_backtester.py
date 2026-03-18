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
        slippage_rate: float = 0.002,  # 슬리피지 (0.2%)
    ):
        self.tickers = tickers
        self.start_date = start_date
        self.end_date = end_date
        self.gamma = gamma
        self.delta = delta
        self.lambda_val = lambda_val
        self.slippage_rate = slippage_rate

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
        self,
        buy_price,
        current_price,
        target_price,
        stop_price,
        days_held,
        efficiency_ratio=1.0,
    ):
        """JS useDNACalculator.ts와 동일한 비선형 스코어링 및 동적 감가 로직"""
        if current_price >= target_price:
            return 100.0

        # 기본 점수 산출
        if current_price >= buy_price:
            # 수익 구간
            ratio = (current_price - buy_price) / (target_price - buy_price + 1e-9)
            er_bonus = efficiency_ratio * 10
            base_score = 50 + 50 * (ratio**self.gamma) + er_bonus
        else:
            # 손실 구간
            ratio = (buy_price - current_price) / (buy_price - stop_price + 1e-9)
            er_penalty = (1 - efficiency_ratio) * 15
            clamped_fall = min(1.0, float(ratio))
            base_score = 50 - 50 * (clamped_fall**self.delta) - er_penalty

        # 동적 시간 감가 (Dynamic Momentum Decay)
        decay_multiplier = max(0.5, 1.5 - efficiency_ratio)
        time_penalty = min(60, days_held * self.lambda_val * decay_multiplier)

        final_score = max(0, min(100, base_score - time_penalty))
        return final_score

    def preprocess_data(self, data):
        """WFA 성능 최적화를 위한 1회성 보조지표 일괄 계산 시스템 (Pre-processing)"""
        print("⚙️ 데이터 전처리 및 보조지표 계산 중 (Pre-processing)...")
        preprocessed = {}
        for ticker in self.tickers:
            try:
                if isinstance(data.columns, pd.MultiIndex):
                    ticker_data = data.xs(ticker, axis=1, level=1)
                else:
                    ticker_data = data

                df = pd.DataFrame(ticker_data).dropna()
                if len(df) < 20:
                    continue

                # 1. ATR5
                df["ATR5"] = ta.volatility.AverageTrueRange(
                    high=df["High"], low=df["Low"], close=df["Close"], window=5
                ).average_true_range()

                # 2. 보조 지표 계산
                df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()
                adx_obj = ta.trend.ADXIndicator(
                    df["High"], df["Low"], df["Close"], window=14
                )
                df["ADX"] = adx_obj.adx()
                df["DI_plus"] = adx_obj.adx_pos()
                df["DI_minus"] = adx_obj.adx_neg()

                # 3. 상대 거래량 (RVOL)
                df["Vol_Avg"] = df["Volume"].shift(1).rolling(window=20).mean()
                df["RVOL"] = df["Volume"] / (df["Vol_Avg"] + 1e-9)

                preprocessed[ticker] = df.dropna()
            except Exception as e:
                print(f"⚠️ {ticker} 보조지표 계산 에러: {e}")
        return preprocessed

    def simulate_ticker(self, ticker, preprocessed_df):
        """보조지표가 이미 계산된 단일 종목에 대해 DNA 전략 시뮬레이션 (초고속 연산)"""
        df = preprocessed_df
        if len(df) < 20:
            return None

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
                    # 슬리피지를 진입가에 반영 (비싸게 삼)
                    entry_price = current_close * (1 + self.slippage_rate)
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
                entry_idx = df.index.get_loc(entry_date)
                # 실제 거래일(Trading Days) 기준 days_held
                days_held = i - entry_idx

                # 1. ER 계산 및 변동성(Volatility) 연산
                if days_held >= 1:
                    prices = df["Close"].iloc[entry_idx : i + 1].values
                    net_change = abs(prices[-1] - prices[0])
                    price_diffs = np.diff(prices)
                    sum_vol = np.sum(np.abs(price_diffs))
                    er = net_change / sum_vol if sum_vol > 0 else 1.0

                    # JS volatilityStdDev 로직 대응
                    vol_std_dev = (
                        np.sqrt(np.mean(price_diffs**2))
                        if len(price_diffs) > 0
                        else entry_price * 0.05
                    )
                else:
                    er = 1.0
                    vol_std_dev = entry_price * 0.05

                # 2. 고도화된 스탑가 타이트닝 연산
                high_so_far = df["High"].iloc[entry_idx : i + 1].max()
                effective_atr = (
                    current_atr
                    if (current_atr > 0 and not np.isnan(current_atr))
                    else entry_price * 0.20
                )

                # Base multiplier tightening
                multiplier_base = 2.0
                if days_held > 5:
                    multiplier_base = max(1.0, 2.0 - ((days_held - 5) * 0.1))

                # Volatility Factor 반영
                volatility_factor = min(1.0, vol_std_dev / (entry_price * 0.05))
                dynamic_multiplier = multiplier_base + volatility_factor

                trailing_stop = high_so_far - (effective_atr * dynamic_multiplier)
                initial_stop = entry_price - (effective_atr * 1.5)
                stop_price = max(initial_stop, trailing_stop, entry_price * 0.5)

                score = self.calculate_dna_score(
                    entry_price, current_close, target_price, stop_price, days_held, er
                )

                # 1. 장중 목표가 달성 (최우선)
                if current_high >= target_price:
                    # 슬리피지를 익절가에 반영 (싸게 팖)
                    slippage_exit = target_price * (1 - self.slippage_rate)
                    pnl = (slippage_exit - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": slippage_exit,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN",
                        }
                    )
                    is_holding = False

                # 2. 장중 손절가 이탈 (슬리피지 반영)
                elif current_low <= stop_price:
                    slippage_exit = stop_price * (1 - self.slippage_rate)
                    pnl = (slippage_exit - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": slippage_exit,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "LOSS",
                        }
                    )
                    is_holding = False

                # 3. DNA Score가 0점 이하로 떨어져 강제 청산 (종가 기준)
                elif score <= 0:
                    slippage_exit = current_close * (1 - self.slippage_rate)
                    pnl = (slippage_exit - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": slippage_exit,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN" if pnl > 0 else "LOSS",
                        }
                    )
                    is_holding = False

        return trades

    def run(self):
        raw_data = self.fetch_data()
        precalculated_catalog = self.preprocess_data(raw_data)
        all_trades = []

        for ticker, ticker_data in precalculated_catalog.items():
            try:
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

    def walk_forward_optimization(self, train_months=6, test_months=2):
        """Walk-Forward Analysis (완전 전진 분석)"""
        print("\n" + "=" * 60)
        print("  🔬 Walk-Forward Analysis (WFA) 시작")
        print("=" * 60 + "\n")

        raw_data = self.fetch_data()
        if raw_data.empty:
            print("데이터 다운로드 실패")
            return

        precalculated_catalog = self.preprocess_data(raw_data)
        if not precalculated_catalog:
            print("보조지표 계산 데이터 없음")
            return

        dates = raw_data.index.unique().sort_values()
        if len(dates) == 0:
            return

        start_date = dates[0]
        end_date = dates[-1]

        current_train_start = start_date

        # Grid 파라미터 (예시: 빠른 연산을 위해 2개씩 조합)
        gamma_grid = [0.8, 1.2]
        delta_grid = [1.2, 1.8]
        lambda_grid = [1.5, 3.0]

        total_oos_trades = []

        while True:
            train_end = current_train_start + pd.DateOffset(months=train_months)
            test_end = train_end + pd.DateOffset(months=test_months)

            if test_end > end_date:
                # 마지막 구간 남은 기간 처리
                break

            print(
                f"🔄 창(Window): Train[{current_train_start.date()} ~ {train_end.date()}] | Test[{train_end.date()} ~ {test_end.date()}]"
            )

            best_pf = 0
            best_params = {
                "gamma": self.gamma,
                "delta": self.delta,
                "lambda_val": self.lambda_val,
            }

            # IN-SAMPLE TRAINING Loop
            for g in gamma_grid:
                for d in delta_grid:
                    for l in lambda_grid:
                        self.gamma = g
                        self.delta = d
                        self.lambda_val = l

                        is_trades = []
                        for ticker, ticker_data in precalculated_catalog.items():
                            try:
                                train_slice = ticker_data.loc[
                                    current_train_start:train_end
                                ]
                                if not train_slice.empty:
                                    t = self.simulate_ticker(ticker, train_slice)
                                    if t:
                                        is_trades.extend(t)
                            except:
                                pass

                        if is_trades:
                            df_is = pd.DataFrame(is_trades)
                            sum_win = df_is[df_is["result"] == "WIN"]["pnl"].sum()
                            sum_loss = df_is[df_is["result"] == "LOSS"]["pnl"].sum()
                            pf = abs(sum_win / sum_loss) if sum_loss != 0 else sum_win

                            if pf > best_pf:
                                best_pf = pf
                                best_params = {"gamma": g, "delta": d, "lambda_val": l}

            print(f"   ✓ Train 최고 パラメータ: {best_params} (PF: {best_pf:.2f})")

            # OUT-OF-SAMPLE TESTING (Test Window에 최적 파라미터 적용)
            self.gamma = best_params["gamma"]
            self.delta = best_params["delta"]
            self.lambda_val = best_params["lambda_val"]

            oos_trades = []
            for ticker, ticker_data in precalculated_catalog.items():
                try:
                    test_slice = ticker_data.loc[train_end:test_end]
                    if not test_slice.empty:
                        t = self.simulate_ticker(ticker, test_slice)
                        if t:
                            oos_trades.extend(t)
                except:
                    pass

            if oos_trades:
                df_oos = pd.DataFrame(oos_trades)
                wr = len(df_oos[df_oos["result"] == "WIN"]) / len(df_oos) * 100
                total_oos_trades.extend(oos_trades)
                print(f"   ✓ Test 검증 결과: 총 {len(df_oos)} 거래, 승률 {wr:.2f}%")
            else:
                print(f"   ✓ Test 검증 결과: 거래 발생 안 함")

            current_train_start += pd.DateOffset(months=test_months)

        print("\n" + "=" * 60)
        print("  🏆 누적 OOS (Out-of-Sample) 종합 백테스트 리포트")
        return self.report(total_oos_trades)


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
    print("▶ 일반 백테스트 실행")
    validator.run()

    print("\n▶ Walk-Forward Analysis (WFA) 실행")
    validator.walk_forward_optimization(train_months=6, test_months=2)
