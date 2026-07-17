import asyncio
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from state import app_state
from routers import checklist
from core.quant_scanner import run_quant_scan_internal, SCAN_INTERVAL_SECONDS
from market.alpaca_stream import start_alpaca_stream, _stop_current_stream
from utils.utils import is_market_hours


async def mtf_cache_scheduler():
    """15분 주기로 Watchlist 종목들의 15분봉 20 EMA를 캐싱"""
    print("🛡️ [Scheduler] MTF Cache Scheduler started.")
    await asyncio.sleep(10)

    while True:
        try:
            if is_market_hours():
                held = list(app_state._held_tickers)
                discovery = await asyncio.to_thread(
                    app_state.db.get_active_tickers, limit=30
                )
                watching = await asyncio.to_thread(
                    app_state.db.get_watchlist_tickers, limit=30
                )
                active_tickers = list(set(held) | set(discovery) | set(watching))

                await app_state.mtf_cache.update_cache(active_tickers)
        except Exception as e:
            print(f"⚠️ [Scheduler] MTF Cache Error: {e}")
        finally:
            import gc

            gc.collect()

        await asyncio.sleep(900)


async def auto_quant_scan_scheduler():
    """서버 시작 시 즉시 + 이후 SCAN_INTERVAL_SECONDS 주기로 퀀트 스캔 자동 실행 ($100 이하 일반주식)."""
    import gc

    await asyncio.sleep(30)

    while True:
        try:
            print("📡 [Auto-Scan] 자동 퀀트 스캔 시작 (자동 퀀트 스캔)")
            await run_quant_scan_internal()
            print(
                f"✅ [Auto-Scan] 퀀트 스캔 완료 — 다음 실행까지 {SCAN_INTERVAL_SECONDS // 3600}시간 대기"
            )
        except Exception as e:
            print(f"⚠️ [Auto-Scan] 스캔 중 오류: {e}")
        finally:
            gc.collect()

        await asyncio.sleep(SCAN_INTERVAL_SECONDS)


async def auto_paper_history_cleanup_scheduler():
    """paper_history 누적 방지 스케줄러.
    HISTORY_RETENTION_DAYS 경과한 청산 이력을 매일 1회 삭제한다.
    """
    HISTORY_RETENTION_DAYS = 90
    print("🧹 [Scheduler] Paper History Cleanup Scheduler started.")

    while True:
        try:
            if app_state.supabase:
                threshold = (
                    datetime.now(timezone.utc) - timedelta(days=HISTORY_RETENTION_DAYS)
                ).isoformat()
                res = await asyncio.to_thread(
                    app_state.supabase.table("paper_history")
                    .delete()
                    .lt("closed_at", threshold)
                    .execute
                )
                deleted = len(res.data) if res and res.data else 0
                if deleted > 0:
                    print(
                        f"🧹 [Auto-Cleanup] paper_history 정리 완료: {HISTORY_RETENTION_DAYS}일 경과 {deleted}건 삭제"
                    )
        except Exception as e:
            print(f"⚠️ [Auto-Cleanup] paper_history 정리 오류: {e}")

        await asyncio.sleep(24 * 3600)


async def auto_checklist_eval_scheduler():
    """매일 1회 실행: 실계좌 전환 체크리스트 자동 판정 항목 갱신 (routers/checklist.py 위임)."""
    while True:
        try:
            await checklist.evaluate_checklist()
        except Exception as e:
            print(f"❌ [Checklist Eval Error] {e}")

        await asyncio.sleep(86400)


async def stream_scheduler():
    """개장 시간을 감지해 Alpaca 스트림을 자동 시작/종료하는 스케줄러."""
    was_market_open = False

    while True:
        now_open = is_market_hours()

        if now_open and not was_market_open:
            print(
                "🔔 [Scheduler] 개장 감지 — DB에서 최신 watchlist 로드 후 스트림 시작"
            )
            app_state._current_stream_task = asyncio.create_task(start_alpaca_stream())
            was_market_open = True

        elif not now_open and was_market_open:
            print("🌙 [Scheduler] 폐장 감지 — 스트림 종료")
            await _stop_current_stream()
            was_market_open = False

        elif not now_open and not was_market_open:
            now_et = datetime.now(ZoneInfo("America/New_York"))
            open_min = 9 * 60 + 30
            cur_min = now_et.hour * 60 + now_et.minute
            mins_to_open = open_min - cur_min
            if 0 < mins_to_open <= 60:
                print(f"⏰ [Scheduler] 개장 {mins_to_open}분 전 대기 중...")

        await asyncio.sleep(60)


