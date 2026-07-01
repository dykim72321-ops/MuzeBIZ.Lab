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
        # IEX 보정이 성공적으로 완료된 종목 — yfinance fallback이 덮어쓰지 않도록 보호
        self._iex_calibrated: set = set()
        # warm_up 시 IEX 보정에 실패한 종목 (yfinance fallback으로 채워진 경우)
        # → on_minute_bar_closed()에서 IEX 바 35개 이상 쌓이면 재보정 트리거
        self.needs_iex_calibration: set = set()

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
            from alpaca.data.requests import StockBarsRequest

            try:
                client = StockHistoricalDataClient(api_key, api_secret)
            except Exception as e:
                print(f"⚠️ Alpaca client init failed: {e}")
                client = None

            if client:
                for ticker in tickers:
                    try:
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

                            calibrated = False
                            try:
                                # UTC 정규화
                                if isinstance(df.index, pd.DatetimeIndex):
                                    if df.index.tz is not None:
                                        df.index = df.index.tz_convert("UTC")
                                    else:
                                        df.index = df.index.tz_localize("UTC")

                                tk = yf.Ticker(ticker)
                                yf_hist = await asyncio.to_thread(
                                    tk.history, period="1d", interval="1m"
                                )
                                if not yf_hist.empty:
                                    if yf_hist.index.tz is None:
                                        yf_hist.index = yf_hist.index.tz_localize("UTC")
                                    else:
                                        yf_hist.index = yf_hist.index.tz_convert("UTC")

                                    # IEX 바와 동일한 시간창의 yfinance 거래량만 비교
                                    t_start = df.index[0]
                                    t_end = df.index[-1]
                                    yf_window = yf_hist[
                                        (yf_hist.index >= t_start)
                                        & (yf_hist.index <= t_end)
                                    ]
                                    iex_total_vol = float(df["Volume"].sum())
                                    yf_window_vol = (
                                        float(yf_window["Volume"].sum())
                                        if not yf_window.empty
                                        else 0
                                    )

                                    if (
                                        iex_total_vol > 0
                                        and yf_window_vol > iex_total_vol
                                    ):
                                        # 봉 수가 적으면 노이즈가 크므로 상한을 낮게 제한
                                        bar_count = len(df)
                                        max_mul = 50.0 if bar_count >= 10 else 20.0
                                        multiplier = min(
                                            yf_window_vol / iex_total_vol, max_mul
                                        )
                                        self.volume_multiplier[ticker] = multiplier
                                        df["Volume"] = df["Volume"] * multiplier
                                        calibrated = True
                                        print(
                                            f"📊 [VolMul] {ticker}: {multiplier:.1f}x calibrated "
                                            f"(IEX {iex_total_vol:,.0f} → Full {yf_window_vol:,.0f}, {bar_count}봉)"
                                        )
                                    else:
                                        self.volume_multiplier[ticker] = 1.0
                                        self.needs_iex_calibration.add(ticker)
                                        print(
                                            f"⏳ [VolMul] {ticker}: 보정 데이터 부족 → lazy 재보정 예약"
                                        )
                                else:
                                    self.volume_multiplier[ticker] = 1.0
                                    self.needs_iex_calibration.add(ticker)
                                    print(
                                        f"⏳ [VolMul] {ticker}: yfinance 1d 비어있음 → lazy 재보정 예약"
                                    )
                            except Exception as e:
                                self.volume_multiplier[ticker] = 1.0
                                self.needs_iex_calibration.add(ticker)
                                print(f"⚠️ [VolMul] {ticker}: calibration error: {e}")

                            if (
                                not isinstance(df.index, pd.DatetimeIndex)
                                or df.index.tz is None
                            ):
                                if isinstance(df.index, pd.DatetimeIndex):
                                    df.index = df.index.tz_localize("UTC")
                            # _raw_iex_volume: 보정 전 원본 IEX 거래량 보존
                            raw_vol = (
                                df["Volume"] / self.volume_multiplier.get(ticker, 1.0)
                                if calibrated
                                else df["Volume"].copy()
                            )
                            df["_raw_iex_volume"] = raw_vol
                            self.history[ticker] = df
                            if calibrated:
                                # yfinance 덮어쓰기 차단 (봉 수 관계없이)
                                self._iex_calibrated.add(ticker)
                                # 봉이 적으면 비율 노이즈가 크므로 lazy 재보정도 예약
                                if len(df) < 10:
                                    self.needs_iex_calibration.add(ticker)
                            print(
                                f"✅ [Alpaca/IEX] {ticker} warmed up ({len(df)} bars, calibrated={calibrated})"
                            )
                    except Exception as e:
                        print(f"⚠️ [Alpaca warm-up] {ticker} failed: {e}")

        print("🌐 [Warm-up] Falling back to yfinance (1m interval)...")
        for ticker in tickers:
            # IEX 보정이 완료된 종목은 봉 수가 적어도 yfinance로 덮어쓰지 않음
            if ticker in self._iex_calibrated:
                continue
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
                    self.needs_iex_calibration.add(ticker)
                    print(f"✅ [yfinance] {ticker} warmed up → lazy IEX 재보정 예약")
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
        self, ticker: str, current_price: float, rvol: float, dna_score: float = 0.0
    ) -> tuple[bool, str]:
        # 1. RVOL 검증
        if rvol < self.rvol_threshold:
            return (
                False,
                f"RVOL 부족 (현재: {rvol:.1f}x < 기준: {self.rvol_threshold}x)",
            )

        # 2. MTF (15분봉 20 EMA) 검증 — DNA ≥ 80이면 강한 시그널이므로 EMA 검증 스킵
        if dna_score >= 80.0:
            print(
                f"🚀 [Interceptor] {ticker} DNA {dna_score:.0f} ≥ 80 — EMA 검증 스킵 (고확신 시그널)"
            )
            return True, f"DNA {dna_score:.0f} 고확신 (EMA 스킵)"

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
