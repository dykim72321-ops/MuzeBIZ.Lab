import asyncio
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from datetime import time as dtime
from zoneinfo import ZoneInfo

import pandas as pd

from app.state import app_state
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

        # 상태 표시(/api/quant/scan/status)가 실제 스케줄러의 다음 실행 시각을
        # 그대로 보여줄 수 있도록 기록 — 수동 스캔이 last_penny_scan_at을 갱신해도
        # 이 값은 변하지 않으므로 표시가 실제 스케줄과 어긋나지 않는다.
        app_state.next_auto_scan_at = datetime.now() + timedelta(
            seconds=SCAN_INTERVAL_SECONDS
        )
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


async def auto_improvement_rollback_scheduler():
    """매일 1회 실행: 개선 검증 트래커가 REGRESSED를 연속 판정한 항목을 자동 롤백
    (routers/checklist.py의 evaluate_improvement_rollback()에 위임).

    엔진 파라미터(dna_gate/atr_stop_enabled 등)를 직접 mutate하는 조치이므로, 로컬
    개발 전용 standby 인스턴스(DISABLE_ALPACA_STREAM=true)에서는 돌 필요가 없다 —
    position_ts_sweeper()와 동일한 가드를 사용한다.
    """
    if os.getenv("DISABLE_ALPACA_STREAM", "false").lower() == "true":
        print(
            "🔻 [ImprovementRollback] DISABLE_ALPACA_STREAM=true — 개발 전용 standby, 스케줄러 비활성화."
        )
        return

    while True:
        try:
            await checklist.evaluate_improvement_rollback()
        except Exception as e:
            print(f"❌ [ImprovementRollback Error] {e}")

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

    # 10초 주기 — 보유 종목 전체를 배치 1요청으로 조회하므로 분당 6요청,
    # Alpaca 200req/min 제한 대비 3% 수준. 청산 지연을 최대 30초 → 10초로 단축.
    SWEEP_INTERVAL_SEC = 10
    print("🧹 [TS Sweeper] Trailing-stop safety sweep started.")

    # 이 스위퍼는 start_alpaca_stream()의 스트림 락과 무관하게 앱 시작 시
    # 무조건 켜진다 — 로컬을 DISABLE_ALPACA_STREAM=true(개발 전용 standby)로
    # 띄워도 그대로 매매 실행 경로(_close_position/process_signal)를 태워
    # Railway와 같은 계좌를 계속 건드리게 된다. 실제 중복 체결 자체는
    # paper_positions.ticker UNIQUE 제약·CLOSING 클레임이 DB 레벨에서 막지만,
    # 개발 전용 인스턴스는 애초에 이 루프를 돌 필요가 없다.
    if os.getenv("DISABLE_ALPACA_STREAM", "false").lower() == "true":
        print(
            "🧹 [TS Sweeper] DISABLE_ALPACA_STREAM=true — 개발 전용 standby, 스위퍼 비활성화."
        )
        return

    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    client = None
    if api_key and api_secret:
        try:
            client = StockHistoricalDataClient(api_key, api_secret)
        except Exception as e:
            print(f"⚠️ [TS Sweeper] Alpaca client init error: {e}")

    # CLOSING 고착 복구에 사용 — 마지막 복구 시도 시각을 기억해 매 스윕마다
    # DB 쓰기를 하지 않도록 한다 (최소 5분 간격).
    CLOSING_RECOVERY_TIMEOUT_SEC = 5 * 60  # 5분 이상 CLOSING 고착 시 복구
    _last_closing_recovery: dict[str, float] = {}

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

            # ── CLOSING 고착 포지션 자동 복구 ────────────────────────────────
            # _close_position()의 cash_applied 이후 실패(paper_history INSERT
            # 또는 DELETE 오류)로 status가 CLOSING에 영구 고정되면, 기존 HOLD/
            # SCALE_OUT 필터에 잡히지 않아 TS 감시 사각지대가 된다 (CHAI 사례,
            # 2026-07-22). 5분 이상 CLOSING 상태가 지속되면 후속 기록을 재시도하고
            # 포지션을 정리한다.
            try:
                closing_res = await asyncio.to_thread(
                    app_state.supabase.table("paper_positions")
                    .select("*")
                    .eq("status", "CLOSING")
                    .execute
                )
                for stuck_pos in closing_res.data or []:
                    stuck_ticker = stuck_pos["ticker"]
                    # 이미 최근에 복구 시도한 종목은 스킵 (무한 재시도 방지)
                    last_try = _last_closing_recovery.get(stuck_ticker, 0)
                    if time.time() - last_try < CLOSING_RECOVERY_TIMEOUT_SEC:
                        continue

                    # updated_at으로 CLOSING 전환 시점 추정
                    closing_since: datetime | None = None
                    updated_at_str = stuck_pos.get("updated_at") or stuck_pos.get(
                        "created_at"
                    )
                    if updated_at_str:
                        try:
                            closing_since = datetime.fromisoformat(
                                updated_at_str.replace("Z", "+00:00")
                            )
                            elapsed = (
                                datetime.now(timezone.utc) - closing_since
                            ).total_seconds()
                            if elapsed < CLOSING_RECOVERY_TIMEOUT_SEC:
                                continue  # 아직 5분 미경과 — 정상 청산 진행 중일 수 있음
                        except (ValueError, TypeError):
                            closing_since = None  # 파싱 실패 시 안전하게 복구 진행

                    _last_closing_recovery[stuck_ticker] = time.time()

                    # CLOSING이 곧 "현금 반영됨"을 의미하지 않는다 — 청산 클레임은 실주문
                    # 제출보다 먼저 걸리므로, 주문 제출 자체가 실패(또는 실패 후 되돌리기마저
                    # 실패)한 채로 CLOSING에 고착될 수 있다 (CHAI 2026-07-22 사고: Alpaca에
                    # 매도 주문이 전혀 제출되지 않은 채 24시간+ 고착). Alpaca 실제 포지션을
                    # 조회해 진짜로 체결됐는지부터 확인한다.
                    broker_still_holds = None
                    trading_client = app_state.trading_client
                    if trading_client is not None:
                        try:
                            await asyncio.to_thread(
                                trading_client.get_open_position, stuck_ticker
                            )
                            broker_still_holds = True
                        except Exception:
                            # Alpaca가 "포지션 없음"(404)을 포함해 어떤 예외를 던지든,
                            # 포지션이 없다는 뜻으로 간주 — 실제 청산이 이미 완료된 것.
                            broker_still_holds = False

                    if broker_still_holds:
                        # 아직 브로커에 실제 물량이 남아있다 — DB 기록을 조작(fabricate)해
                        # 청산된 것처럼 만들면 실제 리스크를 추적 불가능하게 만든다. 대신
                        # 클레임을 풀어 다음 정상 TS 체크가 실제 매도 주문을 재시도하게 한다.
                        try:
                            await asyncio.to_thread(
                                app_state.supabase.table("paper_positions")
                                .update(
                                    {
                                        "status": (
                                            "SCALE_OUT"
                                            if stuck_pos.get("is_scaled_out")
                                            else "HOLD"
                                        )
                                    }
                                )
                                .eq("ticker", stuck_ticker)
                                .execute
                            )
                            print(
                                f"🔧 [TS Sweeper] {stuck_ticker} CLOSING 고착 — Alpaca에 실물량 "
                                f"확인됨(주문 미제출로 추정), 클레임 해제해 재청산 유도"
                            )
                        except Exception as unlock_err:
                            print(
                                f"⚠️ [TS Sweeper] {stuck_ticker} CLOSING 클레임 해제 실패: {unlock_err}"
                            )
                        continue  # 이 티커는 DB 기록 재구성 없이 다음 정상 TS 체크에 위임

                    # 실주문(Alpaca)은 이미 체결됐으므로 현금도 이미 반영됐을 가능성이 높다.
                    # paper_history 기록 + paper_positions 삭제만 재시도한다.
                    entry_price = float(stuck_pos.get("entry_price") or 0)
                    units = float(stuck_pos.get("units") or 0)
                    current_price = float(stuck_pos.get("current_price") or entry_price)
                    pnl_pct = (
                        (current_price / entry_price - 1) * 100
                        if entry_price > 0
                        else 0
                    )
                    profit_amt = (current_price - entry_price) * units

                    recovery_ok = False
                    try:
                        # paper_history에 이미 같은 ticker의 최근 기록이 있는지 확인 (이중 기록 방지)
                        recent_hist = await asyncio.to_thread(
                            app_state.supabase.table("paper_history")
                            .select("id")
                            .eq("ticker", stuck_ticker)
                            .order("closed_at", desc=True)
                            .limit(1)
                            .execute
                        )
                        last_closed = None
                        if recent_hist.data:
                            last_closed_str = recent_hist.data[0].get("closed_at")
                            if last_closed_str:
                                try:
                                    last_closed = datetime.fromisoformat(
                                        last_closed_str.replace("Z", "+00:00")
                                    )
                                except (ValueError, TypeError):
                                    pass

                        # 직전 기록이 CLOSING 전환 시점 이후에 남았다면 이미 기록 완료된 것
                        # → INSERT 스킵 (고정 시간창 대신 실제 전환 시점을 기준으로 비교해,
                        # 5분보다 오래 걸린 원래 시도의 성공 기록도 놓치지 않는다)
                        skip_history = last_closed is not None and (
                            closing_since is None or last_closed >= closing_since
                        )
                        if not skip_history:
                            await asyncio.to_thread(
                                app_state.supabase.table("paper_history")
                                .insert(
                                    {
                                        "ticker": stuck_ticker,
                                        "entry_price": entry_price,
                                        "exit_price": current_price,
                                        "signal_price": current_price,
                                        "slippage_pct": 0.0,
                                        "pnl_pct": pnl_pct,
                                        "profit_amt": profit_amt,
                                        "exit_reason": "Trailing Stop (CLOSING Recovery)",
                                    }
                                )
                                .execute
                            )

                        await asyncio.to_thread(
                            app_state.supabase.table("paper_positions")
                            .delete()
                            .eq("ticker", stuck_ticker)
                            .execute
                        )
                        app_state._held_tickers.discard(stuck_ticker)
                        try:
                            await engine._sync_watchlist_exit(stuck_ticker)
                        except Exception:
                            pass  # watchlist 동기화 실패는 치명적이지 않음
                        recovery_ok = True
                    except Exception as rec_err:
                        # 현금은 이미 원래 _close_position() 호출에서 반영됐을 가능성이 높다.
                        # status를 HOLD/SCALE_OUT으로 되돌리면 이후 정상 TS 체크가 다시
                        # _close_position()을 호출해 현금을 한 번 더 반영(이중 정산)할 수 있으므로
                        # 절대 되돌리지 않는다 — CLOSING을 유지하고 다음 스윕에서 재시도한다.
                        print(
                            f"⚠️ [TS Sweeper] {stuck_ticker} CLOSING 복구 재시도 실패: {rec_err} "
                            f"— CLOSING 상태 유지, 다음 스윕에서 재시도"
                        )

                    if recovery_ok:
                        status_emoji = "✅" if pnl_pct > 0 else "🛑"
                        print(
                            f"🔧 [TS Sweeper] {stuck_ticker} CLOSING 고착 복구 완료 — "
                            f"P&L: {pnl_pct:.2f}%"
                        )
                        await engine.webhook.send_alert(
                            title=f"{status_emoji} [CLOSING 복구] {stuck_ticker}",
                            description=(
                                f"CLOSING 상태 고착 포지션을 자동 정리했습니다.\n"
                                f"추정 청산가: ${current_price:.4f} | 수익률: {pnl_pct:.2f}%\n"
                                f"사유: CLOSING 상태 5분 초과 — 후속 기록 재시도 완료"
                            ),
                            color=0xF39C12,
                        )
            except Exception as closing_err:
                print(f"⚠️ [TS Sweeper] CLOSING 복구 단계 오류: {closing_err}")

            # ── 정상 TS 체크 (HOLD / SCALE_OUT) ──────────────────────────────
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
            trades = {}
            try:
                trades = await asyncio.to_thread(
                    client.get_stock_latest_trade,
                    StockLatestTradeRequest(symbol_or_symbols=tickers),
                )
            except Exception as e:
                print(
                    f"⚠️ [TS Sweeper] Batch latest trade fetch failed ({e}), falling back to individual lookup"
                )
                for idx, t in enumerate(tickers):
                    if idx > 0:
                        # 배치 실패가 레이트리밋 때문일 수 있으므로, 곧바로 N번 재요청해
                        # 상황을 악화시키지 않도록 요청 사이에 짧은 텀을 둔다.
                        await asyncio.sleep(0.2)
                    try:
                        tr = await asyncio.to_thread(
                            client.get_stock_latest_trade,
                            StockLatestTradeRequest(symbol_or_symbols=t),
                        )
                        if tr and t in tr:
                            trades[t] = tr[t]
                    except Exception:
                        pass
                if not trades:
                    await asyncio.sleep(SWEEP_INTERVAL_SEC)
                    continue

            now_et = datetime.now(ZoneInfo("America/New_York"))
            is_eod = now_et.time() >= dtime(15, 30)

            for pos in positions:
                # 종목 하나의 처리 중 예외(예: 필드 누락·네트워크 오류)가 나머지
                # 보유 종목의 이번 틱 TS 점검까지 통째로 스킵시키지 않도록 종목별로
                # 격리한다 — 바깥의 함수 전체 try/except는 fetch 단계 실패용.
                try:
                    ticker = pos["ticker"]
                    trade = trades.get(ticker)
                    if not trade:
                        continue
                    price = float(trade.price)
                    if price <= 0:
                        continue

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

                    # EOD 강제청산도 1분봉 경로(on_minute_bar_closed)에만 의존하므로
                    # 같은 종류의 봉 공백 사각지대에 노출된다 — 장 마감 임박 구간에는
                    # 스트림 상태와 무관하게 여기서도 기존 EOD 로직(process_signal)을
                    # 직접 호출해 오버나이트 리스크를 놓치지 않게 한다.
                    if is_eod:
                        # process_signal()이 기존 포지션 분기에서 자체적으로
                        # _get_exit_lock(ticker)을 잡는다 — 여기서 또 잡으면
                        # asyncio.Lock은 재진입 불가라 데드락이 난다.
                        await engine.process_signal(
                            ticker=ticker,
                            price=price,
                            signal_type="SELL",
                            strength="EOD_FORCE",
                            rsi=None,
                            ai_report="[EOD Sweep] 장 마감 강제 청산",
                            is_armed=app_state.SYSTEM_ARMED,
                            dna_score=0.0,
                            recommended_weight=0.0,
                        )
                        # EOD 처리로 포지션이 닫혔을 수 있으므로 이번 틱의 TS 평가는
                        # 다음 스윕(30초 후) 최신 상태에 맡기고 다음 종목으로 넘어간다.
                        continue

                    ts_threshold = float(pos["ts_threshold"])
                    if price >= ts_threshold:
                        continue

                    # 1분봉 경로(process_signal)와 동일한 청산 직렬화 락 사용.
                    # _close_position 내부의 원자적 CLOSING 클레임이 프로세스 간
                    # 중복 청산을 재차 방지한다.
                    async with engine._get_exit_lock(ticker):
                        result = await engine._close_position(
                            pos, price, "Trailing Stop"
                        )
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
                except Exception as pos_err:
                    print(
                        f"⚠️ [TS Sweeper] {pos.get('ticker')} 처리 오류(다른 종목엔 영향 없음): {pos_err}"
                    )
                    continue
        except Exception as e:
            print(f"⚠️ [TS Sweeper] Error: {e}")

        await asyncio.sleep(SWEEP_INTERVAL_SEC)