async def paper_portfolio_updater():
    """주기적으로 paper_portfolio (Alpha Fund 수동 포트폴리오)의 현재가와 PnL을 업데이트하는 백그라운드 태스크"""
    import gc
    import yfinance as yf
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockLatestTradeRequest

    print("📈 [Portfolio Updater] Started paper_portfolio live sync task.")

    # Alpaca Client 초기화 (한 번만 수행해 커넥션 풀 재사용)
    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    alpaca_client = None
    if api_key and api_secret:
        try:
            alpaca_client = StockHistoricalDataClient(api_key, api_secret)
            print("✓ [Portfolio Updater] Alpaca Client initialized for portfolio sync")
        except Exception as e:
            print(f"⚠️ [Portfolio Updater] Alpaca Client init error: {e}")

    while True:
        try:
            if not app_state.supabase:
                await asyncio.sleep(15)
                continue

            if not is_market_hours():
                # 장외 시간엔 폴링 주기를 길게 (60초)
                await asyncio.sleep(60)
                continue

            res = await asyncio.to_thread(
                app_state.supabase.table("paper_portfolio")
                .select("*")
                .eq("status", "OPEN")
                .execute
            )
            positions = res.data
            if not positions:
                await asyncio.sleep(15)
                continue

            tickers = list(set([p["ticker"] for p in positions]))
            tickers_str = " ".join(tickers)

            last_prices = {}
            alpaca_success = False

            # 1. Alpaca 최신 체결가 API 시도 (가장 가볍고 누수 없음)
            if alpaca_client and tickers:
                try:
                    request = StockLatestTradeRequest(symbol_or_symbols=tickers)
                    trades_res = await asyncio.to_thread(
                        alpaca_client.get_stock_latest_trade, request
                    )
                    if trades_res:
                        for ticker in tickers:
                            trade = trades_res.get(ticker)
                            if trade:
                                last_prices[ticker] = float(trade.price)
                        alpaca_success = len(last_prices) > 0
                except Exception as alpaca_err:
                    print(
                        f"⚠️ [Portfolio Updater] Alpaca latest trade fetch failed: {alpaca_err}"
                    )

            # 2. Alpaca 실패 시 yfinance fallback 시도
            if not alpaca_success and tickers:
                try:
                    tickers_data = await asyncio.to_thread(
                        yf.download,
                        tickers_str,
                        period="1d",
                        interval="1m",
                        progress=False,
                        threads=True,
                    )

                    if tickers_data is not None and not tickers_data.empty:
                        close_col = tickers_data.get("Close")
                        if close_col is not None and not close_col.empty:
                            if isinstance(close_col, pd.Series):
                                if len(tickers) == 1:
                                    last_prices[tickers[0]] = float(close_col.iloc[-1])
                            else:
                                last_row = close_col.iloc[-1]
                                for ticker in tickers:
                                    if ticker in last_row.index and pd.notna(
                                        last_row[ticker]
                                    ):
                                        last_prices[ticker] = float(last_row[ticker])
                except Exception as yf_err:
                    print(f"⚠️ [Portfolio Updater] yfinance fallback failed: {yf_err}")

            # 3. 가격 업데이트 반영
            if last_prices:
                for pos in positions:
                    ticker = pos["ticker"]
                    if ticker in last_prices:
                        current_price = last_prices[ticker]
                        entry_price = float(pos["entry_price"])
                        pnl_percent = round((current_price / entry_price - 1) * 100, 2)

                        # Only update if the price has changed
                        if (
                            abs(float(pos.get("current_price") or 0) - current_price)
                            > 0.0001
                        ):
                            await asyncio.to_thread(
                                app_state.supabase.table("paper_portfolio")
                                .update(
                                    {
                                        "current_price": round(current_price, 4),
                                        "pnl_percent": pnl_percent,
                                        "updated_at": datetime.now().isoformat(),
                                    }
                                )
                                .eq("id", pos["id"])
                                .execute
                            )
        except Exception as e:
            print(f"⚠️ [Portfolio Updater] Error: {e}")
        finally:
            gc.collect()

        await asyncio.sleep(30)  # 30초 주기 업데이트 (메모리 및 CPU 절약)


