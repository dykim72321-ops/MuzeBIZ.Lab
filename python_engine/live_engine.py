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
from typing import TYPE_CHECKING

from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.stream import TradingStream

from paper_engine import PaperTradingManager

if TYPE_CHECKING:
    from alpaca.trading.client import TradingClient
    from supabase import Client


class LiveTradingManager(PaperTradingManager):
    """
    실거래 엔진.

    _on_order_buy / _on_order_sell 훅을 오버라이드해
    Alpaca 시장가 주문을 DB 기록 이전에 제출한다.
    주문 실패 시 False를 반환 → 상위 호출부에서 DB write 차단.
    """

    def __init__(self, supabase_client: Client, trading_client: TradingClient):
        super().__init__(supabase_client)
        self.alpaca = trading_client

    # ── Alpaca 주문 공통 헬퍼 ─────────────────────────────────────────────────

    async def _submit_alpaca_order(
        self, ticker: str, side: OrderSide, qty: float
    ) -> bool:
        """
        Alpaca 시장가 주문 제출. 성공 True / 실패 False.

        qty는 shares 단위. 소수점 주식(fractional)은 Alpaca가 지원하는 경우
        그대로 전달하고, 미지원 종목은 정수로 내림.
        """
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
            side_str = "BUY" if side == OrderSide.BUY else "SELL"
            print(
                f"✅ [LIVE ORDER] {ticker} {side_str} {int_qty}주 "
                f"→ order_id={order.id} status={order.status}"
            )
            await self.webhook.send_alert(
                title=f"🔴 [LIVE {side_str}] {ticker}",
                description=(
                    f"수량: {int_qty}주 | order_id: `{order.id}`\n"
                    f"status: {order.status} | TIF: DAY"
                ),
                color=0xFF0000 if side == OrderSide.BUY else 0x8E44AD,
            )
            return True
        except Exception as e:
            print(f"❌ [LIVE ORDER FAILED] {ticker} {side}: {e}")
            await self.webhook.send_alert(
                title=f"🚨 [LIVE ORDER ERROR] {ticker}",
                description=f"주문 실패: {e}",
                color=0xFF0000,
            )
            return False

    # ── 훅 오버라이드 ─────────────────────────────────────────────────────────

    async def _on_order_buy(self, ticker: str, qty: float, price: float) -> bool:
        print(f"🔴 [LIVE] BUY {ticker} {qty:.2f}주 @ ${price:.4f}")
        return await self._submit_alpaca_order(ticker, OrderSide.BUY, qty)

    async def _on_order_sell(
        self, ticker: str, qty: float, price: float, reason: str
    ) -> bool:
        print(f"🔴 [LIVE] SELL {ticker} {qty:.2f}주 @ ${price:.4f} ({reason})")
        return await self._submit_alpaca_order(ticker, OrderSide.SELL, qty)


# ── Trade Update 스트림 ───────────────────────────────────────────────────────


async def start_trade_update_stream(
    api_key: str,
    api_secret: str,
    webhook_manager,
    supabase_client=None,
) -> None:
    """
    Alpaca TradingStream을 구독해 실시간 주문 체결 이벤트를 수신한다.

    filled 이벤트 수신 시:
      - Discord 알림 발송
      - (선택) paper_history에 체결 기록 추가 (supabase_client 전달 시)

    main.py startup_event에서 asyncio.create_task()로 기동한다.
    """
    stream = TradingStream(api_key, api_secret, paper=False)

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

            # paper_history에 실거래 체결 기록 (대시보드 표시용)
            if supabase_client and fill_price and side:
                try:
                    side_str = str(side).lower()
                    if "sell" in side_str:
                        record = {
                            "ticker": ticker,
                            "entry_price": None,
                            "exit_price": float(fill_price),
                            "exit_reason": f"Live Fill ({event})",
                            "pnl_pct": None,
                            "profit_amt": None,
                        }
                        await asyncio.to_thread(
                            supabase_client.table("paper_history")
                            .insert(record)
                            .execute
                        )
                except Exception as db_err:
                    print(f"⚠️ [TradeUpdate] DB 기록 실패: {db_err}")

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
