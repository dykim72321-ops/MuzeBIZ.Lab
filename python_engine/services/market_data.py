"""
market_data.py — Market Data Caching & Validation

main.py에서 분리된 시장 데이터 관리 클래스:
  - TickerDataState: 실시간 1분봉 데이터 인메모리 캐싱
  - MTFCache: 15분봉 20 EMA 백그라운드 캐싱
  - MomentumValidator: 진입 전 RVOL 및 상위 추세 검증

다른 모듈에서의 import 예시:
  from services.market_data import TickerDataState, MTFCache, MomentumValidator
"""

from __future__ import annotations

import asyncio
import os
from typing import Dict, List, Optional

import pandas as pd
import ta
import yfinance as yf
from alpaca.data.enums import DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.timeframe import TimeFrame


# ── TickerDataState ──────────────────────────────────────────────────────────


class TickerDataState:
    """실시간 지표 계산을 위한 1분봉 히스토리 유지 클래스"""

    def __init__(self, max_bars: int = 150):
        self.max_bars = max_bars
        self.history: Dict[str, pd.DataFrame] = {}
        self.volume_multiplier: Dict[str, float] = {}
        self.avg_daily_volume: Dict[str, float] = {}

    def update(self, ticker: str, bar) -> pd.DataFrame:
        raw_vol = float(bar.volume)
        multiplier = self.volume_multiplier.get(ticker, 1.0)
        calibrated_vol = raw_vol * multiplier

        new_row = {
            "Open": float(bar.open),
            "High": float(bar.high),
            "Low": float(bar.low),
            "Close": float(bar.close),
            "Volume": calibrated_vol,
            "_raw_iex_volume": raw_vol,
        }
        df_new = pd.DataFrame(
            [new_row], index=[pd.to_datetime(bar.timestamp, utc=True)]
        )

        if ticker not in self.history:
            self.history[ticker] = df_new
        else:
            if df_new.index[0] in self.history[ticker].index:
                self.history[ticker] = self.history[ticker].drop(index=df_new.index[0])
            self.history[ticker] = pd.concat([self.history[ticker], df_new])

            if len(self.history[ticker]) > self.max_bars:
                self.history[ticker] = self.history[ticker].iloc[-self.max_bars :]

        return self.history[ticker]

    async def warm_up(self, tickers: List[str]):
        """시스템 시작 시 최근 1분봉 100개를 Alpaca에서 가져와 채우고
        yfinance 전일 총거래량과의 비율로 Volume Multiplier 계산"""
        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")

        if api_key and api_secret:
            try:
                from alpaca.data.requests import StockBarsRequest

                client = StockHistoricalDataClient(api_key, api_secret)
                for ticker in tickers:
                    request_params = StockBarsRequest(
                        symbol_or_symbols=ticker,
                        timeframe=TimeFrame.Minute,
                        limit=self.max_bars,
                        feed=DataFeed.IEX,
                    )
                    bars = await asyncio.to_thread(
                        client.get_stock_bars, request_params
                    )
                    df = bars.df
                    if not df.empty:
                        if isinstance(df.index, pd.MultiIndex):
                            df = df.xs(ticker, level=0)
                        df = df[["open", "high", "low", "close", "volume"]].rename(
                            columns={
                                "open": "Open",
                                "high": "High",
                                "low": "Low",
                                "close": "Close",
                                "volume": "Volume",
                            }
                        )

                        try:
                            iex_total_vol = df["Volume"].sum()
                            tk = yf.Ticker(ticker)
                            yf_hist = await asyncio.to_thread(
                                tk.history, period="1d", interval="1m"
                            )
                            yf_total_vol = (
                                yf_hist["Volume"].sum() if not yf_hist.empty else 0
                            )
                            if iex_total_vol > 0 and yf_total_vol > 0:
                                multiplier = min(yf_total_vol / iex_total_vol, 20.0)
                                self.volume_multiplier[ticker] = multiplier
                                df["Volume"] = df["Volume"] * multiplier
                                print(
                                    f"📊 [VolMul] {ticker}: {multiplier:.1f}x calibrated (IEX→Full Market)"
                                )
                            else:
                                self.volume_multiplier[ticker] = 1.0
                                print(
                                    f"⚠️ [VolMul] {ticker}: calibration skipped (vol=0), using 1.0x"
                                )
                        except Exception as e:
                            self.volume_multiplier[ticker] = 1.0
                            print(f"⚠️ [VolMul] {ticker}: calibration error: {e}")

                        if isinstance(df.index, pd.DatetimeIndex):
                            if df.index.tz is not None:
                                df.index = df.index.tz_convert("UTC")
                            else:
                                df.index = df.index.tz_localize("UTC")
                        self.history[ticker] = df
                        print(
                            f"✅ [Alpaca/IEX] {ticker} warmed up ({len(df)} bars, data_source=alpaca_iex)."
                        )
                if len(self.history) >= len(tickers):
                    pass
            except Exception as e:
                print(f"⚠️ Alpaca warm-up interrupted: {e}")

        print("🌐 [Warm-up] Falling back to yfinance (1m interval)...")
        for ticker in tickers:
            if ticker in self.history and len(self.history[ticker]) >= 35:
                continue
            try:
                tk = yf.Ticker(ticker)
                df = await asyncio.to_thread(tk.history, period="5d", interval="1m")
                if not df.empty:
                    df = df.tail(self.max_bars)
                    if isinstance(df.index, pd.DatetimeIndex):
                        if df.index.tz is not None:
                            df.index = df.index.tz_convert("UTC")
                        else:
                            df.index = df.index.tz_localize("UTC")
                    self.history[ticker] = df
                    self.volume_multiplier[ticker] = 1.0
                    print(
                        f"✅ [yfinance] {ticker} warmed up (data_source=yfinance_1m)."
                    )
            except Exception as e:
                print(f"⚠️ {ticker} yfinance warm-up failed: {e}")

        print("📊 [Warm-up] Fetching 30d avg daily volume for RVOL correction...")
        for ticker in tickers:
            if ticker in self.avg_daily_volume:
                continue
            try:
                tk = yf.Ticker(ticker)
                daily = await asyncio.to_thread(tk.history, period="30d", interval="1d")
                if not daily.empty:
                    self.avg_daily_volume[ticker] = float(daily["Volume"].mean())
                    print(
                        f"📈 [AvgVol] {ticker}: {self.avg_daily_volume[ticker]:,.0f} avg daily shares"
                    )
            except Exception as e:
                print(f"⚠️ [AvgVol] {ticker}: {e}")