async def position_ts_sweeper():
    """30초 주기로 보유 포지션(paper_positions)의 최신 체결가를 직접 조회해
    트레일링 스탑 이탈을 평가하는 안전망 태스크.

    TS 청산은 원래 on_minute_bar_closed() 1분봉 이벤트로만 실행된다. IEX 피드에서
    봉이 뜸한 저유동성 종목이나 서버 재시작 직후(봉 공백)에는 가격이 TS 아래로
    내려가도 다음 봉이 올 때까지 청산이 무기한 지연되는 사각지대가 있었다
    (RAYA 사례, 2026-07-17: TS $2.698 아래 봉 32개가 서버 공백·봉 공백과 겹쳐
    한 번도 평가되지 않음). 이 스윕은 봉 도착과 무관하게 최신 체결가 기준으로
    `price < ts_threshold`만 평가해 청산한다.

    TS 상향(트레일링)·Scale-Out·Time-Decay·EOD는 여전히 1분봉 경로
    (process_signal) 담당이므로 여기서는 ts_threshold/highest_price를 건드리지
    않는다. ARM 해제 상태에서도 실행된다 (TS 청산은 손실 확대 방지 우선 원칙).
    """
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockLatestTradeRequest

    SWEEP_INTERVAL_SEC = 30
    print("🧹 [TS Sweeper] Trailing-stop safety sweep started.")

    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    client = None
    if api_key and api_secret:
        try:
            client = StockHistoricalDataClient(api_key, api_secret)
        except Exception as e:
            print(f"⚠️ [TS Sweeper] Alpaca client init error: {e}")

    while True:
        try:
            engine = app_state.active_engine
            if (
                client is None
                or not app_state.supabase
                or engine is None
                or not is_market_hours()
            ):
                await asyncio.sleep(60)
                continue

            res = await asyncio.to_thread(
                app_state.supabase.table("paper_positions")
                .select("*")
                .in_("status", ["HOLD", "SCALE_OUT"])
                .execute
            )
            positions = res.data or []
            if not positions:
                await asyncio.sleep(SWEEP_INTERVAL_SEC)
                continue

            tickers = sorted({p["ticker"] for p in positions})
            try:
                trades = await asyncio.to_thread(
                    client.get_stock_latest_trade,
                    StockLatestTradeRequest(symbol_or_symbols=tickers),
                )
            except Exception as e:
                print(f"⚠️ [TS Sweeper] latest trade fetch failed: {e}")
                await asyncio.sleep(SWEEP_INTERVAL_SEC)
                continue

            for pos in positions:
                ticker = pos["ticker"]
                trade = trades.get(ticker)
                if not trade:
                    continue
                price = float(trade.price)
                if price <= 0:
                    continue

                ts_threshold = float(pos["ts_threshold"])

                # 봉이 안 와도 대시보드/DB 현재가는 최신으로 유지 (스테일 방지)
                if abs(float(pos.get("current_price") or 0) - price) > 0.0001:
                    try:
                        await asyncio.to_thread(
                            app_state.supabase.table("paper_positions")
                            .update({"current_price": round(price, 4)})
                            .eq("ticker", ticker)
                            .in_("status", ["HOLD", "SCALE_OUT"])
                            .execute
                        )
                    except Exception:
                        pass

                if price >= ts_threshold:
                    continue

                # 1분봉 경로(process_signal)와 동일한 청산 직렬화 락 사용.
                # _close_position 내부의 원자적 CLOSING 클레임이 프로세스 간
                # 중복 청산을 재차 방지한다.
                async with engine._get_exit_lock(ticker):
                    result = await engine._close_position(pos, price, "Trailing Stop")
                if result is None:
                    print(f"⚠️ [TS Sweeper] {ticker} 청산 실패/중복 — 포지션 유지")
                    continue

                app_state._held_tickers.discard(ticker)
                status_emoji = "✅" if result["pnl_pct"] > 0 else "🛑"
                slip_exit_pct = (result["fill_price"] / price - 1) * 100
                print(
                    f"🧹 [TS Sweeper] {ticker} TS 청산 — 최신가 ${price:.4f} < TS ${ts_threshold:.4f}"
                )
                await engine.webhook.send_alert(
                    title=f"{status_emoji} [PAPER EXIT] {ticker}",
                    description=(
                        f"청산가: ${result['fill_price']:.4f} (슬리피지 {slip_exit_pct:+.2f}%) | 수익률: {result['pnl_pct']:.2f}%\n"
                        f"사유: 트레일링 스탑 발동 (TS 스윕 — 1분봉 공백 구간 감지)"
                    ),
                    color=0x34495E,
                )
        except Exception as e:
            print(f"⚠️ [TS Sweeper] Error: {e}")

        await asyncio.sleep(SWEEP_INTERVAL_SEC)