async def forward_return_logger():
    """engine_decisions에 기록된 모든 신호(실행/차단 무관)에 대해 30분·60분 뒤
    실제 가격 변화(forward return)를 채워 넣는다.

    2026-07-18 수익률 분석에서 DNA≥80 진입조차 승률 22.7%로 드러나 "DNA 점수가
    실제로 수익률을 예측하는가"를 데이터로 검증할 필요가 생겼다. BLOCKED 신호도
    포함하는 이유는 게이트를 낮췄으면 어땠을지까지 사후 검증하기 위함 — 이
    로거가 없으면 게이트 임계값 조정이 항상 추측에 의존하게 된다.

    티커 목록을 모아 배치 1요청으로 최신가를 조회하므로, 결정 건수가 많아져도
    Alpaca 요청 수는 증가하지 않는다(position_ts_sweeper와 동일 패턴).
    """
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockLatestTradeRequest

    CHECK_INTERVAL_SEC = 300
    # 30분/60분이 훨씬 지나도록(장 마감 등으로) 확인 못한 건은 무한정 미확인
    # 상태로 남겨두지 않고 backlog 방지를 위해 24시간 후 포기 처리한다.
    GIVE_UP_AFTER_HOURS = 24
    print("📐 [Forward Return] Signal outcome logger started.")

    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    client = None
    if api_key and api_secret:
        try:
            client = StockHistoricalDataClient(api_key, api_secret)
        except Exception as e:
            print(f"⚠️ [Forward Return] Alpaca client init error: {e}")

    async def _process_window(column_prefix: str, minutes: int):
        checked_col = f"forward_{column_prefix}_checked"
        return_col = f"forward_return_{column_prefix}"
        due_before = (
            datetime.now(timezone.utc) - timedelta(minutes=minutes)
        ).isoformat()
        give_up_before = (
            datetime.now(timezone.utc) - timedelta(hours=GIVE_UP_AFTER_HOURS)
        ).isoformat()

        res = await asyncio.to_thread(
            app_state.supabase.table("engine_decisions")
            .select("id,ticker,price,ts")
            .eq(checked_col, False)
            .lte("ts", due_before)
            .limit(300)
            .execute
        )
        rows = res.data or []
        if not rows:
            return

        expired = [r for r in rows if r["ts"] < give_up_before]
        pending = [r for r in rows if r["ts"] >= give_up_before]

        if expired:
            await asyncio.to_thread(
                app_state.supabase.table("engine_decisions")
                .update({checked_col: True})
                .in_("id", [r["id"] for r in expired])
                .execute
            )
            print(
                f"⌛ [Forward Return] {column_prefix}: {len(expired)}건 24시간 경과로 포기 처리"
            )

        if not pending or client is None:
            return

        tickers = sorted({r["ticker"] for r in pending if r.get("price")})
        if not tickers:
            return
        try:
            trades = await asyncio.to_thread(
                client.get_stock_latest_trade,
                StockLatestTradeRequest(symbol_or_symbols=tickers),
            )
        except Exception as e:
            print(f"⚠️ [Forward Return] {column_prefix}: latest trade fetch failed: {e}")
            return

        for r in pending:
            trade = trades.get(r["ticker"])
            if not trade or not r.get("price"):
                continue
            current_price = float(trade.price)
            if current_price <= 0:
                continue
            forward_return = (current_price / r["price"] - 1) * 100
            try:
                await asyncio.to_thread(
                    app_state.supabase.table("engine_decisions")
                    .update({return_col: round(forward_return, 3), checked_col: True})
                    .eq("id", r["id"])
                    .execute
                )
            except Exception as e:
                print(f"⚠️ [Forward Return] {r['ticker']} update failed: {e}")

    while True:
        try:
            if app_state.supabase and client is not None:
                await _process_window("30m", 30)
                await _process_window("60m", 60)
        except Exception as e:
            print(f"⚠️ [Forward Return] Error: {e}")

        await asyncio.sleep(CHECK_INTERVAL_SEC)


