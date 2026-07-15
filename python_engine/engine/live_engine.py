"""
live_engine.py — 실거래 엔진

PaperTradingManager의 모든 리스크 로직·DB 추적을 그대로 재사용하되,
매수/매도 체결 시 Alpaca submit_order()를 실제로 호출한다.

사용 전제:
  - APCA_PAPER=false  (실계좌 API 키)
  - TRADE_MODE=LIVE   (main.py에서 라우팅 분기 기준)
"""

from __future__ import annotations

import asyncio
import math
import os
from typing import TYPE_CHECKING

from alpaca.common.exceptions import APIError
from alpaca.trading.enums import OrderSide, OrderStatus, TimeInForce
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.stream import TradingStream

from engine.paper_engine import PaperTradingManager

if TYPE_CHECKING:
    from alpaca.trading.client import TradingClient
    from supabase import Client

# 체결 확인 폴링 — 시장가 주문은 보통 초 단위로 체결되므로 짧게 대기
FILL_POLL_TIMEOUT_SEC = 5.0
FILL_POLL_INTERVAL_SEC = 0.5

_FILLED_STATUSES = {OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED}
_DEAD_STATUSES = {
    OrderStatus.CANCELED,
    OrderStatus.EXPIRED,
    OrderStatus.REJECTED,
    OrderStatus.DONE_FOR_DAY,
}

# Alpaca가 "실계좌에 없는 수량을 매도하려 함(공매도 취급)"으로 거절할 때의 시그니처.
# DB(paper_positions)와 실계좌 보유 상태가 어긋난 phantom position을 나타낸다.
_PHANTOM_POSITION_ERROR_CODE = "42210000"
_PHANTOM_POSITION_ERROR_TEXT = "cannot be sold short"


def _is_phantom_position_error(error: Exception) -> bool:
    msg = str(error)
    return (
        _PHANTOM_POSITION_ERROR_CODE in msg
        or _PHANTOM_POSITION_ERROR_TEXT in msg.lower()
    )


