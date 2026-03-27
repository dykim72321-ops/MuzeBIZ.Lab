import pandas as pd
import yfinance as yf
from portfolio_backtester import DNAValidator


def run_optimization():
    tickers = [
        "SOFI",
        "PLTR",
        "AMC",
        "GME",
        "NIO",
        "PGR",
        "HOOD",
        "AFRM",
        "UPST",
        "COIN",
        "MARA",
        "RIOT",
        "FSR",
        "NKLA",
        "LCID",
        "DKNG",
    ]

    # 그리드 서치 파라미터 구성 (확장)
    deviations = [-0.07, -0.08, -0.09, -0.10, -0.11, -0.12]
    targets = [3.0, 3.5, 4.0, 4.5, 5.0]

    results = []

    print("🚀 DNA 전략 최적화 그리드 서치 시작...")

    # 데이터는 한 번만 불러오고 전처리하기 위해 첫 번째 인스턴스 활용
    base_validator = DNAValidator(tickers=tickers)
    data = base_validator.fetch_data()
    preprocessed_base = base_validator.preprocess_data(data)

    # IWM 벤치마크 데이터 로드 (한 번만)
    benchmark_data = yf.download(
        "IWM", start=base_validator.start_date, end=base_validator.end_date
    )["Close"]

    for dev in deviations:
        for tgt in targets:
            print(f"| 테스트 중: Dev={dev}, Target={tgt} ATR")
            validator = DNAValidator(
                tickers=tickers, deviation_threshold=dev, target_atr=tgt
            )
            validator.benchmark_data = benchmark_data

            # 시뮬레이션 실행
            all_trades = []
            for ticker in tickers:
                if ticker in preprocessed_base:
                    trades = validator.simulate_ticker(
                        ticker, preprocessed_base[ticker]
                    )
                    if trades:
                        all_trades.extend(trades)

            # 결과 집계
            if not all_trades:
                results.append(
                    {
                        "dev": dev,
                        "target": tgt,
                        "avg_pnl": 0,
                        "win_rate": 0,
                        "trades": 0,
                        "pf": 0,
                    }
                )
                continue

            df_trades = pd.DataFrame(all_trades)
            avg_pnl = df_trades["pnl"].mean() * 100
            win_rate = (df_trades["result"] == "WIN").mean() * 100

            wins = df_trades[df_trades["pnl"] > 0]["pnl"].sum()
            losses = abs(df_trades[df_trades["pnl"] < 0]["pnl"].sum())
            pf = wins / losses if losses > 0 else 99.9

            results.append(
                {
                    "dev": dev,
                    "target": tgt,
                    "avg_pnl": avg_pnl,
                    "win_rate": win_rate,
                    "trades": len(all_trades),
                    "pf": pf,
                }
            )
            print(
                f"  └ 결과: PnL={avg_pnl:.2f}%, Win={win_rate:.1f}%, PF={pf:.2f}, Trades={len(all_trades)}"
            )

    # 결과 표 출력
    df_results = pd.DataFrame(results)
    df_results = df_results.sort_values(by="avg_pnl", ascending=False)

    print("\n" + "=" * 70)
    print("🏆 DNA 전략 최적화 결과 리포트 (평균 수익률 순)")
    print("=" * 70)
    print(df_results.to_string(index=False))
    print("=" * 70)

    best = df_results.iloc[0]
    print(f"\n✨ 최적의 조합 발견!")
    print(f"  - 이격도(Deviation): {best['dev']}")
    print(f"  - 목표가(Target): {best['target']} ATR")
    print(f"  - 기대 평균 수익률: {best['avg_pnl']:.2f}%")
    print(f"  - 승률: {best['win_rate']:.1f}%")
    print(f"  - 손익비 (PF): {best['pf']:.2f}")
    print(f"  - 총 거래 횟수: {int(best['trades'])}회")


if __name__ == "__main__":
    run_optimization()