async def stream_liveness_watchdog():
    """3분 주기로 Alpaca WebSocket 생존 여부를 확인."""
    STALE_THRESHOLD_SEC = 300
    CHECK_INTERVAL_SEC = 180
    print("🛡️ [Liveness] Stream watchdog started.")
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SEC)
        if not is_market_hours():
            continue

        # 스트림 락을 쥐고 있으면 TTL을 계속 연장 — 이 갱신이 멈추면(크래시 등)
        # 락이 자동 만료돼 다른 인스턴스(로컬↔Railway)가 승계할 수 있다.
        if app_state._stream_lock_owned and app_state.db and app_state.db.supabase:
            renewed = await asyncio.to_thread(
                app_state.db.renew_stream_lock, app_state._instance_id
            )
            if not renewed:
                print(
                    "⚠️ [Stream Lock] 갱신 실패 — 다른 인스턴스가 락을 가져간 것으로 보임."
                )
                app_state._stream_lock_owned = False

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
# watchdog.py는 python_engine/app/ 아래에 위치 (subprocess로 별도 기동, import되지 않음) —
# __file__ 기준 경로는 반드시 상위 디렉터리(python_engine/)를 가리켜야 한다.
_ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WATCHDOG_PID_FILE = os.path.join(_ENGINE_ROOT, ".watchdog.pid")


def _spawn_watchdog_if_not_running() -> None:
    """PID 파일로 중복 spawn을 방지하며 watchdog 프로세스를 기동한다."""
    watchdog_path = os.path.join(_ENGINE_ROOT, "app", "watchdog.py")

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