class LiveTradingManager(PaperTradingManager):
    """
    실거래 엔진.

    _on_order_buy / _on_order_sell 훅을 오버라이드해
    Alpaca 시장가 주문을 DB 기록 이전에 제출하고 체결을 확인한다.
    주문 실패/체결 미확인 시 None을 반환 → 상위 호출부에서 DB write 차단.
    """

    def __init__(self, supabase_client: Client, trading_client: TradingClient):
        super().__init__(supabase_client)
        self.alpaca = trading_client

    # ── Alpaca 주문 공통 헬퍼 ─────────────────────────────────────────────────

    async def _submit_alpaca_order(
        self, ticker: str, side: OrderSide, qty: float, fallback_price: float
    ) -> tuple[float, float] | None:
        """
        Alpaca 시장가 주문 제출 후 체결까지 확인.

        qty는 shares 단위. Alpaca 미지원 소수점 주식은 정수로 내림해 제출한다.
        내림 결과가 0주(예산이 1주 가격에도 못 미침)이면 예산 상한을 초과 체결하는
        대신 주문 자체를 차단한다 — 최소 1주 강제 매수는 MAX_BUY_BUDGET 캡을
        크게 초과시킬 수 있다.
        반환값: (실제 체결 수량, 실제 체결 단가) 또는 실패/미체결확인/예산초과 시 None.
        체결 단가는 Alpaca가 반환한 filled_avg_price를 우선 사용하고, 값이 없으면
        fallback_price(호출측 슬리피지 추정가)로 대체한다.
        """
        side_str = "BUY" if side == OrderSide.BUY else "SELL"
        try:
            int_qty = math.floor(qty)
            if int_qty < 1:
                print(
                    f"⛔ [{ticker}] {side_str} 주문 차단 — 요청 수량 {qty:.4f}주가 "
                    f"1주 미만 (강제 1주 매수 시 예산 상한 초과 위험)"
                )
                return None
            req = MarketOrderRequest(
                symbol=ticker,
                qty=int_qty,
                side=side,
                time_in_force=TimeInForce.DAY,
            )
            order = await asyncio.to_thread(self.alpaca.submit_order, req)

            elapsed = 0.0
            while (
                order.status not in _FILLED_STATUSES
                and order.status not in _DEAD_STATUSES
                and elapsed < FILL_POLL_TIMEOUT_SEC
            ):
                await asyncio.sleep(FILL_POLL_INTERVAL_SEC)
                elapsed += FILL_POLL_INTERVAL_SEC
                order = await asyncio.to_thread(self.alpaca.get_order_by_id, order.id)

            if order.status in _DEAD_STATUSES:
                print(
                    f"❌ [LIVE ORDER {order.status}] {ticker} {side_str} order_id={order.id}"
                )
                await self.webhook.send_alert(
                    title=f"🚨 [LIVE ORDER {str(order.status).upper()}] {ticker}",
                    description=f"주문이 체결되지 않았습니다 (order_id: `{order.id}`)",
                    color=0xFF0000,
                )
                return None

            if order.status not in _FILLED_STATUSES:
                # 타임아웃 내 체결 미확인 — 실거래 상태와 DB가 어긋날 수 있으므로
                # 안전하게 실패로 취급해 DB 기록을 차단하고, 미체결 주문이 나중에
                # 조용히 체결되어 로컬 DB에 안 잡히는 유령 실보유가 되지 않도록 취소한다.
                print(
                    f"⚠️ [LIVE ORDER UNCONFIRMED] {ticker} {side_str} "
                    f"order_id={order.id} status={order.status} — 취소 시도"
                )
                try:
                    await asyncio.to_thread(self.alpaca.cancel_order_by_id, order.id)
                except Exception as cancel_err:
                    print(
                        f"⚠️ [LIVE ORDER 취소 실패] {ticker} order_id={order.id}: {cancel_err}"
                    )
                await self.webhook.send_alert(
                    title=f"⚠️ [LIVE ORDER 체결 미확인] {ticker}",
                    description=(
                        f"{FILL_POLL_TIMEOUT_SEC:.0f}초 내 체결 확인 실패해 주문 취소를 시도했습니다 "
                        f"(order_id: `{order.id}`) — Alpaca에서 실제 상태를 반드시 확인하세요."
                    ),
                    color=0xE67E22,
                )
                return None

            filled_qty = float(order.filled_qty or int_qty)
            raw_fill_price = getattr(order, "filled_avg_price", None)
            filled_price = float(raw_fill_price) if raw_fill_price else fallback_price
            print(
                f"✅ [LIVE ORDER] {ticker} {side_str} {filled_qty:.2f}주 @ ${filled_price:.4f} "
                f"→ order_id={order.id} status={order.status}"
            )
            await self.webhook.send_alert(
                title=f"🔴 [LIVE {side_str}] {ticker}",
                description=(
                    f"체결수량: {filled_qty:.2f}주 | 체결단가: ${filled_price:.4f} | order_id: `{order.id}`\n"
                    f"status: {order.status} | TIF: DAY"
                ),
                color=0xFF0000 if side == OrderSide.BUY else 0x8E44AD,
            )
            return filled_qty, filled_price
        except Exception as e:
            print(f"❌ [LIVE ORDER FAILED] {ticker} {side}: {e}")
            if side == OrderSide.SELL and _is_phantom_position_error(e):
                await self._reconcile_phantom_position(ticker, e)
            else:
                await self.webhook.send_alert(
                    title=f"🚨 [LIVE ORDER ERROR] {ticker}",
                    description=f"주문 실패: {e}",
                    color=0xFF0000,
                )
            return None

    async def _reconcile_phantom_position(self, ticker: str, error: Exception) -> None:
        """
        Alpaca가 매도를 거절한 경우(42210000 등), DB(paper_positions)가 실계좌와
        어긋난 상태다. 두 가지 경우를 구분해야 한다:

          1. 실계좌에 정말 0주 — 진짜 phantom position. DB를 EXITED로 정리해
             재시도 루프를 끊는다. (실제 체결이 없었으므로 paper_history/현금
             기록은 남기지 않는다 — 회계상 실제 거래가 아님)
          2. 실계좌에 DB가 알던 것보다 적은/다른 수량이 남아있음 — DB의 units가
             틀렸을 뿐 포지션은 여전히 살아있다. 이 경우 무조건 삭제하면 실제
             보유 물량이 트레일링 스탑 관리 대상에서 영원히 이탈해 방치된다
             (2026-07-10 실사고: JLHL/VRXA/PHGE 등 12개 포지션이 이 경로로
             고아 상태가 되어 하루 종일 무방비로 방치됨). 삭제 전 반드시 Alpaca
             실제 보유 수량을 재조회해 남아있으면 units만 정정하고 관리를 유지한다.
        """
        try:
            alpaca_pos = await asyncio.to_thread(self.alpaca.get_open_position, ticker)
            real_qty = abs(float(alpaca_pos.qty))
        except APIError as e:
            if e.status_code == 404:
                # get_open_position이 명확히 404(포지션 없음)를 반환한 경우에만 진짜 0주로 확정
                real_qty = 0.0
            else:
                # 404 외 API 오류(레이트리밋·인증 등)는 실보유 여부를 확인한 게 아니므로
                # 절대 phantom으로 단정해 삭제하지 않는다 — 안전하게 관리 유지 + 수동 확인 유도
                print(
                    f"⚠️ [{ticker}] Phantom 여부 확인 실패 (APIError status={e.status_code}) "
                    f"— DB 변경 없이 관리 유지"
                )
                await self.webhook.send_alert(
                    title=f"⚠️ [Phantom 여부 확인 실패] {ticker}",
                    description=(
                        f"get_open_position 조회 실패(APIError status={e.status_code}): `{e}`\n"
                        f"실보유 여부를 확인할 수 없어 DB를 변경하지 않았습니다. 수동으로 Alpaca 계좌를 확인하세요."
                    ),
                    color=0xE67E22,
                )
                return
        except Exception as e:
            # 네트워크 타임아웃 등 비-API 예외도 동일하게 확인 불가로 취급해 DB를 건드리지 않는다
            print(
                f"⚠️ [{ticker}] Phantom 여부 확인 실패 (알 수 없는 오류) — DB 변경 없이 관리 유지: {e}"
            )
            await self.webhook.send_alert(
                title=f"⚠️ [Phantom 여부 확인 실패] {ticker}",
                description=(
                    f"get_open_position 조회 중 예상치 못한 오류: `{e}`\n"
                    f"실보유 여부를 확인할 수 없어 DB를 변경하지 않았습니다. 수동으로 Alpaca 계좌를 확인하세요."
                ),
                color=0xE67E22,
            )
            return

        if real_qty and real_qty > 0:
            try:
                await asyncio.to_thread(
                    self.supabase.table("paper_positions")
                    .update({"units": real_qty, "status": "HOLD"})
                    .eq("ticker", ticker)
                    .execute
                )
                print(
                    f"🔧 [POSITION 수량 정정] {ticker} — 실계좌 실보유 {real_qty}주로 units 정정, 관리 유지"
                )
                await self.webhook.send_alert(
                    title=f"🔧 [Position 수량 정정] {ticker}",
                    description=(
                        f"Alpaca가 매도를 거절했습니다 (DB 수량 불일치): `{error}`\n"
                        f"실계좌 실제 보유량({real_qty}주)으로 DB units를 정정했습니다. "
                        f"포지션은 계속 트레일링 스탑 관리 대상입니다."
                    ),
                    color=0xF1C40F,
                )
            except Exception as sync_err:
                print(f"⚠️ [Position 수량 정정 실패] {ticker}: {sync_err}")
                await self.webhook.send_alert(
                    title=f"🚨 [Position 수량 정정 실패] {ticker}",
                    description=(
                        f"원인: `{error}`\nDB 정정 중 추가 오류: `{sync_err}`\n"
                        f"수동으로 paper_positions를 확인하세요."
                    ),
                    color=0xFF0000,
                )
            return

        try:
            await asyncio.to_thread(
                self.supabase.table("paper_positions")
                .delete()
                .eq("ticker", ticker)
                .execute
            )
            await self._sync_watchlist_exit(ticker)
            print(
                f"🧹 [PHANTOM POSITION 정리] {ticker} — 실계좌 보유 0주 확인, DB 포지션 삭제 + watchlist EXITED"
            )
            await self.webhook.send_alert(
                title=f"🧹 [Phantom Position 정리] {ticker}",
                description=(
                    f"Alpaca가 매도를 거절했습니다 (실계좌 보유량 0주 확인됨): `{error}`\n"
                    f"DB의 paper_positions 기록을 삭제하고 watchlist를 EXITED로 동기화했습니다."
                ),
                color=0xE67E22,
            )
        except Exception as sync_err:
            print(f"⚠️ [Phantom Position 정리 실패] {ticker}: {sync_err}")
            await self.webhook.send_alert(
                title=f"🚨 [Phantom Position 정리 실패] {ticker}",
                description=(
                    f"원인: `{error}`\nDB 정리 중 추가 오류: `{sync_err}`\n"
                    f"수동으로 paper_positions/watchlist를 확인하세요."
                ),
                color=0xFF0000,
            )

    # ── 훅 오버라이드 ─────────────────────────────────────────────────────────

    async def _on_order_buy(
        self, ticker: str, qty: float, price: float
    ) -> tuple[float, float] | None:
        print(f"🔴 [LIVE] BUY {ticker} {qty:.2f}주 @ ${price:.4f}")
        return await self._submit_alpaca_order(ticker, OrderSide.BUY, qty, price)

    async def _on_order_sell(
        self, ticker: str, qty: float, price: float, reason: str
    ) -> tuple[float, float] | None:
        print(f"🔴 [LIVE] SELL {ticker} {qty:.2f}주 @ ${price:.4f} ({reason})")
        return await self._submit_alpaca_order(ticker, OrderSide.SELL, qty, price)


