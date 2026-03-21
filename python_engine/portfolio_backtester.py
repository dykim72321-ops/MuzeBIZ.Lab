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
        slippage_rate: float = 0.01,  # [Optimized] 0.2% -> 1.0% (Penny Stock Reality)
        deviation_threshold: float = -0.07,  # [Optimized] 이격도 진입 장벽
        target_atr: float = 5.0,  # [Optimized] 목표 ATR 멀티플라이어
    ):
        self.tickers = tickers
        self.start_date = start_date
        self.end_date = end_date
        self.gamma = gamma
        self.delta = delta
        self.lambda_val = lambda_val
        self.slippage_rate = slippage_rate
        self.deviation_threshold = deviation_threshold
        self.target_atr = target_atr
        self.benchmark_data = None

    def fetch_data(self):
        print(
            f"📥 데이터 다운로드 중: {len(self.tickers)}개 종목 (Penny Stock Universe)..."
        )
        # 데이터가 누락되는 경우를 대비해 여유 있게 가져옴
        df = yf.download(
            self.tickers, start=self.start_date, end=self.end_date, progress=False
        )
        print("📥 벤치마크 데이터(IWM) 다운로드 중...")
        bench = yf.download(
            "IWM", start=self.start_date, end=self.end_date, progress=False
        )
        if isinstance(bench.columns, pd.MultiIndex):
            self.benchmark_data = bench["Close"]["IWM"]
        else:
            self.benchmark_data = bench["Close"]
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
        time_penalty = min(60, float(days_held) * self.lambda_val * decay_multiplier)

        # 🆕 "Winner's Grace" (승자의 여유):
        # 주가가 목표가의 80%를 넘어서거나 상회 중인 우량주(Winner)는 시간 페널티를 50% 감면
        if current_price > target_price * 0.8:
            time_penalty = time_penalty * 0.5

        final_score = max(0, min(100, base_score - time_penalty))
        return final_score

    def calculate_kelly_weight(self, win_prob, win_loss_ratio):
        """Fractional Kelly Criterion (Quarter-Kelly)"""
        # 손익비(r)를 최대 5.0으로 캡핑
        r = min(5.0, max(0.1, win_loss_ratio))
        p = win_prob / 100.0
        kelly = p - (1 - p) / r

        # Quarter-Kelly 적용 (최대 25% 제한)
        quarter_kelly = max(0, kelly / 4.0)
        return round(quarter_kelly * 100, 1)

    def preprocess_data(self, data):
        """Mean Reversion 전략을 위한 지표 계산"""
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

                # 1. ATR5 유지
                df["ATR5"] = ta.volatility.AverageTrueRange(
                    high=df["High"], low=df["Low"], close=df["Close"], window=5
                ).average_true_range()

                # 2. [NEW] 단기 낙폭과대 지표
                df["RSI2"] = ta.momentum.RSIIndicator(df["Close"], window=2).rsi()
                df["MA5"] = df["Close"].rolling(window=5).mean()
                # 이격도 수식: (Close - MA5) / MA5
                df["Deviation"] = (df["Close"] - df["MA5"]) / (df["MA5"] + 1e-9)

                # 기존 지표 유지 (DNA Score 계산용 ER 등에서 활용)
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
                # [전략 변경] Mean Reversion (낙폭과대 역추세) 진입 로직:
                # 1. RSI(2) < 10 (극단적 과매도)
                # 2. 이격도 (MA5 대비 인자값 이하 하락)
                cond1 = df["RSI2"].iloc[i] < 10
                cond2 = df["Deviation"].iloc[i] < self.deviation_threshold

                if cond1 and cond2:
                    is_holding = True
                    entry_price = current_close * (1 + self.slippage_rate)
                    entry_date = current_date
                    entry_idx = i

                    effective_atr = (
                        current_atr
                        if (current_atr > 0 and not np.isnan(current_atr))
                        else entry_price * 0.20
                    )

                    # 목표가는 인자값(target_atr), 초기 손절가 3.0 ATR로 확대
                    target_price = entry_price + (effective_atr * self.target_atr)
                    initial_stop = entry_price - (effective_atr * 3.0)
                    stop_price = max(initial_stop, entry_price * 0.5)
            else:
                # 실제 거래일(Trading Days) 기준 days_held (이미 i - entry_idx로 근사화됨)
                days_held = i - entry_idx

                # 1. ER 및 RS 계산
                prices = df["Close"].iloc[entry_idx : i + 1].values
                net_change = abs(prices[-1] - prices[0])
                price_diffs = np.diff(prices)
                sum_vol = np.sum(np.abs(price_diffs))
                er = net_change / sum_vol if sum_vol > 0 else 1.0

                vol_std_dev = (
                    np.sqrt(np.mean(price_diffs**2))
                    if len(price_diffs) > 0
                    else entry_price * 0.05
                )

                # RS 계산 (IWM 대비)
                rs = 0
                if self.benchmark_data is not None:
                    try:
                        stock_ret = (current_close / entry_price) - 1
                        bench_start = self.benchmark_data.loc[entry_date]
                        bench_end = self.benchmark_data.loc[current_date]

                        # 만약 Series가 반환되면 첫 번째 값 사용
                        if isinstance(bench_start, pd.Series):
                            bench_start = bench_start.iloc[0]
                        if isinstance(bench_end, pd.Series):
                            bench_end = bench_end.iloc[0]

                        bench_ret = (bench_end / bench_start) - 1
                        rs = (stock_ret - bench_ret) * 100
                    except:
                        pass

                # [전략 변경] 페니 스탁 전용 타이트닝 (Floor 1.8)
                multiplier_base = 3.0
                if days_held > 1:
                    # 하루만 지나도 스탑을 빠르게 올림 (최하단 1.8)
                    multiplier_base = max(1.8, 3.0 - (days_held * 0.5))

                high_so_far = df["High"].iloc[entry_idx : i + 1].max()
                dynamic_multiplier = multiplier_base + 1.0  # volatility_factor 대체
                trailing_stop = high_so_far - (effective_atr * dynamic_multiplier)
                initial_stop = entry_price - (effective_atr * 3.0)
                stop_price = max(initial_stop, trailing_stop, entry_price * 0.5)

                score = self.calculate_dna_score(
                    entry_price, current_close, target_price, stop_price, days_held, er
                )

                # Kelly Weight 및 Time Stop 로직
                risk_denominator = entry_price - stop_price
                risk_reward = (target_price - entry_price) / (
                    risk_denominator if risk_denominator > 0 else 0.1
                )
                kelly_weight = self.calculate_kelly_weight(score, risk_reward)

                # [전략 변경] 극한의 Time Stop 로직 (3일 초과 시 무조건 청산)
                if days_held > 3:
                    exit_price = current_close * (1 - self.slippage_rate)
                    pnl = (exit_price - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": exit_price,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN" if pnl > 0 else "LOSS",
                            "reason": "TIME_STOP",
                        }
                    )
                    is_holding = False
                    continue

                # 1. 장중 목표가 달성
                if current_high >= target_price:
                    exit_price = target_price * (1 - self.slippage_rate)
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": exit_price,
                            "pnl": (exit_price - entry_price) / entry_price,
                            "days": days_held,
                            "result": "WIN",
                        }
                    )
                    is_holding = False

                # 2. 장중 손절가 이탈
                elif current_low <= stop_price:
                    exit_price = stop_price * (1 - self.slippage_rate)
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": exit_price,
                            "pnl": (exit_price - entry_price) / entry_price,
                            "days": days_held,
                            "result": "LOSS",
                        }
                    )
                    is_holding = False

                # 3. Kelly Weight가 0 이하로 떨어져 강제 청산 (종가 기준)
                elif kelly_weight <= 0:
                    exit_price = current_close * (1 - self.slippage_rate)
                    pnl = (exit_price - entry_price) / entry_price
                    trades.append(
                        {
                            "ticker": ticker,
                            "entry_price": entry_price,
                            "exit_price": exit_price,
                            "pnl": pnl,
                            "days": days_held,
                            "result": "WIN" if pnl > 0 else "LOSS",
                        }
                    )
                    is_holding = False

        return trades

    def report(self, trades):
        """백테스트 결과 통계 리포트 생성"""
        if not trades:
            print("⚠️ 거래 내역이 없습니다.")
            return {
                "total_trades": 0,
                "win_rate": 0,
                "avg_pnl": 0,
                "avg_win": 0,
                "avg_loss": 0,
                "profit_factor": 0,
                "mdd": 0,
                "recovery_days": 0,
                "avg_days": 0,
            }

        df_trades = pd.DataFrame(trades)
        total_trades = len(df_trades)
        win_trades = df_trades[df_trades["result"] == "WIN"]
        loss_trades = df_trades[df_trades["result"] == "LOSS"]

        win_rate = (len(win_trades) / total_trades) * 100
        avg_pnl = df_trades["pnl"].mean() * 100
        avg_win = win_trades["pnl"].mean() * 100 if not win_trades.empty else 0
        avg_loss = loss_trades["pnl"].mean() * 100 if not loss_trades.empty else 0

        sum_win = win_trades["pnl"].sum()
        sum_loss = abs(loss_trades["pnl"].sum())
        profit_factor = (
            sum_win / sum_loss if sum_loss > 0 else (float("inf") if sum_win > 0 else 0)
        )

        # Drawdown calculation
        df_trades = df_trades.sort_index()
        df_trades["cum_pnl"] = (1 + df_trades["pnl"]).cumprod()
        df_trades["peak"] = df_trades["cum_pnl"].cummax()
        df_trades["drawdown"] = (df_trades["cum_pnl"] - df_trades["peak"]) / df_trades[
            "peak"
        ]
        mdd = df_trades["drawdown"].min() * 100

        recovery_days = df_trades["days"].mean() * 1.5
        avg_days = df_trades["days"].mean()

        stats = {
            "total_trades": total_trades,
            "win_rate": round(win_rate, 2),
            "avg_pnl": round(avg_pnl, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "profit_factor": (
                round(profit_factor, 2) if profit_factor != float("inf") else 99
            ),
            "mdd": round(mdd, 2),
            "recovery_days": round(recovery_days, 1),
            "avg_days": round(avg_days, 1),
        }

        print("\n" + "=" * 60)
        print("  🧬 DNA Scoring Engine | Statistical Backtest Report")
        print("=" * 60)
        print(f"  총 거래 횟수 : {stats['total_trades']}회")
        print(f"  📈 승률 (Win Rate) : {stats['win_rate']}%")
        print(f"  💰 평균 수익률 : {stats['avg_pnl']}%")
        print(f"  🚀 평균 익절률 : {stats['avg_win']}%")
        print(f"  🛡️ 평균 손절률 : {stats['avg_loss']}%")
        print(f"  📊 손익비 (Profit Factor) : {stats['profit_factor']}x")
        print(f"  📉 MDD (최대 낙폭) : {stats['mdd']}%")
        print(f"  ⏱️ 평균 보유일 : {stats['avg_days']}일")
        print("-" * 60)
        print("=" * 60 + "\n")

        return stats

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

        return self.report(all_trades)

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
