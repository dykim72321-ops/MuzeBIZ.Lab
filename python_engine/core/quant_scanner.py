import asyncio
from datetime import datetime, timedelta
from typing import List

import pandas as pd
import pytz
import ta
import yfinance as yf

from state import app_state
from services.quant_engine import calculate_dna_score
from utils.utils import is_market_hours
from market.alpaca_stream import start_alpaca_stream, _stop_current_stream

# ── Quant Scan 상수 ($100 이하 일반 주식 퀀트 스캔) ──────────────────────────
# Paper Engine 자체의 페니 파라미터(PENNY_*)는 paper_engine.py에 유지됨
SCAN_MAX_PRICE = 100.0
SCAN_DATA_LOOKBACK = "2mo"
SCAN_TOP_N = 10

# 하위 호환 — Paper Engine 내부 페니 상태머신 파라미터 (변경 금지)
PENNY_DATA_LOOKBACK = "2mo"
PENNY_TS_INIT_PCT = 0.90
PENNY_BREAKEVEN_TRIGGER = 1.10
PENNY_SCALE_OUT_RSI = 65
PENNY_SCALE_OUT_PROFIT = 0.10
PENNY_SCALE_OUT_RATIO = 0.50
PENNY_TIGHT_TS_PCT = 0.95
PENNY_RVOL_MIN = 1.2