async def stream_liveness_watchdog():
    """3분 주기로 Alpaca WebSocket 생존 여부를 확인."""
    STALE_THRESHOLD_SEC = 300
    CHECK_INTERVAL_SEC = 180
    print("🛡️ [Liveness] Stream watchdog started.")
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SEC)
        if not is_market_hours():
            continue
        if app_state._last_bar_received_at is None:
            continue
        elapsed = (datetime.now() - app_state._last_bar_received_at).total_seconds()
        if elapsed > STALE_THRESHOLD_SEC:
            print(
                f"⚠️ [Liveness] No bar received for {elapsed:.0f}s — forcing stream reconnect."
            )
            # _stop_current_stream()이 _current_stream_task를 취소·대기하고 나서야
            # 새 스트림을 시작해야 한다 — 이전에는 _current_ws_stream.close()만 fire-and-forget으로
            # 호출하고 곧바로 start_alpaca_stream()을 create_task로 띄워, 이전 연결의 종료가
            # 완료되기 전에 새 연결 시도가 겹쳐 Alpaca에 "connection limit exceeded"를
            # 유발할 수 있었다.
            await _stop_current_stream()
            discovery_tickers = await asyncio.to_thread(
                app_state.db.get_active_tickers, limit=15
            )
            watchlist_tickers = await asyncio.to_thread(
                app_state.db.get_watchlist_tickers, limit=15
            )
            active_tickers = list(
                set(discovery_tickers)
                | set(watchlist_tickers)
                | app_state._held_tickers
            )
            if active_tickers:
                app_state._current_stream_task = asyncio.create_task(
                    start_alpaca_stream(active_tickers)
                )


async def system_heartbeat():
    """10분 주기 시스템 상태 보고 (Dead Man's Switch)"""
    print("💓 [Heartbeat] System Monitor Started.")
    while True:
        try:
            await asyncio.sleep(600)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            await app_state.webhook.send_alert(
                use_dev=True,
                title="[HEARTBEAT] System Healthy",
                description=(
                    f"시간: {now}\n상태: Active Monitoring\n"
                    f"연결된 웹소켓: {len(app_state.manager.active_connections)}개"
                ),
                color=0x3498DB,
            )
            print(f"💓 [Heartbeat] Pulse sent at {now}")
        except Exception as e:
            print(f"⚠️ Heartbeat error: {e}")


# ── Watchdog 프로세스 ────────────────────────────────────────────────────────
# watchdog.py는 python_engine/ 루트에 위치 (schedulers/ 하위로 이동되지 않음) —
# __file__ 기준 경로는 반드시 상위 디렉터리(python_engine/)를 가리켜야 한다.
_ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WATCHDOG_PID_FILE = os.path.join(_ENGINE_ROOT, ".watchdog.pid")


def _spawn_watchdog_if_not_running() -> None:
    """PID 파일로 중복 spawn을 방지하며 watchdog 프로세스를 기동한다."""
    watchdog_path = os.path.join(_ENGINE_ROOT, "watchdog.py")

    if os.path.exists(_WATCHDOG_PID_FILE):
        try:
            with open(_WATCHDOG_PID_FILE) as f:
                existing_pid = int(f.read().strip())
            os.kill(existing_pid, 0)
            check = subprocess.run(
                ["ps", "-p", str(existing_pid), "-o", "args="],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if check.returncode != 0 or "watchdog.py" not in check.stdout:
                raise OSError(
                    f"PID {existing_pid} recycled to unrelated process — respawning watchdog"
                )
            print(
                f"🐕 [Startup] Watchdog already running (PID {existing_pid}). Skipping spawn."
            )
            return
        except (ValueError, OSError):
            pass
        except subprocess.TimeoutExpired:
            pass

    try:
        proc = subprocess.Popen(
            [sys.executable, watchdog_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        with open(_WATCHDOG_PID_FILE, "w") as f:
            f.write(str(proc.pid))
        print(f"🐕 [Startup] Watchdog daemon started (PID {proc.pid}).")
    except Exception as e:
        print(f"⚠️ [Startup] Failed to start Watchdog: {e}")


# ── Startup ──────────────────────────────────────────────────────────────────
