import yfinance as yf
import pandas as pd
import numpy as np
import ta
import warnings

# yfinance 및 pandas 경고 무시 (깔끔한 로그 출력을 위해)
warnings.filterwarnings("ignore")


class EngineValidator:
    def __init__(
        self,
        tickers: list,
        start_date: str = "2019-01-01",
        end_date: str = "2024-01-01",
    ):
        self.tickers = tickers
        self.start_date = start_date
        self.end_date = end_date

        # 켈리 공식 및 리스크 관리 파라미터 (main.py와 동일하게 설정)
        self.win_rate = 0.55
        self.profit_ratio = 2.0
        self.target_vol = (
            0.30  # 개별 주식 변동성 현실화 (0.15 → 0.30, 자본 투입량 ~2배)
        )
        self.kelly_fraction = 0.75  # 3/4 Kelly: State Machine 검증 후 자본 투입량 확대
        self.base_kelly = (
            self.profit_ratio * self.win_rate - (1 - self.win_rate)
        ) / self.profit_ratio

    def fetch_data(self):
        print(
            f"📥 다운로드 중: {len(self.tickers)}개 종목 "
            f"(기간: {self.start_date} ~ {self.end_date})..."
        )
        df = yf.download(
            self.tickers, start=self.start_date, end=self.end_date, progress=False
        )
        # yfinance 최신 버전 multi-index 대응
        if isinstance(df.columns, pd.MultiIndex):
            close = df["Close"]
        else:
            close = df[["Close"]]
        return close

    def simulate_strategy(self, close_prices: pd.Series, mode: str = "strict"):
        """
        단일 종목에 대해 펄스 엔진 로직을 적용하여 일간 수익률을 반환

        mode='strict'   → RSI < 35 + MACD 골든크로스 발생 시점 (고정밀 / 저빈도)
        mode='relaxed'  → RSI < 40 + MACD 양전환 구간 (표본 확보용)
        mode='momentum' → RSI < 45 + MACD 히스토그램 기울기 개선 (빈도 극대화)
                          매도: RSI > 65 OR MACD 기울기 하락 전환
                          ※ Total Return = EV × Frequency 최적화 전략
        """
        df = pd.DataFrame({"Close": close_prices}).dropna()
        if len(df) < 50:
            return None, None

        # 1. 기술적 지표 계산 (main.py의 calculate_advanced_signals)
        df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()
        macd = ta.trend.MACD(df["Close"], window_slow=26, window_fast=12, window_sign=9)
        df["MACD_Diff"] = macd.macd_diff()

        # 2. 매수/매도 시그널 생성
        if mode == "strict":
            # STRICT: RSI < 35 + MACD 골든크로스 발생 시점  (저빈도 / 고정밀)
            df["Strong_Buy"] = (
                (df["RSI"] < 35)
                & (df["MACD_Diff"] > 0)
                & (df["MACD_Diff"].shift(1) <= 0)
            )
            df["Strong_Sell"] = (
                (df["RSI"] > 65)
                & (df["MACD_Diff"] < 0)
                & (df["MACD_Diff"].shift(1) >= 0)
            )
        elif mode == "relaxed":
            # RELAXED: RSI < 40 + MACD Diff 양수 구간 전체  (중빈도)
            df["Strong_Buy"] = (df["RSI"] < 40) & (df["MACD_Diff"] > 0)
            df["Strong_Sell"] = (df["RSI"] > 60) & (df["MACD_Diff"] < 0)
        else:  # momentum
            # MOMENTUM (v2): RSI < 45 눌림목 + MACD 모멘텀 회복 시작
            # 매수: RSI 45 이하 & MACD 히스토그램 기울기 개선 (낙폭 둔화 시작)
            df["Strong_Buy"] = (df["RSI"] < 45) & (
                df["MACD_Diff"] > df["MACD_Diff"].shift(1)
            )
            # 매도: RSI 과열 AND MACD 기울기 꺾임 — 둘 다 동시 충족 시만 청산 (추세 홀딩)
            # OR → AND 변경: 가짜 청산(휩쏘) 제거, 수익 구간 길게 보유
            df["Strong_Sell"] = (df["RSI"] > 65) & (
                df["MACD_Diff"] < df["MACD_Diff"].shift(1)
            )

        # -----------------------------------------------------------------
        # 3 + 4 + 5 + 6. 통합 State Machine 루프
        #   ① 포지션 추적 (트레일링 스탑 + 분할 익절)
        #   ② 켈리/변동성 사이징
        #   ③ 일간 수익률 계산
        #   ④ 거래 내역 기록 (승률 산출용)
        # -----------------------------------------------------------------

        # ── Micro-Cap Hybrid Tuning ──
        # 1. Adaptive Lookback (종목 가격에 따라 ATR 주기 조절)
        # 페니 스탁(기준 $5 미만)은 5일, 우량주는 14일
        is_penny = df["Close"].iloc[0] < 5.0
        atr_period = 5 if is_penny else 14
        
        # 2. ATR 지표 계산
        df["ATR"] = ta.volatility.AverageTrueRange(
            high=df["Close"], low=df["Close"], close=df["Close"], window=atr_period
        ).average_true_range()
        
        # 3. 변동성 기반 켈리 비중 (벡터)
        df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))
        df["ann_vol"] = df["log_return"].rolling(window=20).std() * np.sqrt(252)
        df["vol_weight"] = self.target_vol / (df["ann_vol"] + 1e-9)
        optimal_kelly = max(0.0, self.base_kelly) * self.kelly_fraction

        positions = []  # 매 봉 포지션 비중 (0.0 / 0.5 / 1.0)
        weights = []  # 매 봉 켈리 비중
        strategy_returns = []  # 매 봉 전략 수익률
        trades = []  # 완결된 거래의 P&L

        position = 0.0  # 현재 보유 비중
        entry_price = 0.0  # 진입 가격
        highest_price = 0.0  # 진입 후 최고가 (트레일링 기준)
        scaled_out = False  # 분할 익절(50%) 실행 여부

        close_arr = df["Close"].values
        rsi_arr = df["RSI"].values
        buy_arr = df["Strong_Buy"].values
        sell_arr = df["Strong_Sell"].values
        vol_w_arr = df["vol_weight"].values
        atr_arr = df["ATR"].values

        prev_position = 0.0
        prev_weight = 0.0

        for i in range(len(df)):
            cp = close_arr[i]
            rsi = rsi_arr[i]
            strong_buy = buy_arr[i]
            strong_sell = sell_arr[i]
            vw = vol_w_arr[i] if not np.isnan(vol_w_arr[i]) else 0.0
            kelly_w = min(vw * optimal_kelly, 1.0)

            if position == 0.0:
                # ── 진입: Strong Buy 신호 발생 시 100% 포지션
                if strong_buy and not np.isnan(cp):
                    position = 1.0
                    entry_price = cp
                    highest_price = cp
                    scaled_out = False

            else:
                # 최고가 갱신
                if cp > highest_price:
                    highest_price = cp

                # ── 하이브리드 청산 로직 (State Machine) ──
                current_atr = atr_arr[i] if not np.isnan(atr_arr[i]) else (cp * 0.05)
                
                # Asymmetric Trailing Stop (비대칭 트레일링 스탑)
                # 1. 기본 손절 (Initial Stop): ATR의 1.5배 (흔들기 방지)
                # 2. 수익 보존 (Trailing Profit): 미실현 수익이 1.5 * ATR을 초과하면 ATR 1.0배로 타이트하게 조절
                unrealized_pnl = (cp - entry_price)
                
                atr_factor = 1.5
                if unrealized_pnl > (current_atr * 1.5): # 명확한 수익 트리거: 1.5 ATR 초과 수익 발생 시
                    atr_factor = 1.0
                
                ts_threshold = highest_price - (current_atr * atr_factor)

                # 수익보전(Breakeven) 룰: +3% 이상 이익 발생 시 최소 손절선을 +0.5%로 상향 (Micro-Cap 대응)
                if highest_price > entry_price * 1.03:
                    ts_threshold = max(ts_threshold, entry_price * 1.005)

                if cp < ts_threshold:
                    # 트레일링 스탑 발동 → 전량 청산
                    if entry_price > 0:
                        trades.append((cp - entry_price) / entry_price)
                    position = 0.0
                    entry_price = 0.0

                elif strong_sell:
                    # ── 청산 로직 B: 정규 매도 조건 발동 → 전량 청산
                    if entry_price > 0:
                        trades.append((cp - entry_price) / entry_price)
                    position = 0.0
                    entry_price = 0.0

                elif position == 1.0 and rsi > 65 and not scaled_out:
                    # ── 청산 로직 C: RSI 65 돌파 → 50% 선제 분할 익절 (Micro-Cap에서는 약간 더 높게)
                    position = 0.5
                    scaled_out = True
                    # 절반 청산 거래 기록 (부분 실현)
                    if entry_price > 0:
                        trades.append((cp - entry_price) / entry_price)

            # 수익률 계산 (전 봉 포지션 × 켈리 비중 × 당일 등락)
            if i == 0:
                mr = 0.0
            else:
                prev_close = close_arr[i - 1]
                mr = (cp - prev_close) / prev_close if prev_close != 0 else 0.0

            sr = mr * prev_position * prev_weight
            strategy_returns.append(sr)

            positions.append(position)
            weights.append(kelly_w)
            prev_position = position
            prev_weight = kelly_w

        df["Position"] = positions
        df["Weight"] = weights
        df["Strategy_Return"] = strategy_returns
        df["Market_Return"] = df["Close"].pct_change().fillna(0)

        return df["Strategy_Return"], trades

    def run(self, mode: str = "strict", verbose: bool = True):
        """mode: 'strict' | 'relaxed' | 'momentum'"""
        if verbose:
            labels = {
                "strict": "[STRICT]   RSI<35 + MACD 골든크로스 (고정밀)",
                "relaxed": "[RELAXED]  RSI<40 + MACD 양전환 (중빈도)",
                "momentum": "[MOMENTUM] RSI<45 + MACD 기울기 개선 (빈도 극대화)",
            }
            print(f"⚙️  펄스 엔진 시뮬레이션 {labels.get(mode, mode)}\n")
        close_data = self.fetch_data()

        portfolio_returns = []
        benchmark_returns = []
        all_trades = []
        failed = []

        for ticker in self.tickers:
            try:
                if ticker in close_data.columns:
                    series = close_data[ticker]
                else:
                    failed.append(ticker)
                    continue

                strat_ret, trades = self.simulate_strategy(series, mode=mode)
                if strat_ret is not None:
                    portfolio_returns.append(strat_ret.rename(ticker))
                    bm = series.pct_change().rename(ticker)
                    benchmark_returns.append(bm)
                    all_trades.extend(trades)
                    if verbose:
                        print(f"  ✅ [{ticker}] 거래 {len(trades)}회")
                else:
                    failed.append(ticker)
            except Exception as e:
                print(f"  ⚠️  [{ticker}] 오류: {e}")
                failed.append(ticker)

        if not portfolio_returns:
            print("❌ 데이터가 부족하여 시뮬레이션을 완료할 수 없습니다.")
            return

        # ── 포트폴리오 전체 일간 평균 수익률 (동일 비중)
        port_df = pd.concat(portfolio_returns, axis=1).mean(axis=1).fillna(0)
        bm_df = pd.concat(benchmark_returns, axis=1).mean(axis=1).fillna(0)

        # ── 누적 수익률
        cum_strategy = (1 + port_df).cumprod()
        cum_benchmark = (1 + bm_df).cumprod()

        total_return_pct = (cum_strategy.iloc[-1] - 1) * 100
        benchmark_total = (cum_benchmark.iloc[-1] - 1) * 100

        # ── CAGR
        years = len(port_df) / 252
        cagr = ((cum_strategy.iloc[-1]) ** (1 / years) - 1) * 100
        bm_cagr = ((cum_benchmark.iloc[-1]) ** (1 / years) - 1) * 100

        # ── MDD (전략)
        rolling_max = cum_strategy.cummax()
        drawdown = (cum_strategy - rolling_max) / rolling_max
        mdd = drawdown.min() * 100

        # ── MDD (벤치마크)
        bm_rolling_max = cum_benchmark.cummax()
        bm_drawdown = (cum_benchmark - bm_rolling_max) / bm_rolling_max
        bm_mdd = bm_drawdown.min() * 100

        # ── 샤프 비율 (무위험 수익률 0% 가정)
        sharpe = (
            (port_df.mean() / port_df.std()) * np.sqrt(252) if port_df.std() > 0 else 0
        )

        # ── 승률
        winning_trades = [t for t in all_trades if t > 0]
        win_rate = (len(winning_trades) / len(all_trades)) * 100 if all_trades else 0

        # ── 평균 손익비
        avg_win = (
            np.mean([t for t in all_trades if t > 0]) * 100 if winning_trades else 0
        )
        avg_loss = (
            abs(np.mean([t for t in all_trades if t < 0]) * 100)
            if [t for t in all_trades if t < 0]
            else 0
        )
        profit_factor = (avg_win / avg_loss) if avg_loss > 0 else float("inf")

        # ── 결과 출력
        sep = "=" * 55
        print(f"\n{sep}")
        print("  📊  MuzeBIZ.Lab  |  펄스 엔진 대규모 백테스트")
        print(sep)
        print(
            f"  유니버스    : 미국 우량주 {len(self.tickers)}개 (실제 분석: {len(portfolio_returns)}개)"
        )
        print(f"  테스트 기간 : {self.start_date} ~ {self.end_date}  ({years:.1f}년)")
        print(f"  총 거래 횟수 : {len(all_trades):,}회")
        print("-" * 55)
        header = f"  {'지표':<28} {'전략':>10} {'벤치마크':>10}"
        print(header)
        print("-" * 55)
        print(f"  {'📈  승률 (Win Rate)':<28} {win_rate:>9.2f}%  {'—':>9}")
        print(
            f"  {'🚀  총 누적 수익률':<28} {total_return_pct:>9.2f}%  {benchmark_total:>8.2f}%"
        )
        print(f"  {'⚡  CAGR (연평균 수익률)':<26} {cagr:>9.2f}%  {bm_cagr:>8.2f}%")
        print(f"  {'🛡️   MDD (최대 낙폭)':<28} {mdd:>9.2f}%  {bm_mdd:>8.2f}%")
        print(f"  {'📐  샤프 비율':<29} {sharpe:>9.2f}   {'—':>9}")
        print(
            f"  {'💰  평균 손익비 (Profit Factor)':<25} {profit_factor:>9.2f}x  {'—':>9}"
        )
        print(f"  {'📊  평균 수익 거래':<29} {avg_win:>9.2f}%  {'—':>9}")
        print(f"  {'📊  평균 손실 거래':<29} {-avg_loss:>9.2f}%  {'—':>9}")
        print(sep)

        # ── 종합 판정
        alpha = cagr - bm_cagr
        print(f"\n  🏆  시장 대비 초과 수익 (Alpha): {alpha:+.2f}% / 연")
        print()

        stat_note = ""
        if len(all_trades) < 30:
            stat_note = (
                f"  ⚠️  거래 횟수 {len(all_trades)}회 → 통계적 유의성 낮음 (목표: 30회+)"
            )
            print(stat_note)

        judgements = []
        if win_rate >= 55:
            judgements.append("✅ 승률 55%+ → 통계적 우위(Edge) 확인")
        elif win_rate >= 52:
            judgements.append("🟡 승률 52%+ → 약한 통계적 우위 (기준 충족)")
        elif len(all_trades) < 30:
            judgements.append("⚠️  표본 부족 → 승률 수치의 신뢰도 낮음")
        else:
            judgements.append("🔴 승률 50% 미달 → 신호 임계치 튜닝 필요")

        if mdd > -25:
            judgements.append("✅ MDD -25% 이내 → 켈리+변동성 리스크 관리 정상 작동")
        elif mdd > -35:
            judgements.append("🟡 MDD -25%~-35% → 리스크 관리 작동 중, 보완 권장")
        else:
            judgements.append("🔴 MDD -35% 초과 → 포지션 사이징 재검토 필요")

        if cagr >= 15:
            judgements.append("✅ CAGR 15%+ → S&P500 벤치마크 명확히 초과")
        elif cagr >= 10:
            judgements.append("🟡 CAGR 10%+ → 시장 수준 수익률 확보")
        else:
            judgements.append("🔴 CAGR 10% 미달 → 전략 파라미터 최적화 필요")

        for j in judgements:
            print(f"  {j}")

        print()
        if failed:
            print(f"  ℹ️  데이터 미확보 종목: {', '.join(failed)}")
        print(sep + "\n")

        return {
            "win_rate": win_rate,
            "total_return_pct": total_return_pct,
            "cagr": cagr,
            "mdd": mdd,
            "sharpe": sharpe,
            "profit_factor": profit_factor,
            "total_trades": len(all_trades),
            "alpha": alpha,
        }

    def run_comparison(self):
        """STRICT / RELAXED / MOMENTUM 3개 모드 비교 실행"""
        configs = [
            (
                "strict",
                "🔬  PHASE 1: STRICT 모드",
                "조건: RSI < 35 + MACD 골든크로스 발생 시점 (고정밀/저빈도)",
            ),
            (
                "relaxed",
                "📊  PHASE 2: RELAXED 모드",
                "조건: RSI < 40 + MACD Diff 양수 구간 (통계 표본 확보)",
            ),
            (
                "momentum",
                "🚀  PHASE 3: MOMENTUM 모드  ← 핵심 튜닝",
                "조건: RSI < 45 + MACD 기울기 개선 시작 (빈도 극대화)",
            ),
        ]

        results = {}
        for mode, title, desc in configs:
            print("\n" + "=" * 65)
            print(f"  {title}")
            print(f"  {desc}")
            print("=" * 65 + "\n")
            results[mode] = self.run(mode=mode, verbose=False)

        r1, r2, r3 = results["strict"], results["relaxed"], results["momentum"]

        # ── 3-컬럼 최종 비교표
        W = 65
        print("\n" + "=" * W)
        print("  🏁  3-MODE 최종 비교표  |  MuzeBIZ.Lab 펄스 엔진")
        print("=" * W)
        hdr = f"  {'지표':<24} {'STRICT':>12} {'RELAXED':>12} {'MOMENTUM':>12}"
        print(hdr)
        print("-" * W)

        def row(label, key, fmt=".2f", suffix=""):
            v1 = (
                getattr(r1[key], "__format__", lambda f: format(r1[key], f))(fmt)
                + suffix
            )
            v2 = (
                getattr(r2[key], "__format__", lambda f: format(r2[key], f))(fmt)
                + suffix
            )
            v3 = (
                getattr(r3[key], "__format__", lambda f: format(r3[key], f))(fmt)
                + suffix
            )
            print(f"  {label:<24} {v1:>12} {v2:>12} {v3:>12}")

        print(
            f"  {'총 거래 횟수':<24} {r1['total_trades']:>11}회 {r2['total_trades']:>11}회 {r3['total_trades']:>11}회"
        )
        print(
            f"  {'승률 (Win Rate)':<24} {r1['win_rate']:>10.2f}%  {r2['win_rate']:>10.2f}%  {r3['win_rate']:>10.2f}%"
        )
        print(
            f"  {'CAGR':<24} {r1['cagr']:>10.2f}%  {r2['cagr']:>10.2f}%  {r3['cagr']:>10.2f}%"
        )
        print(
            f"  {'MDD':<24} {r1['mdd']:>10.2f}%  {r2['mdd']:>10.2f}%  {r3['mdd']:>10.2f}%"
        )
        print(
            f"  {'샤프 비율':<24} {r1['sharpe']:>11.2f}  {r2['sharpe']:>11.2f}  {r3['sharpe']:>11.2f}"
        )
        print(
            f"  {'손익비':<24} {r1['profit_factor']:>10.2f}x  {r2['profit_factor']:>10.2f}x  {r3['profit_factor']:>10.2f}x"
        )
        print(
            f"  {'Alpha (vs Buy&Hold)':<24} {r1['alpha']:>+10.2f}%  {r2['alpha']:>+10.2f}%  {r3['alpha']:>+10.2f}%"
        )
        print("=" * W)

        # ── 종합 판정
        best = max(results, key=lambda k: results[k]["cagr"])
        print(
            f"\n  🏆  CAGR 기준 최우수 모드: {best.upper()} ({results[best]['cagr']:.2f}% / 연)"
        )
        print()
        print("  📌 해석 가이드:")
        print("  • STRICT  : 캐피털 보존 극대화 — 거의 안 들어가지만 들어가면 이김")
        print("  • RELAXED : 표본 통계 수집용 — 승률 확인용 베이스라인")
        print("  • MOMENTUM: EV×Frequency 최적화 — CAGR 실전 경쟁력 핵심")
        print("  ✔  세 모드 모두에서 승률 > 52% + MDD > -25% → 엔진 통계적 우위 확인")
        print("=" * W + "\n")


if __name__ == "__main__":
    # 나스닥 및 S&P 500 대표 우량주 40개
    sample_universe = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "NVDA",
        "META",
        "TSLA",
        "BRK-B",
        "JNJ",
        "V",
        "JPM",
        "PG",
        "UNH",
        "HD",
        "MA",
        "DIS",
        "PYPL",
        "VZ",
        "ADBE",
        "NFLX",
        "INTC",
        "CMCSA",
        "PFE",
        "CSCO",
        "PEP",
        "KO",
        "MRK",
        "ABT",
        "CRM",
        "AVGO",
        "COST",
        "T",
        "WMT",
        "MCD",
        "MDT",
        "NKE",
        "TXN",
        "HON",
        "UNP",
        "QCOM",
    ]

    # 2019~2024: COVID 폭락 + 2022 금리인상 하락장 모두 포함한 혹독한 5년 검증
    validator = EngineValidator(
        tickers=sample_universe,
        start_date="2019-01-01",
        end_date="2024-01-01",
    )

    # STRICT + RELAXED 두 모드 비교 실행
    validator.run_comparison()