# ── Trade Update 스트림 ───────────────────────────────────────────────────────


async def start_trade_update_stream(
    api_key: str,
    api_secret: str,
    webhook_manager,
) -> None:
    """
    Alpaca TradingStream을 구독해 실시간 주문 체결 이벤트를 수신한다.

    filled 이벤트 수신 시 Discord 알림만 발송한다. paper_history 기록은
    paper_engine.py의 매도 로직에서 이미 처리하므로 여기서 중복 기록하지 않는다.

    main.py startup_event에서 asyncio.create_task()로 기동한다.
    """
    is_paper = os.getenv("APCA_PAPER", "true").lower() == "true"
    stream = TradingStream(api_key, api_secret, paper=is_paper)

    async def _on_trade_update(data):
        event = getattr(data, "event", None)
        order = getattr(data, "order", None)
        if order is None:
            return

        ticker = getattr(order, "symbol", "?")
        side = getattr(order, "side", "?")
        qty = getattr(order, "filled_qty", None) or getattr(order, "qty", "?")
        fill_price = getattr(order, "filled_avg_price", None)
        order_id = getattr(order, "id", "?")

        print(
            f"📡 [TradeUpdate] {ticker} event={event} side={side} "
            f"qty={qty} fill_price={fill_price}"
        )

        if event == "fill":
            await webhook_manager.send_alert(
                title=f"✅ [LIVE FILLED] {ticker} {str(side).upper()}",
                description=(
                    f"체결수량: {qty}주 | 체결가: ${fill_price}\n"
                    f"order_id: `{order_id}`"
                ),
                color=0x2ECC71,
            )

        elif event in ("canceled", "expired", "rejected"):
            await webhook_manager.send_alert(
                title=f"⚠️ [LIVE ORDER {event.upper()}] {ticker}",
                description=f"order_id: `{order_id}` | side: {side} | qty: {qty}",
                color=0xE74C3C,
            )

    stream.subscribe_trade_updates(_on_trade_update)

    print("🔴 [LiveEngine] Trade update stream 시작 (실계좌)")
    try:
        await stream._run_forever()
    except Exception as e:
        print(f"❌ [TradeUpdate Stream] 종료: {e}")
    finally:
        try:
            await stream.close()
        except Exception:
            pass