# ── MTF Cache ────────────────────────────────────────────────────────────────


class MTFCache:
    """15분봉 20 EMA 값을 백그라운드에서 주기적으로 캐싱하는 클래스"""

    def __init__(self):
        self.ema_15m_20: Dict[str, float] = {}

    async def update_cache(self, tickers: List[str]):
        """yfinance를 통해 15분봉 20 EMA 계산 및 갱신 (15분 스케줄러용)"""
        if not tickers:
            return

        print(f"🔄 [MTF Cache] Updating 15m 20 EMA for {len(tickers)} tickers...")

        batch_str = " ".join(tickers)
        try:
            df_15m = await asyncio.to_thread(
                yf.download,
                batch_str,
                period="5d",
                interval="15m",
                progress=False,
                threads=True,
            )

            if df_15m is None or df_15m.empty:
                return

            close_data = df_15m.get("Close")
            if close_data is None or close_data.empty:
                return

            if isinstance(close_data, pd.Series):
                ema_20 = ta.trend.EMAIndicator(close_data, window=20).ema_indicator()
                if not ema_20.empty and not pd.isna(ema_20.iloc[-1]):
                    self.ema_15m_20[tickers[0]] = float(ema_20.iloc[-1])
            else:
                for ticker in tickers:
                    if ticker in close_data.columns:
                        series = close_data[ticker].dropna()
                        if len(series) >= 20:
                            ema_20 = ta.trend.EMAIndicator(
                                series, window=20
                            ).ema_indicator()
                            if not ema_20.empty and not pd.isna(ema_20.iloc[-1]):
                                self.ema_15m_20[ticker] = float(ema_20.iloc[-1])

            print("✅ [MTF Cache] 15m 20 EMA update complete.")
        except Exception as e:
            print(f"⚠️ [MTF Cache] Update failed: {e}")

    def get_15m_ema(self, ticker: str) -> Optional[float]:
        return self.ema_15m_20.get(ticker)


# ── Momentum Validator ───────────────────────────────────────────────────────


class MomentumValidator:
    """진입 전 거래량과 상위 추세를 검증하는 인터셉터"""

    def __init__(self, mtf_cache: MTFCache, rvol_threshold: float = 3.0):
        self.mtf_cache = mtf_cache
        self.rvol_threshold = rvol_threshold

    def validate(
        self, ticker: str, current_price: float, rvol: float
    ) -> tuple[bool, str]:
        # 1. RVOL 검증
        if rvol < self.rvol_threshold:
            return (
                False,
                f"RVOL 부족 (현재: {rvol:.1f}x < 기준: {self.rvol_threshold}x)",
            )

        # 2. MTF (15분봉 20 EMA) 검증
        ema_15m = self.mtf_cache.get_15m_ema(ticker)
        if ema_15m is not None:
            if current_price < ema_15m:
                return (
                    False,
                    f"상위 추세 하락 (현재가 ${current_price:.4f} < 15m EMA ${ema_15m:.4f})",
                )
        else:
            print(f"⚠️ [Interceptor] {ticker} MTF 캐시 없음 — 검증 스킵")
            return True, "MTF 캐시 없음 (검증 스킵)"

        return True, "검증 통과"
