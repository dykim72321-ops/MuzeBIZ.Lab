import asyncio
import gc
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo
from datetime import time as dtime

import yfinance as yf
from alpaca.data.enums import DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.timeframe import TimeFrame
from alpaca.data.live import StockDataStream

from app.state import app_state
from core.pulse import run_pulse_engine
from core.indicators import _rsi_atr_er_last
from utils.utils import is_market_hours

# 세션 내 데이터 없음(상장폐지/OTC) 종목 캐시(app_state.yf_no_data_cache) —
# core/quant_scanner.py와 공유해 매 스트림 콜백마다 재조회하지 않는다.

# fire-and-forget로 던진 백그라운드 태스크(broadcast/DB 기록/Discord 알림)의
# 강한 참조를 들고 있기 위한 집합. asyncio.create_task()가 반환한 Task는 어딘가
# 참조가 남아있지 않으면 완료 전에 GC될 수 있으므로, 완료 시 discard되는 콜백과
# 함께 여기 보관한다.
_background_tasks: set[asyncio.Task] = set()


def _spawn_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _emit_signal_side_effects(
    ticker_symbol: str, payload: dict, df_hist, dna_val: float
) -> None:
    """WebSocket 브로드캐스트·realtime_signals 기록·Discord 알림·daily_discovery
    갱신 — 매매 판단(process_signal)과 무관한 알림/기록용 부가 작업이므로
    on_minute_bar_closed()의 매매 핫패스를 지연시키지 않도록 백그라운드로 분리됐다."""
    try:
        await app_state.manager.broadcast(payload)

        if not app_state.supabase:
            return

        try:
            allowed_keys = {
                "ticker",
                "indicator",
                "value",
                "rsi",
                "macd_line",
                "macd_signal",
                "macd_diff",
                "adx",
                "rvol",
                "volatility_ann",
                "vol_weight",
                "kelly_f",
                "recommended_weight",
                "price",
                "signal",
                "strength",
                "ai_report",
                "timestamp",
                "dna_score",
                "smoothed_er",
            }
            db_payload = {k: v for k, v in payload.items() if k in allowed_keys}
            await asyncio.to_thread(
                app_state.supabase.table("realtime_signals").insert(db_payload).execute
            )
        except Exception as db_err:
            print(f"❌ [realtime_signals] insert failed: {db_err}")

        if payload.get("strength") == "STRONG":
            color = 0x2ECC71 if payload.get("signal") == "BUY" else 0xE74C3C
            action = (
                "🟢 STRONG BUY"
                if payload.get("signal") == "BUY"
                else "🔴 STRONG SELL / SCALE_OUT"
            )
            title = f"[MuzeBIZ Pulse] {ticker_symbol} {action}"
            desc = (
                f"현재가: ${payload.get('price'):.2f} | RSI: {payload.get('rsi')}\n\n"
                f"💡 {payload.get('ai_report', '')}"
            )
            await app_state.webhook.send_alert(
                use_dev=True, title=title, description=desc, color=color
            )

        price_val = float(payload.get("price", 0.0))
        prev_price = df_hist["Close"].iloc[-2] if len(df_hist) >= 2 else price_val
        change_pct = ((price_val / prev_price - 1) * 100) if prev_price > 0 else 0.0
        volume_val = int(df_hist["Volume"].iloc[-1]) if len(df_hist) >= 1 else 0
        try:
            import math as _math

            _vol_ann = float(payload.get("volatility_ann") or 0.0)
            _atr_pct = (
                round(_vol_ann / _math.sqrt(252 * 390), 4) if _vol_ann > 0 else 0.0
            )
            await asyncio.to_thread(
                app_state.supabase.table("daily_discovery")
                .upsert(
                    {
                        "ticker": ticker_symbol,
                        "dna_score": int(round(dna_val)),
                        "price": price_val,
                        "change": str(round(change_pct, 2)),
                        "change_percent": round(change_pct, 2),
                        "volume": str(volume_val),
                        "updated_at": datetime.now().isoformat(),
                        "rsi": payload.get("rsi"),
                        "rvol": payload.get("rvol"),
                        "adx": payload.get("adx"),
                        "macd_diff": payload.get("macd_diff"),
                        "macd_diff_prev": payload.get("macd_diff_prev"),
                        "di_positive": payload.get("di_positive"),
                        "is_extended": payload.get("is_extended"),
                        "atr_pct": _atr_pct,
                    },
                    on_conflict="ticker",
                )
                .execute
            )
        except Exception as dd_err:
            print(f"⚠️ [daily_discovery] upsert skipped for {ticker_symbol}: {dd_err}")
    except Exception as service_err:
        print(f"⚠️ Service Integration Error for {ticker_symbol}: {service_err}")


