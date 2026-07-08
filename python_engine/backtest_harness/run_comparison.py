"""
run_comparison.py — OLD(9e52902 이전, 검증된 기존 로직) vs NEW(현재 저장소, 이번 세션
수정 반영 완료) 실거래 로직 대조 백테스트.

기존 portfolio_backtester.py는 RSI2 평균회귀 기반의 완전히 별개 전략(CLAUDE.md에 명시)이라
이번 세션에서 손댄 calculate_advanced_signals / calculate_dynamic_kelly /
update_reversible_trailing_stop 를 전혀 검증하지 못한다. 이 스크립트는 실제 그 함수들을
import해서 동일한 가격 데이터에 대해 OLD/NEW 두 버전을 나란히 시뮬레이션한다.

일봉 기준 근사 시뮬레이션이다 (yfinance로 장기 분봉 확보 불가) — Time-Decay/EOD 청산처럼
분봉 전용 로직은 제외하고, 신호 생성·포지션 사이징·트레일링 스탑·Scale-Out만 재현한다.
"""

from __future__ import annotations

import sys
import os
import json
import numpy as np
import pandas as pd
import ta
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from paper_engine import (
    INITIAL_CAPITAL,
    MIN_BUY_BUDGET,
    MAX_BUY_BUDGET,
    MAX_CONCURRENT_POSITIONS,
    MAX_CONCENTRATION_PCT,
    TS_INIT_PCT,
    TS_TRAIL_PCT,
    PENNY_TS_INIT_PCT,
    PENNY_TS_TRAIL_PCT,
    PENNY_BREAKEVEN_TRIGGER,
    PENNY_MAX_PRICE,
    PENNY_SCALE_OUT_RSI,
    PENNY_SCALE_OUT_PROFIT,
    PENNY_TIGHT_TS_PCT,
    SCALE_OUT_RATIO,
    SCALE_OUT_TS_PCT,
    CHANDELIER_K_NORMAL,
    CHANDELIER_K_PENNY,
    _apply_slippage,
    update_reversible_trailing_stop,  # NEW
    calculate_dynamic_kelly,  # NEW
)
from services.quant_engine import (
    calculate_advanced_signals as new_calculate_advanced_signals,
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from old_quant_engine import (
    calculate_advanced_signals as old_calculate_advanced_signals,
)

KELLY_FRACTION_OLD = 0.15  # 삭제된 옛 상수 (9e52902 이전 고정값)
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

UNIVERSE = [
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
    "TLRY",
    "SNDL",
    "NIO",
    "XPEV",
]
START_DATE = "2022-01-01"
END_DATE = "2024-06-01"


def fetch_ticker(ticker: str) -> pd.DataFrame:
    cache_path = os.path.join(CACHE_DIR, f"{ticker}.pkl")
    if os.path.exists(cache_path):
        return pd.read_pickle(cache_path)
    df = yf.download(
        ticker, start=START_DATE, end=END_DATE, progress=False, auto_adjust=True
    )
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna()
    df.to_pickle(cache_path)
    return df


def old_update_ts(entry_price, highest_price, ts_threshold, atr, is_penny, price):
    """9e52902 이전(검증된 원본) 트레일링 스탑 로직 그대로 재현."""
    floor = entry_price * (PENNY_TS_INIT_PCT if is_penny else TS_INIT_PCT)
    if atr > 0:
        k = CHANDELIER_K_PENNY if is_penny else CHANDELIER_K_NORMAL
        new_ts = max(floor, highest_price - k * atr)
    else:
        trail_pct = PENNY_TS_TRAIL_PCT if is_penny else TS_TRAIL_PCT
        new_ts = highest_price * trail_pct
    if is_penny and price >= entry_price * PENNY_BREAKEVEN_TRIGGER:
        new_ts = max(new_ts, entry_price)
    return max(ts_threshold, new_ts)


def old_scaled_out_ts(entry_price, highest_price, ts_threshold, atr, is_penny):
    if is_penny:
        if atr > 0:
            new_ts = max(entry_price, highest_price - CHANDELIER_K_PENNY * atr * 0.6)
        else:
            new_ts = max(entry_price, highest_price * PENNY_TIGHT_TS_PCT)
    else:
        if atr > 0:
            new_ts = max(
                entry_price * SCALE_OUT_TS_PCT,
                highest_price - CHANDELIER_K_NORMAL * atr,
            )
        else:
            new_ts = max(entry_price * SCALE_OUT_TS_PCT, highest_price * TS_TRAIL_PCT)
    return max(ts_threshold, new_ts)


def new_scaled_out_ts(entry_price, highest_price, ts_threshold, atr, is_penny):
    if is_penny:
        if atr > 0:
            new_ts = max(entry_price, highest_price - CHANDELIER_K_PENNY * atr * 0.6)
        else:
            new_ts = max(entry_price, highest_price * PENNY_TIGHT_TS_PCT)
    else:
        if atr > 0:
            new_ts = max(entry_price * SCALE_OUT_TS_PCT, highest_price - 1.2 * atr)
        else:
            new_ts = max(entry_price * SCALE_OUT_TS_PCT, highest_price * TS_TRAIL_PCT)
    return max(ts_threshold, new_ts)


def prep_signals(df: pd.DataFrame, engine_fn) -> pd.DataFrame:
    d = df.copy()
    d = engine_fn(d)
    atr_ind = ta.volatility.AverageTrueRange(
        high=d["High"], low=d["Low"], close=d["Close"], window=14
    )
    d["ATR"] = atr_ind.average_true_range().fillna(0.0)
    return d


class Portfolio:
    def __init__(self, variant: str, sizing: str = None, stop: str = None):
        self.variant = variant  # "OLD" | "NEW"
        self.sizing = sizing or variant  # "OLD" | "NEW"
        self.stop = stop or variant  # "OLD" | "NEW"
        self.cash = INITIAL_CAPITAL
        self.positions = {}  # ticker -> dict
        self.closed_trades = []  # for NEW dynamic kelly rolling history
        self.equity_curve = []

    def invested(self):
        return sum(p["units"] * p["current_price"] for p in self.positions.values())

    def total_equity(self):
        return self.cash + self.invested()

    def try_enter(self, ticker, row, date):
        if ticker in self.positions:
            return
        if len(self.positions) >= MAX_CONCURRENT_POSITIONS:
            return
        total_equity = self.total_equity()
        invested = self.invested()
        if total_equity > 0 and (invested / total_equity) >= MAX_CONCENTRATION_PCT:
            return

        price = float(row["Close"])
        is_penny = price <= PENNY_MAX_PRICE
        atr = float(row["ATR"])

        if self.sizing == "OLD":
            frac = KELLY_FRACTION_OLD
        else:
            safe_atr = atr if atr > 0 else price * 0.02
            frac = calculate_dynamic_kelly(self.closed_trades, safe_atr, price)

        budget = min(self.cash * frac, MAX_BUY_BUDGET)
        if budget < MIN_BUY_BUDGET:
            return

        fill_price = _apply_slippage(price, is_buy=True, is_penny=is_penny)
        units = budget / fill_price
        ts_init = PENNY_TS_INIT_PCT if is_penny else TS_INIT_PCT

        self.cash -= budget
        self.positions[ticker] = {
            "entry_price": fill_price,
            "entry_date": date,
            "highest_price": fill_price,
            "current_price": fill_price,
            "ts_threshold": fill_price * ts_init,
            "units": units,
            "is_scaled_out": False,
            "is_penny": is_penny,
        }

    def update_and_check_exit(self, ticker, row):
        pos = self.positions.get(ticker)
        if pos is None:
            return
        high = float(row["High"])
        low = float(row["Low"])
        close = float(row["Close"])
        atr = float(row["ATR"])
        smoothed_er = float(row.get("smoothed_er", 0.5)) if self.stop == "NEW" else 0.5
        rsi = float(row["RSI"])
        entry_price = pos["entry_price"]
        is_penny = pos["is_penny"]

        pos["highest_price"] = max(pos["highest_price"], high)
        pos["current_price"] = close
        highest_price = pos["highest_price"]

        # A. TS 업데이트
        if not pos["is_scaled_out"]:
            if self.stop == "OLD":
                pos["ts_threshold"] = old_update_ts(
                    entry_price,
                    highest_price,
                    pos["ts_threshold"],
                    atr,
                    is_penny,
                    close,
                )
            else:
                effective_atr = atr if atr > 0 else entry_price * 0.02
                pos["ts_threshold"] = update_reversible_trailing_stop(
                    entry_price, highest_price, effective_atr, smoothed_er, is_penny
                )
        else:
            fn = old_scaled_out_ts if self.stop == "OLD" else new_scaled_out_ts
            pos["ts_threshold"] = fn(
                entry_price, highest_price, pos["ts_threshold"], atr, is_penny
            )

        # B. Scale-Out 체크 (미실행 상태에서만)
        profit_pct = close / entry_price - 1
        if not pos["is_scaled_out"]:
            if is_penny:
                scale_trigger = (
                    rsi > PENNY_SCALE_OUT_RSI and profit_pct >= 0.05
                ) or profit_pct >= PENNY_SCALE_OUT_PROFIT
            else:
                scale_trigger = rsi > 52 or profit_pct >= 0.07
            if scale_trigger and close > entry_price:
                sell_units = pos["units"] * SCALE_OUT_RATIO
                fill_price = _apply_slippage(close, is_buy=False, is_penny=is_penny)
                self.cash += sell_units * fill_price
                pos["units"] -= sell_units
                pos["is_scaled_out"] = True

        # C. TS 청산 체크 (당일 저가가 스탑 아래로 내려가면 스탑가에 체결된 것으로 근사)
        if low < pos["ts_threshold"]:
            exit_price = _apply_slippage(
                pos["ts_threshold"], is_buy=False, is_penny=is_penny
            )
            proceeds = pos["units"] * exit_price
            self.cash += proceeds
            pnl_pct = exit_price / entry_price - 1
            self.closed_trades.append({"pnl_pct": pnl_pct})
            del self.positions[ticker]


def run_variant(dfs: dict, variant: str, sizing: str = None, stop: str = None):
    pf = Portfolio(variant, sizing=sizing, stop=stop)
    all_dates = sorted(set().union(*[set(d.index) for d in dfs.values()]))
    for date in all_dates:
        for ticker, d in dfs.items():
            if date not in d.index:
                continue
            row = d.loc[date]
            if ticker in pf.positions:
                pf.update_and_check_exit(ticker, row)
        for ticker, d in dfs.items():
            if date not in d.index:
                continue
            row = d.loc[date]
            if bool(row["Strong_Buy"]) and ticker not in pf.positions:
                pf.try_enter(ticker, row, date)
        pf.equity_curve.append((date, pf.total_equity()))
    # 잔여 포지션 마감(마지막 종가 청산, 통계 왜곡 방지)
    for ticker in list(pf.positions.keys()):
        d = dfs[ticker]
        last_row = d.iloc[-1]
        pos = pf.positions[ticker]
        exit_price = _apply_slippage(
            float(last_row["Close"]), is_buy=False, is_penny=pos["is_penny"]
        )
        pf.cash += pos["units"] * exit_price
        pnl_pct = exit_price / pos["entry_price"] - 1
        pf.closed_trades.append({"pnl_pct": pnl_pct})
        del pf.positions[ticker]
    return pf


def compute_metrics(pf: Portfolio):
    trades = pf.closed_trades
    n = len(trades)
    if n == 0:
        return {"trades": 0}
    pnls = [t["pnl_pct"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    win_rate = len(wins) / n * 100
    profit_factor = (
        (sum(wins) / abs(sum(losses))) if losses and sum(losses) != 0 else float("inf")
    )
    equity = [e for _, e in pf.equity_curve]
    total_return = (equity[-1] / INITIAL_CAPITAL - 1) * 100 if equity else 0.0
    peak = -np.inf
    mdd = 0.0
    for e in equity:
        peak = max(peak, e)
        dd = (e - peak) / peak * 100
        mdd = min(mdd, dd)
    return {
        "trades": n,
        "win_rate": round(win_rate, 2),
        "profit_factor": (
            round(profit_factor, 3) if profit_factor != float("inf") else None
        ),
        "avg_pnl_pct": round(np.mean(pnls) * 100, 3),
        "total_return_pct": round(total_return, 2),
        "mdd_pct": round(mdd, 2),
        "final_equity": round(equity[-1], 2) if equity else INITIAL_CAPITAL,
    }


def main():
    print(
        f"▶ 데이터 다운로드/캐시 로드: {len(UNIVERSE)}개 종목 ({START_DATE} ~ {END_DATE})"
    )
    raw = {}
    for t in UNIVERSE:
        try:
            df = fetch_ticker(t)
            if len(df) > 60:
                raw[t] = df
        except Exception as e:
            print(f"  ⚠️ {t} 다운로드 실패: {e}")
    print(f"  → 사용 가능 {len(raw)}개 종목")

    print("▶ OLD 신호 계산 중 (9e52902 이전 로직)...")
    old_dfs = {
        t: prep_signals(d, old_calculate_advanced_signals) for t, d in raw.items()
    }
    print("▶ NEW 신호 계산 중 (현재 저장소 로직)...")
    new_dfs = {
        t: prep_signals(d, new_calculate_advanced_signals) for t, d in raw.items()
    }

    for t in raw:
        old_signals = int(old_dfs[t]["Strong_Buy"].sum())
        new_signals = int(new_dfs[t]["Strong_Buy"].sum())
        print(f"    {t}: OLD Strong_Buy={old_signals}, NEW Strong_Buy={new_signals}")

    # 신호(Strong_Buy)는 OLD/NEW 동일하므로 new_dfs 하나로 sizing/stop 조합만 바꿔가며
    # 어느 컴포넌트가 성과 차이를 만드는지 분해한다.
    combos = [
        ("OLD (기존 전체)", old_dfs, "OLD", "OLD", "OLD"),
        ("NEW 켈리만 (스탑=OLD)", new_dfs, "NEW", "NEW", "OLD"),
        ("NEW 스탑만 (켈리=OLD)", new_dfs, "NEW", "OLD", "NEW"),
        ("NEW (기존 전체)", new_dfs, "NEW", "NEW", "NEW"),
    ]
    results = {}
    for label, dfs, variant, sizing, stop in combos:
        print(f"▶ 시뮬레이션: {label}")
        pf = run_variant(dfs, variant, sizing=sizing, stop=stop)
        results[label] = compute_metrics(pf)

    print("\n" + "=" * 92)
    header = f"{'지표':<18}" + "".join(f"{label:>18}" for label, *_ in combos)
    print(header)
    print("=" * 92)
    for key in [
        "trades",
        "win_rate",
        "profit_factor",
        "avg_pnl_pct",
        "total_return_pct",
        "mdd_pct",
        "final_equity",
    ]:
        line = f"{key:<18}" + "".join(
            f"{str(results[label].get(key)):>18}" for label, *_ in combos
        )
        print(line)
    print("=" * 92)

    with open(os.path.join(CACHE_DIR, "..", "comparison_result.json"), "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
