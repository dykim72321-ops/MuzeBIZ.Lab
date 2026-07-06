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

from alpaca.trading.enums import OrderSide, OrderStatus, TimeInForce
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.stream import TradingStream

from paper_engine import PaperTradingManager

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
        self, ticker: str, side: OrderSide, qty: float
    ) -> float | None:
        """
        Alpaca 시장가 주문 제출 후 체결까지 확인.

        qty는 shares 단위. Alpaca 미지원 소수점 주식은 정수로 내림해 제출한다.
        반환값: 실제 체결 수량(float, DB units 기준값) 또는 실패/미체결확인 시 None.
        """
        side_str = "BUY" if side == OrderSide.BUY else "SELL"
        try:
            # 최소 1주 보장 (소수점 내림 시 0이 되는 케이스 차단)
            int_qty = max(1, math.floor(qty))
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
                # 안전하게 실패로 취급해 DB 기록을 차단하고 수동 확인을 유도한다.
                print(
                    f"⚠️ [LIVE ORDER UNCONFIRMED] {ticker} {side_str} "
                    f"order_id={order.id} status={order.status}"
                )
                await self.webhook.send_alert(
                    title=f"⚠️ [LIVE ORDER 체결 미확인] {ticker}",
                    description=(
                        f"{FILL_POLL_TIMEOUT_SEC:.0f}초 내 체결 확인 실패 "
                        f"(order_id: `{order.id}`) — Alpaca에서 실제 상태를 확인하세요."
                    ),
                    color=0xE67E22,
                )
                return None

            filled_qty = float(order.filled_qty or int_qty)
            print(
                f"✅ [LIVE ORDER] {ticker} {side_str} {filled_qty:.2f}주 "
                f"→ order_id={order.id} status={order.status}"
            )
            await self.webhook.send_alert(
                title=f"🔴 [LIVE {side_str}] {ticker}",
                description=(
                    f"체결수량: {filled_qty:.2f}주 | order_id: `{order.id}`\n"
                    f"status: {order.status} | TIF: DAY"
                ),
                color=0xFF0000 if side == OrderSide.BUY else 0x8E44AD,
            )
            return filled_qty
        except Exception as e:
            print(f"❌ [LIVE ORDER FAILED] {ticker} {side}: {e}")
            await self.webhook.send_alert(
                title=f"🚨 [LIVE ORDER ERROR] {ticker}",
                description=f"주문 실패: {e}",
                color=0xFF0000,
            )
            return None

    # ── 훅 오버라이드 ─────────────────────────────────────────────────────────

    async def _on_order_buy(
        self, ticker: str, qty: float, price: float
    ) -> float | None:
        print(f"🔴 [LIVE] BUY {ticker} {qty:.2f}주 @ ${price:.4f}")
        return await self._submit_alpaca_order(ticker, OrderSide.BUY, qty)

    async def _on_order_sell(
        self, ticker: str, qty: float, price: float, reason: str
    ) -> float | None:
        print(f"🔴 [LIVE] SELL {ticker} {qty:.2f}주 @ ${price:.4f} ({reason})")
        return await self._submit_alpaca_order(ticker, OrderSide.SELL, qty)


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