async def on_minute_bar_closed(bar):
    """
    Alpaca 1분봉 완성 콜백.

    [Guide-2] 역할 분리:
    - HOLD 포지션 종목 → RSI-14 + 현재가만 계산하는 경량 모니터 경로
    - 미보유 종목 → 기존 run_pulse_engine() 전체 DNA 경로 (발굴·신호 생성)
    """
    app_state._last_bar_received_at = datetime.now()
    ticker_symbol = bar.symbol
    try:
        df_hist = app_state.candle_state.update(ticker_symbol, bar)

        if len(df_hist) < 35:
            return

        # ── avg_daily_volume 지연 초기화 (cold ticker — warm_up을 거치지 않은 신규 유입 종목) ──
        if (
            ticker_symbol not in app_state.candle_state.avg_daily_volume
            and ticker_symbol not in app_state.yf_no_data_cache
        ):
            try:
                tk = yf.Ticker(ticker_symbol)
                daily, yf_1m = await asyncio.gather(
                    asyncio.to_thread(tk.history, period="30d", interval="1d"),
                    asyncio.to_thread(tk.history, period="1d", interval="1m"),
                )

                if not daily.empty:
                    app_state.candle_state.avg_daily_volume[ticker_symbol] = float(
                        daily["Volume"].mean()
                    )
                else:
                    app_state.yf_no_data_cache.add(ticker_symbol)
                    app_state.candle_state.no_data_tickers.add(ticker_symbol)
                    app_state.candle_state.avg_daily_volume[ticker_symbol] = 0.0

                # cold ticker의 IEX 보정 (처음 유입된 종목)
                if "_raw_iex_volume" in df_hist.columns and not yf_1m.empty:
                    iex_total = float(df_hist["_raw_iex_volume"].fillna(0).sum())
                    yf_total = float(yf_1m["Volume"].sum())
                    if iex_total > 0 and yf_total > iex_total:
                        multiplier = min(yf_total / iex_total, 50.0)
                        app_state.candle_state.volume_multiplier[ticker_symbol] = (
                            multiplier
                        )
                        app_state.candle_state.history[ticker_symbol]["Volume"] = (
                            app_state.candle_state.history[ticker_symbol][
                                "_raw_iex_volume"
                            ].fillna(0)
                            * multiplier
                        )
                        app_state.candle_state.needs_iex_calibration.discard(
                            ticker_symbol
                        )
                        print(
                            f"📊 [VolMul-cold] {ticker_symbol}: {multiplier:.1f}x "
                            f"(IEX→Full Market, {len(df_hist)}봉 소급 보정)"
                        )

                print(
                    f"📈 [AvgVol-lazy] {ticker_symbol}: "
                    f"{app_state.candle_state.avg_daily_volume[ticker_symbol]:,.0f} avg daily shares"
                )
            except Exception as avg_err:
                app_state.candle_state.avg_daily_volume[ticker_symbol] = 0.0
                print(f"⚠️ [AvgVol-lazy] {ticker_symbol}: {avg_err}")

        # ── IEX 거래량 lazy 재보정 ─────────────────────────────────────────────
        # warm_up 시 장 시작 전이거나 yfinance fallback으로 채워진 종목은
        # needs_iex_calibration에 등록됨. IEX 바가 35개 이상 쌓이면 재보정 실행.
        elif (
            ticker_symbol in app_state.candle_state.needs_iex_calibration
            and "_raw_iex_volume" in df_hist.columns
            and df_hist["_raw_iex_volume"].fillna(0).sum() > 0
        ):
            try:
                tk = yf.Ticker(ticker_symbol)
                yf_1m = await asyncio.to_thread(tk.history, period="1d", interval="1m")
                if not yf_1m.empty:
                    # IEX 바 구간의 timestamps만 추출해서 동일 시간대 yfinance 거래량 비교
                    iex_mask = df_hist["_raw_iex_volume"].notna()
                    iex_bars = df_hist[iex_mask]
                    iex_total = float(iex_bars["_raw_iex_volume"].sum())

                    if not iex_bars.empty and iex_total > 0:
                        # 동일 시간대의 yfinance 데이터만 비교 (시간축 정합)
                        yf_1m_utc = yf_1m.copy()
                        if yf_1m_utc.index.tz is None:
                            yf_1m_utc.index = yf_1m_utc.index.tz_localize("UTC")
                        else:
                            yf_1m_utc.index = yf_1m_utc.index.tz_convert("UTC")

                        t_start = iex_bars.index[0]
                        t_end = iex_bars.index[-1]
                        yf_window = yf_1m_utc[
                            (yf_1m_utc.index >= t_start) & (yf_1m_utc.index <= t_end)
                        ]
                        yf_window_total = (
                            float(yf_window["Volume"].sum())
                            if not yf_window.empty
                            else 0
                        )

                        if yf_window_total > iex_total:
                            multiplier = min(yf_window_total / iex_total, 50.0)
                        else:
                            # 시간대 매칭이 안 되면 전체 일봉 비율로 추정
                            yf_total = float(yf_1m["Volume"].sum())
                            multiplier = (
                                min(yf_total / iex_total, 50.0)
                                if yf_total > iex_total
                                else 1.0
                            )

                        if multiplier > 1.05:
                            app_state.candle_state.volume_multiplier[ticker_symbol] = (
                                multiplier
                            )
                            raw_col = app_state.candle_state.history[ticker_symbol][
                                "_raw_iex_volume"
                            ].fillna(0)
                            app_state.candle_state.history[ticker_symbol]["Volume"] = (
                                raw_col * multiplier
                            )
                            app_state.candle_state.needs_iex_calibration.discard(
                                ticker_symbol
                            )
                            print(
                                f"📊 [VolMul-lazy] {ticker_symbol}: {multiplier:.1f}x 재보정 완료 "
                                f"(IEX {iex_total:,.0f} → Full Market {yf_window_total or yf_1m['Volume'].sum():,.0f})"
                            )
                        else:
                            # 보정값이 너무 낮으면 재시도 대신 제거 (이미 full market 데이터)
                            app_state.candle_state.needs_iex_calibration.discard(
                                ticker_symbol
                            )
                            print(
                                f"ℹ️ [VolMul-lazy] {ticker_symbol}: 보정 불필요 (multiplier={multiplier:.2f})"
                            )
            except Exception as cal_err:
                # 실패 시 set에서 제거해 무한 재시도 방지
                app_state.candle_state.needs_iex_calibration.discard(ticker_symbol)
                print(f"⚠️ [VolMul-lazy] {ticker_symbol}: {cal_err}")

        current_price = float(bar.close)

        # ── 경량 모니터 경로 (HOLD 포지션 전용) ────────────────────────────
        if ticker_symbol in app_state._held_tickers and app_state.paper_engine:
            # [Senior Fix 5] DataFrame Thread-Safety & Performance:
            # 원본 df_hist 참조를 백그라운드 스레드로 넘기면 Race Condition(Segfault) 위험 발생.
            # 최근 100개 데이터만 복사본(copy)으로 추출하여 안전하게 전달 및 연산량 최소화.
            safe_df = df_hist.tail(100).copy()
            rsi_val, atr_val, er_val = await asyncio.to_thread(
                _rsi_atr_er_last, safe_df
            )

            now_et = datetime.now(ZoneInfo("America/New_York"))
            is_eod = now_et.time() >= dtime(15, 30)

            await app_state.manager.broadcast(
                {
                    "ticker": ticker_symbol,
                    "price": current_price,
                    "rsi": round(rsi_val, 2),
                    "signal": "SELL" if is_eod else "HOLD",
                    "strength": "EOD_FORCE" if is_eod else "MONITOR",
                    "dna_score": None,
                }
            )
            await app_state.active_engine.process_signal(
                ticker=ticker_symbol,
                price=current_price,
                signal_type="SELL" if is_eod else "HOLD",
                strength="EOD_FORCE" if is_eod else "MONITOR",
                rsi=rsi_val,
                ai_report="[EOD] 장 마감 강제 청산" if is_eod else "",
                is_armed=app_state.SYSTEM_ARMED,
                dna_score=0.0,
                recommended_weight=0.0,
                atr=atr_val,
                smoothed_er=er_val,
            )
            if app_state.supabase:
                try:
                    chk = await asyncio.to_thread(
                        app_state.supabase.table("paper_positions")
                        .select("ticker")
                        .eq("ticker", ticker_symbol)
                        .execute
                    )
                    if not chk.data:
                        app_state._held_tickers.discard(ticker_symbol)
                except Exception:
                    pass
            return

        # ── 전체 DNA 경로 (신규 발굴 / 미보유 종목) ────────────────────────
        payload = await asyncio.to_thread(run_pulse_engine, ticker_symbol, df_hist)

        # ── 장 외 시간 및 15:00 ET 이후 BUY 차단 (바 타임스탬프 기준) ─────────────────────
        # is_market_hours()에 바 시간을 전달해야 warm_up 재생 바가
        # 장 마감 후 처리될 때 현재 벽시계로 잘못 차단되지 않는다.
        bar_ts = getattr(bar, "timestamp", None)
        is_market_open = is_market_hours(bar_ts)
        is_before_1500 = False
        if bar_ts is not None:
            now_et = bar_ts.astimezone(ZoneInfo("America/New_York"))
        else:
            now_et = datetime.now(ZoneInfo("America/New_York"))
        if (now_et.hour * 60 + now_et.minute) < (15 * 60):
            is_before_1500 = True

        if payload.get("signal") == "BUY" and (
            not is_market_open or not is_before_1500
        ):
            reason = (
                "장외 시간 BUY 차단"
                if not is_market_open
                else "15:00 ET 이후 신규 진입 차단"
            )
            if app_state.supabase and payload.get("strength") == "STRONG":
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": ticker_symbol,
                                "gate": "MARKET_HOURS",
                                "outcome": "BLOCKED",
                                "signal": "BUY",
                                "dna_score": float(payload.get("dna_score", 0)),
                                "rsi": float(payload.get("rsi", 0)),
                                "rvol": float(payload.get("rvol", 0)),
                                "price": float(payload.get("price", 0)),
                                "note": reason,
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            payload["signal"] = "HOLD"
            payload["strength"] = "NORMAL"

        # ── 미보유 종목 SELL 스킵 ─────────────────────────────────────────
        # 포지션 없는 종목의 SELL 신호는 process_signal에 전달해도 아무 것도 안 되지만
        # DB 조회 비용이 있으므로 여기서 차단
        if (
            payload.get("signal") == "SELL"
            and ticker_symbol not in app_state._held_tickers
        ):
            await app_state.manager.broadcast(payload)
            print(
                f"⚡ [Alpaca Stream] {ticker_symbol} processed: {payload.get('signal')} ({payload.get('strength')}) | vol_mul={payload.get('volume_multiplier', 1.0):.1f}x"
            )
            return

        # ── Momentum Interceptor ──────────────────────────────────────────
        if payload.get("signal") == "BUY" and payload.get("strength") == "STRONG":
            is_valid, reject_reason = app_state.momentum_validator.validate(
                ticker=ticker_symbol,
                current_price=payload.get("price", 0.0),
                rvol=payload.get("rvol", 1.0),
                dna_score=float(payload.get("dna_score", 0.0)),
            )
            if not is_valid:
                print(f"🛡️ [Interceptor] {ticker_symbol} 매수 차단: {reject_reason}")
                if app_state.supabase:
                    try:
                        await asyncio.to_thread(
                            app_state.supabase.table("engine_decisions")
                            .insert(
                                {
                                    "ticker": ticker_symbol,
                                    "gate": "MOMENTUM_VALIDATOR",
                                    "outcome": "BLOCKED",
                                    "signal": "BUY",
                                    "dna_score": float(payload.get("dna_score", 0)),
                                    "rsi": float(payload.get("rsi", 0)),
                                    "rvol": float(payload.get("rvol", 0)),
                                    "price": float(payload.get("price", 0)),
                                    "note": reject_reason,
                                }
                            )
                            .execute
                        )
                    except Exception:
                        pass
                payload["signal"] = "HOLD"
                payload["strength"] = "NORMAL"
                payload["ai_report"] = (
                    f"⛔ [진입 보류] {reject_reason}\n\n" + payload.get("ai_report", "")
                )
        # ─────────────────────────────────────────────────────────────────

        # 실제 매매 판단(process_signal)을 최우선으로 실행한다. broadcast·
        # realtime_signals 기록·Discord 알림·daily_discovery 갱신은 전부 매매
        # 결정과 무관한 부가 작업이므로 백그라운드로 분리한다 — 이전에는 이
        # 부가 작업들을 전부 await한 뒤에야 process_signal을 호출해, 느린
        # Discord/Supabase 왕복(수백 ms~수 초)이 그대로 매수/매도 지연으로
        # 이어졌다 (원본 신호가는 이 부가 작업들이 시작되기 전에 이미 캡처된
        # bar-close 값이었음에도 실제 체결은 그 이후에야 일어났다).
        dna_val = float(payload.get("dna_score", 0.0))

        if app_state.supabase and app_state.active_engine:
            buy_executed = await app_state.active_engine.process_signal(
                ticker=ticker_symbol,
                price=payload.get("price"),
                signal_type=payload.get("signal"),
                strength=payload.get("strength"),
                rsi=payload.get("rsi"),
                ai_report=payload.get("ai_report", ""),
                is_armed=app_state.SYSTEM_ARMED,
                dna_score=dna_val,
                recommended_weight=float(payload.get("recommended_weight", 0.0)),
                atr=float(payload.get("atr", 0.0)),
                smoothed_er=float(payload.get("smoothed_er", 0.5)),
            )
            if buy_executed:
                app_state._held_tickers.add(ticker_symbol)

        _spawn_background(
            _emit_signal_side_effects(ticker_symbol, payload, df_hist, dna_val)
        )

        print(
            f"⚡ [Alpaca Stream] {ticker_symbol} processed: {payload.get('signal')} ({payload.get('strength')}) | vol_mul={payload.get('volume_multiplier', 1.0):.1f}x"
        )

    except Exception as e:
        print(f"❌ Pulse Stream Error for {ticker_symbol}: {e}")
    finally:
        gc.collect()