async def run_quant_scan_internal(
    max_price: float = SCAN_MAX_PRICE, top_n: int = SCAN_TOP_N
) -> dict:
    """
    퀀트 스캔 핵심 로직 ($100 이하 일반 주식) — HTTP 엔드포인트와 자동 스케줄러 양쪽에서 호출.
    완료 시 app_state.last_penny_scan_at, app_state.penny_scan_results_cache 갱신.
    """
    import random
    import re as _re

    supabase = app_state.supabase
    trading_client = app_state.trading_client
    webhook = app_state.webhook

    scan_tickers: List[str] = []
    try:
        if trading_client:
            from alpaca.trading.enums import AssetClass, AssetStatus
            from alpaca.trading.requests import GetAssetsRequest

            assets_req = GetAssetsRequest(
                asset_class=AssetClass.US_EQUITY,
                status=AssetStatus.ACTIVE,
            )
            all_assets = await asyncio.to_thread(
                trading_client.get_all_assets, assets_req
            )

            _SKIP_PATTERN = _re.compile(r"\.|[0-9]$")
            tradable = [
                a.symbol
                for a in all_assets
                if a.tradable
                and a.exchange in ("NASDAQ", "NYSE", "AMEX", "ARCA")
                and not _SKIP_PATTERN.search(a.symbol)
                and len(a.symbol) <= 5
                and not (
                    len(a.symbol) == 5
                    and a.symbol[-1] in ("W", "R", "Q", "U", "P", "Y")
                )
            ]
            print(f"📡 [Scan] Alpaca universe: {len(tradable)} tradable US equities")

            pool_tickers: List[str] = []
            if supabase:
                try:
                    cutoff = (datetime.now() - timedelta(days=30)).isoformat()
                    pool_res = await asyncio.to_thread(
                        supabase.table("penny_universe_pool")
                        .select("ticker")
                        .gte("last_seen_at", cutoff)
                        .order("scan_count", desc=True)
                        .limit(100)
                        .execute
                    )
                    if pool_res.data:
                        pool_tickers = [
                            r["ticker"]
                            for r in pool_res.data
                            if not _SKIP_PATTERN.search(r["ticker"])
                            and len(r["ticker"]) <= 5
                            and not (
                                len(r["ticker"]) == 5
                                and r["ticker"][-1] in ("W", "R", "Q", "U", "P", "Y")
                            )
                        ]
                        print(
                            f"📦 [Scan Pool] Loaded {len(pool_tickers)} tickers from accumulated pool"
                        )
                except Exception as pool_err:
                    print(f"⚠️ [Scan Pool] Pool fetch skipped: {pool_err}")

            pool_set = set(pool_tickers)
            fresh_sample = random.sample(
                [t for t in tradable if t not in pool_set],
                min(500, len(tradable)),
            )
            sampled = pool_tickers + fresh_sample
            print(
                f"🔀 [Scan] Universe mix: {len(fresh_sample)} fresh + {len(pool_tickers)} pool = {len(sampled)} total"
            )

            batch_size = 50
            for i in range(0, len(sampled), batch_size):
                batch = sampled[i : i + batch_size]
                batch_str = " ".join(batch)
                try:
                    tickers_data = await asyncio.to_thread(
                        yf.download,
                        batch_str,
                        period="1d",
                        interval="1d",
                        progress=False,
                        threads=True,
                    )
                    if tickers_data is not None and not tickers_data.empty:
                        close_col = tickers_data.get("Close")
                        volume_col = tickers_data.get("Volume")
                        if (
                            close_col is not None
                            and not close_col.empty
                            and volume_col is not None
                        ):
                            if isinstance(close_col, pd.Series):
                                if len(batch) == 1:
                                    last_price = float(close_col.iloc[-1])
                                    last_vol = float(volume_col.iloc[-1])
                                    if (
                                        0.01 < last_price <= max_price
                                        and (last_price * last_vol) > 200000
                                    ):
                                        scan_tickers.append(batch[0])
                            else:
                                last_row = close_col.iloc[-1]
                                last_vol_row = volume_col.iloc[-1]
                                for sym in batch:
                                    if (
                                        sym in last_row.index
                                        and sym in last_vol_row.index
                                    ):
                                        p = last_row[sym]
                                        v = last_vol_row[sym]
                                        if pd.notna(p) and pd.notna(v):
                                            p_val, v_val = float(p), float(v)
                                            if (
                                                0.01 < p_val <= max_price
                                                and (p_val * v_val) > 200000
                                            ):
                                                scan_tickers.append(sym)
                except Exception as e:
                    print(f"⚠️ [Scan] Batch price fetch error: {e}")
                    continue

        if not scan_tickers:
            fallback_tickers = [
                "F",
                "AAL",
                "SOFI",
                "NIO",
                "RIVN",
                "LCID",
                "PLUG",
                "SNAP",
                "CLSK",
                "MARA",
                "RIOT",
                "HIMS",
                "OPEN",
                "JOBY",
                "DNA",
                "SPCE",
                "WKHS",
                "PRPL",
                "BARK",
                "LIDR",
            ]
            for sym in fallback_tickers:
                try:
                    tk = yf.Ticker(sym)
                    info = await asyncio.to_thread(lambda t=tk: t.fast_info)
                    price = getattr(info, "last_price", None)
                    if price and 0.01 < price <= max_price:
                        scan_tickers.append(sym)
                except Exception:
                    continue
    except Exception as e:
        print(f"❌ [Scan] Universe collection error: {e}")

    print(f"📡 [Scan] Found {len(scan_tickers)} stocks under ${max_price}")

    if supabase and scan_tickers:
        try:
            now_iso = datetime.now().isoformat()
            upsert_rows = [
                {"ticker": t, "last_price": 0.0, "last_seen_at": now_iso}
                for t in scan_tickers
            ]
            await asyncio.to_thread(
                supabase.table("penny_universe_pool")
                .upsert(upsert_rows, on_conflict="ticker")
                .execute
            )
            print(
                f"✅ [Scan Pool] UPSERT {len(scan_tickers)} tickers → penny_universe_pool"
            )
        except Exception as upsert_err:
            print(f"⚠️ [Scan Pool] UPSERT skipped: {upsert_err}")

    results = []
    valid_tickers = [
        t for t in scan_tickers[:80] if t not in app_state.yf_no_data_cache
    ]
    if valid_tickers:
        print(f"📥 [Scan] Batch downloading {len(valid_tickers)} tickers...")
        batch_str = " ".join(valid_tickers)
        try:
            df_all = await asyncio.to_thread(
                yf.download,
                batch_str,
                period=PENNY_DATA_LOOKBACK,
                interval="1d",
                group_by="ticker",
                progress=False,
                threads=True,
            )
        except Exception as e:
            print(f"⚠️ [Scan] Batch download failed: {e}")
            df_all = None

        ny_tz = pytz.timezone("America/New_York")
        now_ny = datetime.now(ny_tz)
        market_open = now_ny.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now_ny.replace(hour=16, minute=0, second=0, microsecond=0)

        def get_u_shape_progress(elapsed: float) -> float:
            if elapsed <= 30:
                return (elapsed / 30) * 0.20
            if elapsed <= 90:
                return 0.20 + ((elapsed - 30) / 60) * 0.15
            if elapsed <= 150:
                return 0.35 + ((elapsed - 90) / 60) * 0.10
            if elapsed <= 210:
                return 0.45 + ((elapsed - 150) / 60) * 0.08
            if elapsed <= 270:
                return 0.53 + ((elapsed - 210) / 60) * 0.08
            if elapsed <= 330:
                return 0.61 + ((elapsed - 270) / 60) * 0.14
            if elapsed <= 360:
                return 0.75 + ((elapsed - 330) / 30) * 0.10
            return min(0.85 + ((elapsed - 360) / 30) * 0.15, 1.0)

        progress = 1.0
        if market_open <= now_ny <= market_close:
            elapsed_minutes = (now_ny - market_open).total_seconds() / 60.0
            progress = max(get_u_shape_progress(elapsed_minutes), 0.05)

        for ticker in valid_tickers:
            if df_all is None or df_all.empty:
                continue
            try:
                if len(valid_tickers) == 1:
                    df = df_all.copy()
                else:
                    if ticker not in df_all.columns.levels[0]:
                        app_state.yf_no_data_cache.add(ticker)
                        continue
                    df = df_all[ticker].copy()

                df.dropna(subset=["Close", "Volume"], inplace=True)
                if df.empty or len(df) < 30:
                    app_state.yf_no_data_cache.add(ticker)
                    continue

                last_bar_date = df.index[-1]
                if hasattr(last_bar_date, "date"):
                    last_bar_date = last_bar_date.date()
                is_last_bar_today = last_bar_date == now_ny.date()
                if progress < 1.0 and is_last_bar_today and len(df) > 0:
                    df["Volume"] = df["Volume"].astype(float)
                    df.loc[df.index[-1], "Volume"] = df["Volume"].iloc[-1] / progress

                df["RSI"] = ta.momentum.RSIIndicator(df["Close"], window=14).rsi()

                macd_ind = ta.trend.MACD(
                    df["Close"], window_slow=26, window_fast=12, window_sign=9
                )
                df["MACD_Diff"] = macd_ind.macd_diff()

                adx_ind = ta.trend.ADXIndicator(
                    high=df["High"], low=df["Low"], close=df["Close"], window=14
                )
                df["ADX"] = adx_ind.adx()
                df["+DI"] = adx_ind.adx_pos()
                df["-DI"] = adx_ind.adx_neg()

                df["Avg_Vol"] = (
                    df["Volume"].shift(1).rolling(window=30, min_periods=1).median()
                )
                df["RVOL"] = df["Volume"] / (df["Avg_Vol"] + 1e-9)

                ma20 = df["Close"].rolling(window=20, min_periods=1).mean()
                df["Is_Extended"] = (
                    (df["Close"] > df["Open"] * 1.25)
                    | (df["Close"] > df["Close"].shift(1) * 1.25)
                    | (df["Close"] > ma20 * 1.30)
                )

                latest = df.iloc[-1]
                prev = df.iloc[-2] if len(df) >= 2 else latest

                rsi = float(latest["RSI"]) if not pd.isna(latest["RSI"]) else 50.0
                macd_diff = (
                    float(latest["MACD_Diff"])
                    if not pd.isna(latest["MACD_Diff"])
                    else 0.0
                )
                macd_diff_prev = (
                    float(prev["MACD_Diff"]) if not pd.isna(prev["MACD_Diff"]) else 0.0
                )
                adx = (
                    float(latest["ADX"])
                    if "ADX" in latest.index and not pd.isna(latest["ADX"])
                    else 0.0
                )
                rvol = (
                    float(latest["RVOL"])
                    if "RVOL" in latest.index and not pd.isna(latest["RVOL"])
                    else 1.0
                )
                is_extended = (
                    bool(latest["Is_Extended"])
                    if "Is_Extended" in latest.index
                    else False
                )
                price = float(latest["Close"])
                change_pct = 0.0
                if len(df) >= 2:
                    prev_close = float(df["Close"].iloc[-2])
                    if prev_close > 0:
                        change_pct = round((price / prev_close - 1) * 100, 2)

                volume = int(latest["Volume"]) if not pd.isna(latest["Volume"]) else 0

                dna_score = calculate_dna_score(
                    rsi=rsi,
                    macd_diff=macd_diff,
                    macd_diff_prev=macd_diff_prev,
                    adx=adx,
                    di_plus=(
                        float(latest["+DI"])
                        if "+DI" in latest.index and not pd.isna(latest["+DI"])
                        else 0.0
                    ),
                    di_minus=(
                        float(latest["-DI"])
                        if "-DI" in latest.index and not pd.isna(latest["-DI"])
                        else 0.0
                    ),
                    rvol=rvol,
                    is_extended=is_extended,
                )

                signal_type = "HOLD"
                strength = "NORMAL"

                if dna_score >= 85.0:
                    signal_type = "BUY"
                    strength = "STRONG"
                elif dna_score >= 80.0:
                    signal_type = "BUY"
                    strength = "NORMAL"
                elif dna_score <= 40.0:
                    signal_type = "SELL"
                    strength = "STRONG"

                results.append(
                    {
                        "ticker": ticker,
                        "price": round(price, 4),
                        "change_pct": change_pct,
                        "volume": volume,
                        "dna_score": dna_score,
                        "rsi": round(rsi, 2),
                        "macd_diff": round(macd_diff, 4),
                        "adx": round(adx, 2),
                        "rvol": round(rvol, 2),
                        "signal": signal_type,
                        "strength": strength,
                        "is_extended": is_extended,
                    }
                )
                if supabase:
                    try:
                        await asyncio.to_thread(
                            supabase.table("penny_universe_pool")
                            .update({"last_price": round(price, 4)})
                            .eq("ticker", ticker)
                            .execute
                        )
                    except Exception:
                        pass
            except Exception as e:
                print(f"⚠️ [Scan] {ticker} analysis error: {e}")
                continue

    results.sort(key=lambda x: x["dna_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
        r["is_top"] = i < top_n

    auto_registered: List[str] = []
    if supabase and results:
        for item in results[:top_n]:
            if item.get("dna_score", 0) < 70:
                continue
            try:
                payload = {
                    "ticker": item["ticker"],
                    "status": "WATCHING",
                    "initial_dna_score": item["dna_score"],
                }
                existing = await asyncio.to_thread(
                    supabase.table("watchlist")
                    .select("status")
                    .eq("ticker", item["ticker"])
                    .is_("user_id", "null")
                    .execute
                )
                if existing.data:
                    current_status = existing.data[0].get("status")
                    update_data = {
                        "initial_dna_score": item["dna_score"],
                    }
                    if current_status not in ("HOLDING", "EXITED"):
                        update_data["status"] = "WATCHING"
                        auto_registered.append(item["ticker"])

                    await asyncio.to_thread(
                        supabase.table("watchlist")
                        .update(update_data)
                        .eq("ticker", item["ticker"])
                        .is_("user_id", "null")
                        .execute
                    )
                else:
                    await asyncio.to_thread(
                        supabase.table("watchlist").insert(payload).execute
                    )
                    auto_registered.append(item["ticker"])
                item["is_watchlisted"] = True

                # [Option A Fix] daily_discovery에도 즉시 upsert하여 UI에 표시되도록 함
                try:
                    await asyncio.to_thread(
                        supabase.table("daily_discovery")
                        .upsert(
                            {
                                "ticker": item["ticker"],
                                "dna_score": int(round(item["dna_score"])),
                                "price": item["price"],
                                "change": str(round(item["change_pct"], 2)),
                                "change_percent": round(item["change_pct"], 2),
                                "volume": str(item["volume"]),
                                "updated_at": datetime.now().isoformat(),
                                "rsi": item["rsi"],
                                "rvol": item["rvol"],
                                "adx": item["adx"],
                                "macd_diff": item["macd_diff"],
                                "is_extended": item["is_extended"],
                            },
                            on_conflict="ticker",
                        )
                        .execute
                    )
                    print(
                        f"⭐ [Scan] {item['ticker']} also upserted to daily_discovery"
                    )
                except Exception as dd_e:
                    print(
                        f"⚠️ [Scan] daily_discovery upsert error for {item['ticker']}: {dd_e}"
                    )

            except Exception as e:
                print(
                    f"⚠️ [Scan] Watchlist auto-register error for {item['ticker']}: {e}"
                )

    if auto_registered and webhook:
        registered_items = [r for r in results if r["ticker"] in auto_registered]
        top_summary = "\n".join(
            [
                f"{'🥇🥈🥉'[i] if i < 3 else '•'} {r['ticker']} — DNA: {r['dna_score']} | ${r['price']:.4f} | RSI: {r['rsi']}"
                for i, r in enumerate(registered_items)
            ]
        )
        await webhook.send_alert(
            use_dev=True,
            title="📡 [QUANT SCAN] Top 퀀트 추천 종목 선정",
            description=f"스캔 종목: {len(results)}개 | $100 이하 일반주식\n\n{top_summary}",
            color=0x6366F1,
        )

    app_state.last_penny_scan_at = datetime.now()
    app_state.penny_scan_results_cache = results

    if auto_registered and is_market_hours():
        print(
            f"🔄 [Auto-Scan] 신규 종목 {auto_registered} 등록됨 — 장 중 스트림 재시작"
        )
        await _stop_current_stream()
        app_state._current_stream_task = asyncio.create_task(start_alpaca_stream())

    if "df_all" in locals() and df_all is not None:
        del df_all
    import gc

    gc.collect()

    return {
        "scanned_at": app_state.last_penny_scan_at.isoformat(),
        "total_scanned": len(results),
        "scan_params": {
            "max_price": max_price,
            "data_lookback": SCAN_DATA_LOOKBACK,
        },
        "results": results,
        "auto_registered": auto_registered,
    }


# ── 경량 RSI/ATR 계산 헬퍼 ──────────────────────────────────────────────────
