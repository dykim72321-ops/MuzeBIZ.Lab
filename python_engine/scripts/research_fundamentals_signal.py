"""
research_fundamentals_signal.py — 실적 서프라이즈(EPS Surprise%)가 실적 발표 후
forward return을 예측하는지 과거 데이터로 검증하는 독립 리서치 스크립트.

배경: 2026-07-31 세션에서 DNA_Score(가격·거래량·기술적 지표) 무용론이 4중 검증
(백테스트 3회 + engine_decisions 실측)으로 확정됐다. 가격/거래량 축의 정보로는
예측력이 없다는 게 확인됐으니, 완전히 다른 축의 정보(펀더멘털)를 검증해본다.

라이브 엔진(paper_engine.py)을 전혀 건드리지 않는 읽기 전용 스크립트다 — 여기서
유의미한 신호가 확인되기 전까지는 매매 로직에 어떤 영향도 주지 않는다.

데이터 소스: yfinance.Ticker.get_earnings_dates() — Finnhub 무료 티어의
/calendar/earnings는 최근 1건만 반환해(히스토리 없음) 백테스트에 못 쓰지만,
yfinance는 실제 발표 시각(장 마감 후/개장 전 구분 가능)과 5년+ 서프라이즈% 이력을
무료로 제공한다. 발표 "시각"이 있어야 반응이 시작되는 거래일을 정확히 잡을 수
있어(장마감 후 발표면 다음 거래일 시가부터, 장전 발표면 당일 시가부터)
look-ahead bias를 피할 수 있다 — 분기 종료일(period)만 있는 데이터로는 이 구분이
불가능하다.

같은 44종목 유니버스(backtest_harness/run_comparison.py)를 재사용해 기존 DNA_Score
백테스트와 비교 가능하게 한다. 표본을 날짜 기준 절반으로 쪼개 각 구간에서 상관관계가
재현되는지 확인한다 — 2026-07-25 PF 탐색이 마지막에 별도 기간 OOS에서 재현 실패로
기각됐던 실수를 반복하지 않기 위함이다.

2026-08-01 추가: EPS 서프라이즈%의 효과가 약하고(|spearman_r|~0.07~0.10) 절반 구간에서만
유의해(전반부 p=0.234, 후반부 p=0.004) 재현성이 불안정하다는 결론이 나온 뒤, 같은
방법론으로 매출 성장률(YoY Revenue Growth)을 검증하는 --feature revenue_growth 모드를
추가했다. 매출 데이터는 Finnhub의 /stock/financials-reported를 쓴다 — 이 엔드포인트는
(다른 Finnhub 무료 엔드포인트인 /calendar/earnings와 달리) 실제 SEC 제출 이력을
그대로 반환해 10년 이상의 분기별 매출을 제공하고, acceptedDate(SEC 접수 시각, 분 단위)가
있어 발표 시점을 정확히 잡을 수 있다.

실행:
  python_engine/.venv/bin/python scripts/research_fundamentals_signal.py
  python_engine/.venv/bin/python scripts/research_fundamentals_signal.py --tickers AAPL,MSFT
  python_engine/.venv/bin/python scripts/research_fundamentals_signal.py --feature revenue_growth
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

CACHE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "_cache_fundamentals"
)
os.makedirs(CACHE_DIR, exist_ok=True)

HORIZONS_TRADING_DAYS = [1, 5, 20]
EARNINGS_LIMIT = 40  # yfinance 요청당 반환 개수 상한(대략 10년치 분기 실적)


def _get_universe() -> list[str]:
    from backtest_harness.run_comparison import UNIVERSE

    return UNIVERSE


def fetch_price_history(ticker: str) -> pd.DataFrame:
    cache_path = os.path.join(CACHE_DIR, f"{ticker}_price.pkl")
    if os.path.exists(cache_path):
        return pd.read_pickle(cache_path)
    df = yf.download(ticker, period="10y", progress=False, auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna()
    df.to_pickle(cache_path)
    return df


def fetch_earnings_events(ticker: str) -> pd.DataFrame:
    cache_path = os.path.join(CACHE_DIR, f"{ticker}_earnings.pkl")
    if os.path.exists(cache_path):
        return pd.read_pickle(cache_path)
    t = yf.Ticker(ticker)
    df = t.get_earnings_dates(limit=EARNINGS_LIMIT)
    if df is None:
        df = pd.DataFrame()
    df.to_pickle(cache_path)
    return df


REVENUE_CONCEPT_KEYWORDS = (
    "revenuefromcontractwithcustomer",
    "revenues",
    "totalrevenues",
)


def _extract_revenue(report: dict) -> float | None:
    """Finnhub financials-reported의 ic(손익계산서) 항목에서 매출 라인을 찾는다.

    회사마다 us-gaap concept 이름이 조금씩 다르므로(RevenueFromContractWithCustomer
    ExcludingAssessedTax/IncludingAssessedTax, Revenues, SalesRevenueNet 등) 키워드
    포함 여부로 매칭한다."""
    for row in report.get("ic", []):
        concept = str(row.get("concept", "")).lower()
        if any(k in concept for k in REVENUE_CONCEPT_KEYWORDS):
            val = row.get("value")
            if val:
                return float(val)
    return None


def fetch_revenue_filings(ticker: str) -> pd.DataFrame:
    """Finnhub /stock/financials-reported에서 분기별 매출과 SEC 접수 시각을 가져온다.

    yfinance quarterly_financials는 최근 4~5개 분기만 노출해(Yahoo 공개 API 제약)
    다년치 백테스트에 못 쓴다 — 이 엔드포인트는 실제 SEC 제출 이력이라 10년+ 깊이를
    무료로 제공하고, acceptedDate(분 단위)로 정확한 발표 시점을 잡을 수 있다."""
    cache_path = os.path.join(CACHE_DIR, f"{ticker}_revenue.pkl")
    if os.path.exists(cache_path):
        return pd.read_pickle(cache_path)
    if not FINNHUB_API_KEY:
        raise RuntimeError("FINNHUB_API_KEY가 설정되지 않았습니다 (.env 확인)")

    resp = requests.get(
        "https://finnhub.io/api/v1/stock/financials-reported",
        params={"symbol": ticker, "freq": "quarterly", "token": FINNHUB_API_KEY},
        timeout=15,
    )
    time.sleep(1.1)  # 무료 티어 분당 60콜 한도 준수
    rows = []
    if resp.status_code == 200:
        for filing in resp.json().get("data", []):
            revenue = _extract_revenue(filing.get("report", {}))
            if revenue is None:
                continue
            rows.append(
                {
                    "year": filing["year"],
                    "quarter": filing["quarter"],
                    "accepted_ts": pd.Timestamp(filing["acceptedDate"]),
                    "revenue": revenue,
                }
            )
    df = pd.DataFrame(rows)
    df.to_pickle(cache_path)
    return df


def _reaction_trading_day(
    report_ts: pd.Timestamp, trading_days: pd.DatetimeIndex
) -> pd.Timestamp | None:
    """발표 시각 기준 반응이 시작되는 거래일을 찾는다.

    yfinance의 Earnings Date 시각은 사업소 현지시간(대개 16:00=장마감 후,
    07:00~09:00=장 시작 전)으로 기록된다. Finnhub의 acceptedDate(SEC 접수 시각)는
    tz 정보가 없는 대신 대개 06:00 전후(개장 전)로 찍힌다. 장마감 후 발표는 다음
    거래일부터, 개장 전 발표는 당일부터 시장이 반응한다고 본다."""
    report_ts_naive = report_ts.tz_localize(None) if report_ts.tzinfo else report_ts
    report_date = report_ts_naive.normalize()
    is_after_close = report_ts.hour >= 16
    candidates = trading_days[trading_days >= report_date]
    if len(candidates) == 0:
        return None
    if is_after_close and candidates[0] == report_date:
        candidates = candidates[1:]
        if len(candidates) == 0:
            return None
    return candidates[0]


def build_event_dataset(tickers: list[str]) -> pd.DataFrame:
    import ta

    records = []
    for ticker in tickers:
        try:
            price_df = fetch_price_history(ticker)
            earnings_df = fetch_earnings_events(ticker)
        except Exception as e:
            print(f"⚠️ {ticker}: 데이터 조회 실패 ({e}) — 스킵")
            continue
        if price_df.empty or earnings_df.empty:
            continue
        if "Surprise(%)" not in earnings_df.columns:
            continue

        trading_days = price_df.index
        # 2026-08-01 복합 모델 검증용: 발표 시점의 RSI-14(일봉)도 같이 기록한다.
        # 개별 라이브 엔진(1분봉)의 RSI와는 타임프레임이 다른 완전히 별개 계산이다 —
        # "일봉 실적 이벤트 컨텍스트에서 RSI가 forward return과 관계있는가"만 본다.
        rsi_series = ta.momentum.RSIIndicator(price_df["Close"], window=14).rsi()

        for report_ts, row in earnings_df.iterrows():
            surprise_pct = row.get("Surprise(%)")
            if pd.isna(surprise_pct):
                continue  # 아직 발표 안 된(미래) 행

            reaction_day = _reaction_trading_day(report_ts, trading_days)
            if reaction_day is None or reaction_day not in price_df.index:
                continue
            reaction_idx = trading_days.get_loc(reaction_day)
            base_price = float(price_df.iloc[reaction_idx]["Open"])
            if base_price <= 0:
                continue
            # entry는 reaction_day의 "시가"인데 RSI를 reaction_day의 종가로 계산하면
            # 실제로는 아직 모르는 그날 오후 정보가 섞여 들어간다(look-ahead) — 전날
            # 종가 기준 RSI만 진입 시점에 실제로 알 수 있는 값이다.
            rsi_idx = reaction_idx - 1
            rsi_val = rsi_series.iloc[rsi_idx] if rsi_idx >= 0 else None

            rec = {
                "ticker": ticker,
                "report_ts": report_ts,
                "reaction_day": reaction_day,
                "surprise_pct": float(surprise_pct),
                "rsi_14": float(rsi_val) if pd.notna(rsi_val) else None,
            }
            for h in HORIZONS_TRADING_DAYS:
                target_idx = reaction_idx + h
                if target_idx >= len(price_df):
                    rec[f"fwd_ret_{h}d"] = np.nan
                    continue
                target_price = float(price_df.iloc[target_idx]["Close"])
                rec[f"fwd_ret_{h}d"] = round((target_price / base_price - 1) * 100, 3)
            records.append(rec)

    return pd.DataFrame(records)


def build_revenue_growth_dataset(tickers: list[str]) -> pd.DataFrame:
    """분기별 매출 YoY 성장률(같은 회계분기 전년 대비)과 forward return을 매칭한다."""
    records = []
    for ticker in tickers:
        try:
            price_df = fetch_price_history(ticker)
            rev_df = fetch_revenue_filings(ticker)
        except Exception as e:
            print(f"⚠️ {ticker}: 데이터 조회 실패 ({e}) — 스킵")
            continue
        if price_df.empty or rev_df.empty:
            continue

        trading_days = price_df.index
        rev_by_yq = {
            (r["year"], r["quarter"]): r["revenue"] for _, r in rev_df.iterrows()
        }

        for _, row in rev_df.iterrows():
            prior_revenue = rev_by_yq.get((row["year"] - 1, row["quarter"]))
            if not prior_revenue or prior_revenue <= 0:
                continue
            revenue_growth_pct = (row["revenue"] / prior_revenue - 1) * 100

            report_ts = row["accepted_ts"]
            reaction_day = _reaction_trading_day(report_ts, trading_days)
            if reaction_day is None or reaction_day not in price_df.index:
                continue
            reaction_idx = trading_days.get_loc(reaction_day)
            base_price = float(price_df.iloc[reaction_idx]["Open"])
            if base_price <= 0:
                continue

            rec = {
                "ticker": ticker,
                "report_ts": report_ts,
                "reaction_day": reaction_day,
                "revenue_growth_pct": round(float(revenue_growth_pct), 3),
            }
            for h in HORIZONS_TRADING_DAYS:
                target_idx = reaction_idx + h
                if target_idx >= len(price_df):
                    rec[f"fwd_ret_{h}d"] = np.nan
                    continue
                target_price = float(price_df.iloc[target_idx]["Close"])
                rec[f"fwd_ret_{h}d"] = round((target_price / base_price - 1) * 100, 3)
            records.append(rec)

    return pd.DataFrame(records)


COMPOSITE_FEATURES = ["surprise_pct", "revenue_growth_pct", "rsi_14"]


def build_composite_dataset(tickers: list[str]) -> pd.DataFrame:
    """EPS 서프라이즈%·매출 YoY 성장률·RSI-14(일봉) 세 피처를 종목·시점 기준으로
    병합한다. 개별로는 6번 다 약했던 피처들이 "동시에 같은 방향을 가리킬 때"는
    더 강한 신호가 되는지 검증하기 위함 — 단일 피처 검증보다 표본이 훨씬 줄어드는
    대가가 있다(세 데이터 소스가 전부 갖춰진 이벤트만 남으므로)."""
    eps_df = build_event_dataset(tickers)
    rev_df = build_revenue_growth_dataset(tickers)
    if eps_df.empty or rev_df.empty:
        return pd.DataFrame()

    merged_rows = []
    for ticker in eps_df["ticker"].unique():
        eps_sub = eps_df[eps_df["ticker"] == ticker].sort_values("reaction_day")
        rev_sub = rev_df[rev_df["ticker"] == ticker].sort_values("reaction_day")
        if rev_sub.empty:
            continue
        for _, eps_row in eps_sub.iterrows():
            # 같은 분기 실적의 EPS 발표일과 10-Q/10-K 제출일은 며칠 차이가 날 수 있어
            # 45일 이내 가장 가까운 매출 성장률 행을 매칭한다.
            deltas = (rev_sub["reaction_day"] - eps_row["reaction_day"]).abs()
            if deltas.min() > pd.Timedelta(days=45):
                continue
            rev_row = rev_sub.loc[deltas.idxmin()]
            rec = {
                "ticker": ticker,
                "reaction_day": eps_row["reaction_day"],
                "surprise_pct": eps_row["surprise_pct"],
                "revenue_growth_pct": rev_row["revenue_growth_pct"],
                "rsi_14": eps_row["rsi_14"],
            }
            for h in HORIZONS_TRADING_DAYS:
                rec[f"fwd_ret_{h}d"] = eps_row[f"fwd_ret_{h}d"]
            merged_rows.append(rec)

    return pd.DataFrame(merged_rows)


def analyze_composite(df: pd.DataFrame, label: str) -> None:
    """세 피처 각각의 방향(spearman 부호)을 데이터로 판정한 뒤, 세 피처가 전부
    "그 방향으로 유리한" 3분위에 동시에 들어가는 이벤트가 실제로 더 좋은 forward
    return을 내는지 확인한다. 방향을 가정하지 않고 그때그때 데이터로 판정하는
    이유: 앞서 대형주/소형주 유니버스에서 EPS 서프라이즈 방향 자체가 뒤집혔던 걸
    이미 확인했기 때문 — 고정된 가정은 위험하다."""
    from scipy import stats

    print(f"\n{'─'*90}\n  {label} (n={len(df)})\n{'─'*90}")
    df = df.dropna(subset=COMPOSITE_FEATURES + ["fwd_ret_5d"])
    if len(df) < 15:
        print(f"  표본 부족 (n={len(df)}, <15) — 스킵")
        return

    directions = {}
    for feat in COMPOSITE_FEATURES:
        r, p = stats.spearmanr(df[feat], df["fwd_ret_5d"])
        directions[feat] = 1 if r >= 0 else -1
        print(
            f"  {feat:20s} 단독 spearman r={r:+.3f} (p={p:.4f}) → 유리 방향: "
            f"{'상위' if directions[feat] > 0 else '하위'} 3분위"
        )

    df = df.copy()
    agree_count = pd.Series(0, index=df.index)
    for feat in COMPOSITE_FEATURES:
        tercile = pd.qcut(df[feat], 3, labels=[-1, 0, 1], duplicates="drop")
        tercile = tercile.astype(int)
        is_favorable = (
            (tercile == directions[feat]) if directions[feat] > 0 else (tercile == -1)
        )
        agree_count += is_favorable.astype(int)
    df["agree_count"] = agree_count

    print(f"\n  3개 피처 중 '유리한 방향' 3분위 일치 개수별 fwd_ret_5d:")
    grp = df.groupby("agree_count")["fwd_ret_5d"].agg(["count", "mean", "median"])
    grp["winrate_%"] = df.groupby("agree_count")["fwd_ret_5d"].apply(
        lambda s: (s > 0).mean() * 100
    )
    print(grp.to_string())

    r, p = stats.spearmanr(df["agree_count"], df["fwd_ret_5d"])
    print(f"\n  agree_count vs fwd_ret_5d: spearman r={r:+.3f} (p={p:.4f})")

    all3 = df[df["agree_count"] == 3]["fwd_ret_5d"]
    rest = df[df["agree_count"] < 3]["fwd_ret_5d"]
    if len(all3) >= 5 and len(rest) >= 5:
        u_stat, u_p = stats.mannwhitneyu(all3, rest, alternative="greater")
        print(
            f"  3개 전부 일치(n={len(all3)}, mean={all3.mean():+.2f}%) vs 나머지"
            f"(n={len(rest)}, mean={rest.mean():+.2f}%) Mann-Whitney U p={u_p:.4f}"
        )


def analyze_correlation(
    df: pd.DataFrame, label: str, feature_col: str = "surprise_pct"
) -> None:
    from scipy import stats

    print(f"\n{'─'*90}\n  {label} (n={len(df)})\n{'─'*90}")
    if len(df) < 5:
        print("  표본 부족 (n<5) — 스킵")
        return

    for h in HORIZONS_TRADING_DAYS:
        col = f"fwd_ret_{h}d"
        pair = df[[feature_col, col]].dropna()
        if len(pair) < 5:
            print(f"  {col}: 표본 부족(n={len(pair)})")
            continue
        pear_r, pear_p = stats.pearsonr(pair[feature_col], pair[col])
        spear_r, spear_p = stats.spearmanr(pair[feature_col], pair[col])
        print(
            f"  {col:12s} | n={len(pair):4d} | pearson_r={pear_r:+.3f} (p={pear_p:.4f}) "
            f"| spearman_r={spear_r:+.3f} (p={spear_p:.4f})"
        )

    print(f"\n  {feature_col} 5분위 구간별 fwd_ret_5d:")
    try:
        df = df.copy()
        df["quintile"] = pd.qcut(df[feature_col], 5, duplicates="drop")
        grp = df.groupby("quintile", observed=True)["fwd_ret_5d"].agg(
            ["count", "mean", "median"]
        )
        grp["winrate_%"] = df.groupby("quintile", observed=True)["fwd_ret_5d"].apply(
            lambda s: (s > 0).mean() * 100
        )
        print(grp.to_string())
    except Exception as e:
        print(f"  (5분위 분석 실패: {e})")


FEATURE_CONFIG = {
    "eps_surprise": {
        "label": "실적 서프라이즈(EPS Surprise%)",
        "col": "surprise_pct",
        "builder": build_event_dataset,
        "out_name": "fundamentals_signal_events_eps_surprise.csv",
    },
    "revenue_growth": {
        "label": "매출 YoY 성장률(Revenue Growth%)",
        "col": "revenue_growth_pct",
        "builder": build_revenue_growth_dataset,
        "out_name": "fundamentals_signal_events_revenue_growth.csv",
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tickers",
        type=str,
        default=None,
        help="쉼표로 구분된 티커 목록 (기본: 44종목 유니버스)",
    )
    parser.add_argument(
        "--feature",
        choices=list(FEATURE_CONFIG.keys()) + ["composite"],
        default="eps_surprise",
        help="검증할 피처 (기본: eps_surprise, composite=EPS서프라이즈+매출성장+RSI 복합)",
    )
    args = parser.parse_args()

    tickers = (
        [t.strip().upper() for t in args.tickers.split(",")]
        if args.tickers
        else _get_universe()
    )

    if args.feature == "composite":
        print("=" * 90)
        print(
            "  📊 복합 모델(EPS 서프라이즈 + 매출 YoY 성장률 + RSI-14) → Forward Return 검증"
        )
        print("=" * 90)
        print(f"  유니버스: {len(tickers)}종목")

        df = build_composite_dataset(tickers)
        if df.empty:
            print("⚠️ 세 데이터 소스가 모두 갖춰진 이벤트가 없습니다.")
            return
        df = df.sort_values("reaction_day").reset_index(drop=True)
        print(
            f"\n세 피처가 모두 매칭된 이벤트 {len(df)}건 수집 완료 "
            f"({df['reaction_day'].min().date()} ~ {df['reaction_day'].max().date()})"
        )

        analyze_composite(df, "전체 기간")
        median_day = df["reaction_day"].median()
        analyze_composite(
            df[df["reaction_day"] < median_day], f"전반부 (~ {median_day.date()})"
        )
        analyze_composite(
            df[df["reaction_day"] >= median_day], f"후반부 ({median_day.date()} ~)"
        )

        out_path = os.path.join(
            CACHE_DIR, "..", "fundamentals_signal_events_composite.csv"
        )
        df.to_csv(out_path, index=False)
        print(f"\n원본 이벤트 데이터 저장: {out_path}")
        return

    cfg = FEATURE_CONFIG[args.feature]
    feature_col = cfg["col"]

    print("=" * 90)
    print(f"  📊 {cfg['label']} → Forward Return 예측력 검증")
    print("=" * 90)
    print(f"  유니버스: {len(tickers)}종목")

    df = cfg["builder"](tickers)
    if df.empty:
        print("⚠️ 수집된 이벤트가 없습니다.")
        return

    df = df.sort_values("report_ts").reset_index(drop=True)
    print(
        f"\n총 {len(df)}건의 이벤트 수집 완료 "
        f"({df['report_ts'].min().date()} ~ {df['report_ts'].max().date()})"
    )

    analyze_correlation(df, "전체 기간", feature_col)

    # 재현성 검증: 날짜 기준 절반으로 쪼개 각 구간에서 신호가 재현되는지 확인
    # (2026-07-25 PF 탐색이 이 검증 없이 진행했다가 마지막에 별도 기간 OOS에서
    # 기각된 실수를 반복하지 않기 위함 — project_pf_search_20260725 메모리 참고)
    median_ts = df["report_ts"].median()
    first_half = df[df["report_ts"] < median_ts]
    second_half = df[df["report_ts"] >= median_ts]
    analyze_correlation(first_half, f"전반부 (~ {median_ts.date()})", feature_col)
    analyze_correlation(second_half, f"후반부 ({median_ts.date()} ~)", feature_col)

    print(
        "\n해석 가이드: 전체 기간에서 유의(|r|>=0.1, p<0.05)해도 전반부/후반부 "
        "양쪽에서 방향과 유의성이 재현되지 않으면 신뢰하면 안 된다 — 특정 기간의 "
        "시장 국면에 우연히 맞았을 뿐일 가능성이 크다."
    )

    out_path = os.path.join(CACHE_DIR, "..", cfg["out_name"])
    df.to_csv(out_path, index=False)
    print(f"\n원본 이벤트 데이터 저장: {out_path}")


if __name__ == "__main__":
    main()