# ── 스트림 / 폴링 ────────────────────────────────────────────────────────────


async def _stop_current_stream():
    """현재 실행 중인 Alpaca 스트림 태스크를 취소하고 종료를 기다린다."""
    task: asyncio.Task = app_state._current_stream_task  # type: ignore[assignment]
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    app_state._current_stream_task = None

    # 로컬↔Railway 등 다른 인스턴스가 즉시 스트림을 승계할 수 있도록, 내가
    # 스트림 락을 쥐고 있었다면 정상 종료 경로(폐장/재연결/앱 종료)에서 반납한다.
    if app_state._stream_lock_owned and app_state.db and app_state.db.supabase:
        try:
            await asyncio.to_thread(
                app_state.db.release_stream_lock, app_state._instance_id
            )
        except Exception:
            pass
        app_state._stream_lock_owned = False


async def start_rest_polling(tickers: Optional[List[str]] = None):
    """REST API 폴링 모드 — WebSocket 비활성화 또는 connection limit 시 60초 주기"""
    from alpaca.data.requests import StockBarsRequest

    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    if not api_key or not api_secret:
        print("❌ [REST Polling] Alpaca API Key missing.")
        return

    active_tickers = tickers
    if not active_tickers:
        discovery_tickers = await asyncio.to_thread(
            app_state.db.get_active_tickers, limit=30
        )
        watchlist_tickers = await asyncio.to_thread(
            app_state.db.get_watchlist_tickers, limit=30
        )
        # HOLD 중인 포지션이 daily_discovery 순위 밖으로 밀려나도 반드시 폴링 대상에
        # 포함해야 한다 — 그렇지 않으면 current_price가 진입가에 고정된다.
        # 매수 전 WATCHING 종목도 순위 밖으로 밀리면 STRONG BUY 신호를 놓치므로 포함.
        active_tickers = list(
            set(discovery_tickers) | set(watchlist_tickers) | app_state._held_tickers
        )

    if not active_tickers:
        print("⚠️ [REST Polling] No active tickers. Standby.")
        return

    await app_state.candle_state.warm_up(active_tickers)

    client = StockHistoricalDataClient(api_key, api_secret)
    last_processed: Dict[str, object] = {}

    print(f"📡 [REST Polling] 60s 폴링 시작 — {active_tickers}")

    while True:
        if not is_market_hours():
            now_et = datetime.now(ZoneInfo("America/New_York"))
            open_min = 9 * 60 + 30
            cur_min = now_et.hour * 60 + now_et.minute
            if cur_min < open_min:
                wait_sec = (open_min - cur_min) * 60
                print(f"⏰ [REST Polling] 개장까지 {wait_sec // 60}분 대기...")
                await asyncio.sleep(min(wait_sec, 300))
            else:
                print("🌙 [REST Polling] 폐장. 내일 재시작 대기...")
                await asyncio.sleep(3600)
            continue

        try:
            now_et = datetime.now(ZoneInfo("America/New_York"))
            start_time = now_et - timedelta(minutes=3)

            request = StockBarsRequest(
                symbol_or_symbols=active_tickers,
                timeframe=TimeFrame.Minute,
                start=start_time,
                feed=DataFeed.IEX,
            )
            bars_response = await asyncio.to_thread(client.get_stock_bars, request)

            processed_count = 0
            for symbol, bar_list in bars_response.data.items():
                for bar in bar_list:
                    bar_ts = bar.timestamp
                    last_ts = last_processed.get(symbol)
                    if last_ts is None or bar_ts > last_ts:
                        last_processed[symbol] = bar_ts
                        await on_minute_bar_closed(bar)
                        processed_count += 1

            if processed_count:
                print(f"⚡ [REST Polling] {processed_count}개 봉 처리 완료")

        except Exception as e:
            print(f"⚠️ [REST Polling] Error: {e}")

        await asyncio.sleep(60)


async def start_alpaca_stream(tickers: Optional[List[str]] = None):
    """Alpaca WebSocket 스트림 데몬 시작"""
    # REST Polling도 on_minute_bar_closed()를 그대로 호출하는 완전한 매매
    # 경로다 — "스트림만 끄고 폴링으로 계속 거래"는 로컬↔Railway 이중 매매를
    # 만들므로, 이 플래그는 매매 루프 자체를 켜지 않는 완전 대기(standby)를
    # 의미한다 (개발 전용 인스턴스 고정용).
    if os.getenv("DISABLE_ALPACA_STREAM", "false").lower() == "true":
        print(
            "🔌 [Pulse Engine] DISABLE_ALPACA_STREAM=true — 매매 루프 비활성화 (개발 전용 standby)."
        )
        return

    # 로컬/Railway 등 서로 다른 인스턴스가 같은 Alpaca 계정으로 동시에 WS를
    # 열면 "connection limit exceeded"가 발생한다. system_settings에 TTL 기반
    # 분산 락을 두어, 락을 잡은 인스턴스만 매매 루프를 연다. 락을 못 잡은
    # 인스턴스는 REST Polling으로 물러나는 게 아니라(그것도 매매 경로라 이중
    # 매매가 됨) 완전 대기하며 60초마다 재시도만 한다 — 상대가 정상 종료(락
    # 반납)하거나 크래시(TTL 만료)하면 자동 승계된다.
    if app_state.db and app_state.db.supabase:
        announced = False
        while not await asyncio.to_thread(
            app_state.db.try_acquire_stream_lock, app_state._instance_id
        ):
            app_state._stream_lock_owned = False
            if not announced:
                print(
                    f"🔒 [Stream Lock] 다른 인스턴스가 스트림 보유 중 — 승계 대기 (me={app_state._instance_id})"
                )
                announced = True
            await asyncio.sleep(60)
        app_state._stream_lock_owned = True
        print(f"🔑 [Stream Lock] 스트림 락 획득 (me={app_state._instance_id})")

    print("📡 [Pulse Engine] Initializing Event-Driven Stream...")

    active_tickers = tickers

    try:
        if not active_tickers:
            discovery_tickers = await asyncio.to_thread(
                app_state.db.get_active_tickers, limit=30
            )
            watchlist_tickers = await asyncio.to_thread(
                app_state.db.get_watchlist_tickers, limit=30
            )
            # 현재 HOLD 중인 포지션은 daily_discovery 순위 밖으로 밀려나도
            # 반드시 구독을 유지해야 current_price가 갱신된다 (그렇지 않으면
            # 평가 손익이 진입가에 고정되어 항상 +$0.00으로 표시됨).
            # 매수 전 WATCHING 종목도 동일한 사각지대에 놓이므로 함께 구독한다.
            active_tickers = list(
                set(discovery_tickers)
                | set(watchlist_tickers)
                | app_state._held_tickers
            )

        if not active_tickers:
            print("⚠️ No active tickers to monitor. Pulse engine standby.")
            if app_state.supabase:
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": "__SYSTEM__",
                                "gate": "NO_TICKERS",
                                "outcome": "BLOCKED",
                                "note": "daily_discovery가 비어있어 스트림 구독 대상 없음 — Pulse engine standby",
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            return

        if active_tickers:
            await app_state.candle_state.warm_up(active_tickers)

        api_key = os.getenv("APCA_API_KEY_ID")
        api_secret = os.getenv("APCA_API_SECRET_KEY")

        if not api_key or not api_secret:
            print("❌ Alpaca API Key missing. Stream cannot start.")
            if app_state.supabase:
                try:
                    await asyncio.to_thread(
                        app_state.supabase.table("engine_decisions")
                        .insert(
                            {
                                "ticker": "__SYSTEM__",
                                "gate": "API_KEY_MISSING",
                                "outcome": "BLOCKED",
                                "note": "APCA_API_KEY_ID 또는 APCA_API_SECRET_KEY 미설정",
                            }
                        )
                        .execute
                    )
                except Exception:
                    pass
            return

        stream = StockDataStream(api_key, api_secret, feed=DataFeed.IEX)
        app_state._current_ws_stream = stream

        stream.subscribe_bars(on_minute_bar_closed, *active_tickers)

        print(f"🚀 [Pulse Engine] Live: Monitoring {active_tickers}")

        max_auth_failures = 3
        auth_failure_count = 0

        async def _guarded_run_forever():
            nonlocal auth_failure_count
            while auth_failure_count < max_auth_failures:
                try:
                    await stream._start_ws()
                except ValueError as ve:
                    if "auth failed" in str(ve).lower():
                        auth_failure_count += 1
                        print(
                            f"🔑 [Alpaca] Auth failed ({auth_failure_count}/{max_auth_failures})"
                        )
                        if auth_failure_count >= max_auth_failures:
                            print(
                                "🔑 [Alpaca] Max auth failures reached. Stopping stream."
                            )
                            print(
                                "   → Please check your API keys and restart the server."
                            )
                            return
                        await asyncio.sleep(5)
                    else:
                        raise
                except Exception as e:
                    print(f"⚠️ [Alpaca] Stream error: {e}. Reconnecting in 30s...")
                    auth_failure_count = 0
                    await asyncio.sleep(30)

        try:
            await _guarded_run_forever()
        finally:
            try:
                await stream.close()
            except Exception:
                pass
            if app_state._current_ws_stream is stream:
                app_state._current_ws_stream = None

    except Exception as e:
        error_msg = f"❌ Alpaca Stream Lifecycle Error: {e}"
        print(error_msg)
        if app_state.webhook:
            await app_state.webhook.send_alert(
                use_dev=True,
                title="[CRITICAL] Pulse Engine Stream Offline",
                description=f"스트림 엔진에 치명적 오류가 발생했습니다.\nError: {e}",
                color=0xFF0000,
            )
        if "connection limit" in str(e).lower():
            print("⏳ Connection limit — REST Polling 폴백으로 즉시 전환...")
            if is_market_hours():
                # _current_stream_task를 갱신하지 않으면 _stop_current_stream()이
                # 이 폴링 루프를 절대 취소할 수 없어 재시도할 때마다 폴링 루프가
                # 고아 상태로 누적되고, 결국 Alpaca Data API 요청이 겹쳐 429가 발생한다.
                app_state._current_stream_task = asyncio.create_task(
                    start_rest_polling(active_tickers)
                )
            await asyncio.sleep(300)
            if is_market_hours():
                # REST 폴링 태스크를 취소하지 않고 WS 태스크로 덮어쓰면 폴링 루프가
                # 고아 상태로 계속 실행되어 매 봉이 중복 처리되고, WS가 다시
                # connection limit에 걸릴 경우 폴링 루프가 계속 누적된다.
                await _stop_current_stream()
                app_state._current_stream_task = asyncio.create_task(
                    start_alpaca_stream(active_tickers)
                )
        else:
            wait_sec = 60
            print(f"⏳ {wait_sec}초 후 재연결 시도...")
            await asyncio.sleep(wait_sec)
            if is_market_hours():
                app_state._current_stream_task = asyncio.create_task(
                    start_alpaca_stream(active_tickers)
                )
            else:
                print("🌙 [Pulse] 시장 폐장 — 스트림 재시작 스킵 (스냅샷 모드 유지)")


# ── 스케줄러 ─────────────────────────────────────────────────────────────────
