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
import time
from typing import TYPE_CHECKING

from alpaca.common.exceptions import APIError
from alpaca.trading.enums import OrderSide, OrderStatus, TimeInForce, QueryOrderStatus
from alpaca.trading.requests import (
    GetOrdersRequest,
    LimitOrderRequest,
    MarketOrderRequest,
    StopOrderRequest,
)
from alpaca.trading.stream import TradingStream

from engine.paper_engine import PENNY_MAX_PRICE, PaperTradingManager

if TYPE_CHECKING:
    from alpaca.trading.client import TradingClient
    from supabase import Client

# 체결 확인 폴링 — 시장가 주문은 보통 초 단위로 체결되므로 짧게 대기.
# 페니/저유동성 종목은 스프레드가 넓어 5초 안에 체결 확인이 안 되는 경우가 잦아
# (2026-07-15: UCOP STRONG BUY 5회가 전부 미체결 취소로 유실됨) 더 길게 대기한다.
FILL_POLL_TIMEOUT_SEC = 5.0
PENNY_FILL_POLL_TIMEOUT_SEC = 12.0
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

    IS_LIVE = True

    def __init__(self, supabase_client: Client, trading_client: TradingClient):
        super().__init__(supabase_client)
        self.alpaca = trading_client
        # _submit_alpaca_order()가 실패 시 원인을 구분해 남겨두는 슬롯 — 호출부(라우터)가
        # 사용자에게 "체결 미확인"과 "시장 폐장" 등 서로 다른 원인을 구분해 안내할 수 있게 한다.
        self.last_order_fail_reason: str | None = None
        # 브로커 사이드 Stop-Market 주문 추적: ticker → (order_id, stop_price, qty).
        # ensure_broker_stop()이 "이미 원하는 스탑이 걸려있는지"를 API 호출 없이
        # 판정하는 데 쓴다. 인메모리라 프로세스 재시작 시 초기화되며, 그 경우
        # ensure_broker_stop()이 get_orders로 실제 미체결 주문을 재조회해 복구한다.
        self._broker_stop_orders: dict[str, tuple[str, float, float]] = {}
        # 이 엔진이 직접 제출한 모든 주문 id → 제출 시각. Trade Update 스트림이
        # "엔진이 낸 주문의 체결"(회계 이미 처리됨)과 "브로커 스탑/외부 매도 체결"
        # (회계 미처리 — external_fill 경로 필요)을 구분하는 기준이다.
        self._own_order_ids: dict[str, float] = {}
        # ensure_broker_stop() 재시도 스로틀 — 반복 실패 시 매 스윕(10초)마다
        # Alpaca를 두드리지 않도록 티커당 최소 간격을 둔다.
        self._stop_rearm_last_try: dict[str, float] = {}

    def _register_own_order(self, order_id: str) -> None:
        """엔진이 제출한 주문 id를 기록 (Trade Update 스트림의 자체 주문 판별용)."""
        now = time.time()
        self._own_order_ids[str(order_id)] = now
        if len(self._own_order_ids) > 500:
            cutoff = now - 24 * 3600
            self._own_order_ids = {
                k: v for k, v in self._own_order_ids.items() if v >= cutoff
            }

    # ── Alpaca 주문 공통 헬퍼 ─────────────────────────────────────────────────

    async def _submit_alpaca_order(
        self,
        ticker: str,
        side: OrderSide,
        qty: float,
        fallback_price: float,
        order_kind: str = "MARKET",
        limit_price: float | None = None,
    ) -> tuple[float, float] | None:
        """
        Alpaca 주문 제출 후 체결까지 확인 (시장가 또는 지정가).

        qty는 shares 단위. Alpaca 미지원 소수점 주식은 정수로 내림해 제출한다.
        내림 결과가 0주(예산이 1주 가격에도 못 미침)이면 예산 상한을 초과 체결하는
        대신 주문 자체를 차단한다 — 최소 1주 강제 매수는 MAX_BUY_BUDGET 캡을
        크게 초과시킬 수 있다.
        반환값: (실제 체결 수량, 실제 체결 단가) 또는 실패/미체결확인/예산초과 시 None.
        체결 단가는 Alpaca가 반환한 filled_avg_price를 우선 사용하고, 값이 없으면
        fallback_price(호출측 슬리피지 추정가)로 대체한다.

        order_kind="LIMIT"(눌림목 확인 매수 전용)이면 시장가 대신 limit_price에 지정가
        주문을 제출한다. 지정가 주문은 시장가와 달리 체결이 무기한 지연될 수 있으므로,
        타임아웃 시 시장가처럼 그대로 두지 않고 명시적으로 취소한다(이미 시장가 경로에서
        미체결 시 취소하는 로직을 재사용 — 아래 공통 폴링 분기 참고).
        """
        side_str = "BUY" if side == OrderSide.BUY else "SELL"
        self.last_order_fail_reason = None
        try:
            # 시장이 닫혀 있으면 TimeInForce.DAY 시장가 주문은 개장 전까지 체결되지 않아
            # 아래 폴링이 무조건 타임아웃 → 자동 취소로 이어진다. 제출 자체를 생략하고
            # 명확한 사유를 남겨 호출부가 "체결 실패"가 아닌 "장 폐장"으로 안내하게 한다.
            clock = await asyncio.to_thread(self.alpaca.get_clock)
            if not clock.is_open:
                print(
                    f"⛔ [{ticker}] {side_str} 주문 차단 — 시장 폐장 중 "
                    f"(다음 개장: {clock.next_open})"
                )
                self.last_order_fail_reason = "MARKET_CLOSED"
                await self.webhook.send_alert(
                    title=f"⛔ [{side_str} 차단] {ticker}",
                    description=(
                        f"시장이 닫혀 있어 시장가 주문을 제출하지 않았습니다. "
                        f"다음 개장: {clock.next_open}"
                    ),
                    color=0xE67E22,
                )
                return None

            # 매수(BUY)일 때만 정수로 내림 처리하여 예산 초과 방지
            # 매도(SELL)일 때는 소수점(부분/분할) 수량을 그대로 전송해야 잔여 수량이 묶이지 않음
            order_qty = float(math.floor(qty)) if side == OrderSide.BUY else float(qty)

            if side == OrderSide.BUY and order_qty < 1:
                print(
                    f"⛔ [{ticker}] {side_str} 주문 차단 — 요청 수량 {qty:.4f}주가 "
                    f"1주 미만 (강제 1주 매수 시 예산 상한 초과 위험)"
                )
                return None

            if side == OrderSide.SELL:
                # ── 실제 Alpaca 잔고 체크 (공매도 방지) ──
                try:
                    alpaca_pos = await asyncio.to_thread(
                        self.alpaca.get_open_position, ticker
                    )
                    actual_qty = float(alpaca_pos.qty)
                except Exception:
                    # 포지션이 없으면 예외 발생 (404 Not Found)
                    actual_qty = 0.0

                if actual_qty <= 0:
                    print(
                        f"⛔ [{ticker}] {side_str} 주문 차단 — Alpaca 실제 잔고 없음 "
                        f"(요청: {order_qty:.4f}, 실보유: {actual_qty:.4f}) → DB 포지션 정리 진행"
                    )
                    self.last_order_fail_reason = "NO_POSITION"
                    await self._reconcile_phantom_position(
                        ticker,
                        Exception(f"Alpaca 실제 잔고 없음 (실보유: {actual_qty:.4f})"),
                    )
                    return None

                if order_qty > actual_qty:
                    print(
                        f"⚠️ [{ticker}] {side_str} 주문 수량 보정 — DB 수량({order_qty:.4f})이 "
                        f"Alpaca 실보유({actual_qty:.4f})보다 많아 보정됨"
                    )
                    order_qty = actual_qty

                try:
                    open_req = GetOrdersRequest(
                        status=QueryOrderStatus.OPEN, symbols=[ticker]
                    )
                    open_orders = await asyncio.to_thread(
                        self.alpaca.get_orders, filter=open_req
                    )
                    pending_cancel_ids = []
                    for oo in open_orders:
                        print(
                            f"⚠️ [{ticker}] 기존 미체결 주문이 주식을 락(Lock)하고 있어 취소 시도 (order_id={oo.id})"
                        )
                        try:
                            await asyncio.to_thread(
                                self.alpaca.cancel_order_by_id, oo.id
                            )
                            pending_cancel_ids.append(oo.id)
                        except Exception as cancel_err:
                            print(
                                f"⚠️ [{ticker}] 미체결 주문 취소 실패 (order_id={oo.id}): {cancel_err}"
                            )

                    # sleep으로 취소 완료를 가정하는 대신, 실제로 주문이 CANCELED/EXPIRED 등
                    # 종결 상태로 넘어갈 때까지 짧게 폴링해 확인한다 — 그렇지 않으면 여전히
                    # available=0인 채로 새 SELL을 제출해 동일한 오류가 재발할 수 있다.
                    clear_timeout = 3.0
                    clear_elapsed = 0.0
                    while pending_cancel_ids and clear_elapsed < clear_timeout:
                        await asyncio.sleep(FILL_POLL_INTERVAL_SEC)
                        clear_elapsed += FILL_POLL_INTERVAL_SEC
                        still_pending = []
                        for oid in pending_cancel_ids:
                            try:
                                oo_status = await asyncio.to_thread(
                                    self.alpaca.get_order_by_id, oid
                                )
                                if (
                                    oo_status.status not in _DEAD_STATUSES
                                    and oo_status.status not in _FILLED_STATUSES
                                ):
                                    still_pending.append(oid)
                            except Exception:
                                # 조회 실패 시 안전하게 아직 안 풀렸다고 가정하고 계속 대기
                                still_pending.append(oid)
                        pending_cancel_ids = still_pending

                    if pending_cancel_ids:
                        print(
                            f"⚠️ [{ticker}] {clear_timeout:.0f}초 내 기존 주문 취소 확인 실패 "
                            f"(order_ids={pending_cancel_ids}) — 그래도 매도 시도"
                        )
                except Exception as clear_err:
                    print(f"⚠️ [{ticker}] 기존 미체결 주문 정리 중 에러: {clear_err}")

            if order_kind == "LIMIT":
                if limit_price is None or limit_price <= 0:
                    print(
                        f"⛔ [{ticker}] {side_str} 지정가 주문 차단 — limit_price 누락/무효"
                    )
                    self.last_order_fail_reason = "MISSING_LIMIT_PRICE"
                    return None
                req = LimitOrderRequest(
                    symbol=ticker,
                    qty=order_qty,
                    side=side,
                    time_in_force=TimeInForce.DAY,
                    limit_price=round(limit_price, 4),
                )
            else:
                req = MarketOrderRequest(
                    symbol=ticker,
                    qty=order_qty,
                    side=side,
                    time_in_force=TimeInForce.DAY,
                )
            order = await asyncio.to_thread(self.alpaca.submit_order, req)
            # 스트림이 이 주문 체결을 "외부 매도"로 오인해 이중 회계하지 않도록 기록
            self._register_own_order(order.id)

            poll_timeout = (
                PENNY_FILL_POLL_TIMEOUT_SEC
                if fallback_price <= PENNY_MAX_PRICE
                else FILL_POLL_TIMEOUT_SEC
            )
            elapsed = 0.0
            while (
                order.status not in _FILLED_STATUSES
                and order.status not in _DEAD_STATUSES
                and elapsed < poll_timeout
            ):
                await asyncio.sleep(FILL_POLL_INTERVAL_SEC)
                elapsed += FILL_POLL_INTERVAL_SEC
                order = await asyncio.to_thread(self.alpaca.get_order_by_id, order.id)

            if order.status in _DEAD_STATUSES:
                print(
                    f"❌ [LIVE ORDER {order.status}] {ticker} {side_str} order_id={order.id}"
                )
                self.last_order_fail_reason = "REJECTED"
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
                self.last_order_fail_reason = "UNCONFIRMED"
                try:
                    await asyncio.to_thread(self.alpaca.cancel_order_by_id, order.id)
                except Exception as cancel_err:
                    print(
                        f"⚠️ [LIVE ORDER 취소 실패] {ticker} order_id={order.id}: {cancel_err}"
                    )
                await self.webhook.send_alert(
                    title=f"⚠️ [LIVE ORDER 체결 미확인] {ticker}",
                    description=(
                        f"{poll_timeout:.0f}초 내 체결 확인 실패해 주문 취소를 시도했습니다 "
                        f"(order_id: `{order.id}`) — Alpaca에서 실제 상태를 반드시 확인하세요."
                    ),
                    color=0xE67E22,
                )
                return None

            filled_qty = float(order.filled_qty or order_qty)
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
                self.last_order_fail_reason = "PHANTOM_POSITION"
                await self._reconcile_phantom_position(ticker, e)
            else:
                self.last_order_fail_reason = "ERROR"
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

    STOP_REARM_MIN_INTERVAL_SEC = 60.0  # 재등록 시도 최소 간격 (스윕 10초 주기 스로틀)
    STOP_PRICE_TOLERANCE = 0.001  # 등록된 스탑가와 목표가의 상대 오차 허용치 (0.1%)

    async def ensure_broker_stop(
        self, ticker: str, qty: float, stop_price: float
    ) -> None:
        """
        Alpaca 브로커 사이드 Stop-Market 주문을 "원하는 상태로 수렴"시킨다.

        1분봉 폴링 TS(process_signal/position_ts_sweeper)가 주력 청산 경로이고,
        이 스탑은 봉 공백·서버 다운·네트워크 단절 중의 갭다운을 막는 재해 하한선이다.
        stop_price는 locked floor(진입 시점 ATR 스탑, 본절 락인 도달 시 진입가)만
        따라간다 — 매 봉 ATR 트레일링과의 동기화는 의도적으로 하지 않는다(주문
        cancel/재제출 churn·레이트리밋·취소 실패 고착 위험 대비 이득 없음).

        멱등(idempotent): 이미 같은 스탑가·수량으로 등록돼 있으면 no-op.
        DAY TIF 만료(오버나이트), Scale-Out 매도 전 자동취소, 서버 재시작 후
        미등록 상태는 position_ts_sweeper가 매 스윕마다 이 함수를 다시 호출해
        복구한다. Stop-Market은 트리거 시 시장가로 넘어가므로 지정가식 미체결
        고착(CLOSING 사고 패턴)이 구조적으로 없다.
        """
        # Alpaca 스탑 주문은 소수점 수량 미지원 — 정수 내림, 0주면 등록 생략
        # (남는 소수점 잔량은 파이썬 TS가 계속 방어)
        int_qty = float(math.floor(qty))
        if int_qty < 1 or stop_price <= 0:
            return

        desired = (round(stop_price, 4), int_qty)
        tracked = self._broker_stop_orders.get(ticker)
        if tracked is not None:
            _, cur_stop, cur_qty = tracked
            if (
                abs(cur_stop - desired[0]) <= cur_stop * self.STOP_PRICE_TOLERANCE
                and cur_qty == desired[1]
            ):
                return  # 이미 원하는 스탑이 등록됨 — API 호출 없이 종료

        now = time.time()
        if now - self._stop_rearm_last_try.get(ticker, 0.0) < (
            self.STOP_REARM_MIN_INTERVAL_SEC
        ):
            return
        self._stop_rearm_last_try[ticker] = now

        try:
            clock = await asyncio.to_thread(self.alpaca.get_clock)
            if not clock.is_open:
                return

            # 기존 스탑 주문 정리 — 추적 중인 주문뿐 아니라(재시작으로 추적이
            # 끊긴 경우 대비) 이 티커의 모든 미체결 SELL 주문을 취소한다.
            # 중복 스탑이 남으면 양쪽 모두 체결돼 공매도가 발생할 수 있다.
            try:
                open_req = GetOrdersRequest(
                    status=QueryOrderStatus.OPEN, symbols=[ticker]
                )
                open_orders = await asyncio.to_thread(
                    self.alpaca.get_orders, filter=open_req
                )
                for oo in open_orders:
                    if oo.side == OrderSide.SELL:
                        try:
                            await asyncio.to_thread(
                                self.alpaca.cancel_order_by_id, oo.id
                            )
                        except Exception as cancel_err:
                            print(
                                f"⚠️ [Broker Stop] {ticker} 기존 주문 취소 실패 "
                                f"(order_id={oo.id}): {cancel_err} — 이번 스윕은 재등록 보류"
                            )
                            return  # 중복 스탑 위험 — 취소 확인 전 재등록 금지
            except Exception as list_err:
                print(f"⚠️ [Broker Stop] {ticker} 미체결 주문 조회 실패: {list_err}")
                return

            stop_req = StopOrderRequest(
                symbol=ticker,
                qty=int_qty,
                side=OrderSide.SELL,
                time_in_force=TimeInForce.DAY,
                stop_price=desired[0],
            )
            order = await asyncio.to_thread(self.alpaca.submit_order, stop_req)
            # 주의: _register_own_order()에 넣지 않는다 — 이 스탑의 체결은 엔진이
            # 회계 처리한 적 없는 "외부 체결"이므로, 스트림이 external_fill 경로로
            # paper_history/현금 반영을 수행해야 한다.
            self._broker_stop_orders[ticker] = (str(order.id), desired[0], int_qty)
            print(
                f"🛡️ [Broker Stop] {ticker} Stop-Market ${desired[0]:.4f} × {int_qty:.0f}주 "
                f"등록 (order_id={order.id})"
            )
        except Exception as e:
            print(
                f"⚠️ [Broker Stop 실패] {ticker} (${stop_price:.4f}): {e} "
                f"— 파이썬 TS 스윕이 계속 방어, {self.STOP_REARM_MIN_INTERVAL_SEC:.0f}초 후 재시도"
            )

    # ── 훅 오버라이드 ─────────────────────────────────────────────────────────

    async def _on_order_buy(
        self,
        ticker: str,
        qty: float,
        price: float,
        order_kind: str = "MARKET",
        limit_price: float | None = None,
        stop_price: float | None = None,
    ) -> tuple[float, float] | None:
        if order_kind == "LIMIT":
            print(
                f"🔴 [LIVE] BUY(LIMIT) {ticker} {qty:.2f}주 @ ${limit_price:.4f} "
                f"(fallback ${price:.4f})"
            )
        else:
            print(f"🔴 [LIVE] BUY {ticker} {qty:.2f}주 @ ${price:.4f}")

        res = await self._submit_alpaca_order(
            ticker, OrderSide.BUY, qty, price, order_kind, limit_price
        )
        if res and stop_price and stop_price > 0:
            filled_qty, _ = res
            # fire-and-forget: 스탑 등록 실패가 매수 성공 처리를 막으면 안 됨 —
            # 실패해도 position_ts_sweeper가 매 스윕마다 ensure를 재호출해 복구한다.
            asyncio.create_task(self.ensure_broker_stop(ticker, filled_qty, stop_price))
        return res

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
    engine: "LiveTradingManager | None" = None,
) -> None:
    """
    Alpaca TradingStream을 구독해 실시간 주문 체결 이벤트를 수신한다.

    엔진이 직접 제출한 주문(engine._own_order_ids에 기록됨)의 체결은 Discord
    알림만 발송한다 — paper_history/현금 기록은 paper_engine.py의 매매 로직이
    이미 처리했기 때문이다.

    엔진이 제출하지 않은 SELL 체결(브로커 사이드 Stop-Market 발동, Alpaca
    대시보드 수동 매도 등)은 엔진의 어떤 경로도 회계를 처리한 적이 없으므로,
    여기서 _close_position(external_fill=...)을 호출해 현금/이력/포지션 정리를
    수행한다 — 이 배선이 없으면 브로커 스탑이 체결돼도 DB에는 포지션이 남고
    현금 장부가 실계좌와 어긋난다.

    main.py startup_event에서 asyncio.create_task()로 기동한다.
    """
    is_paper = os.getenv("APCA_PAPER", "true").lower() == "true"
    stream = TradingStream(api_key, api_secret, paper=is_paper)

    async def _handle_external_sell_fill(
        ticker: str, order_id: str, filled_qty: float, fill_price: float
    ) -> None:
        """엔진 외부에서 체결된 SELL을 DB 회계에 반영."""
        tracked = engine._broker_stop_orders.get(ticker)
        is_broker_stop = tracked is not None and tracked[0] == order_id
        if is_broker_stop:
            engine._broker_stop_orders.pop(ticker, None)

        res = await asyncio.to_thread(
            engine.supabase.table("paper_positions")
            .select("*")
            .eq("ticker", ticker)
            .execute
        )
        pos = res.data[0] if res.data else None
        if pos is None or pos.get("status") == "CLOSING":
            # 포지션이 없거나 엔진이 이미 청산 진행 중 — 여기서 건드리지 않는다
            return

        db_units = float(pos["units"])
        if filled_qty < db_units * 0.99:
            # 부분 매도(수동 부분 청산 등) — 전량 청산 회계를 적용하면 잔여
            # 수량 장부가 어긋나므로 자동 처리하지 않고 수동 확인을 요청한다
            await webhook_manager.send_alert(
                title=f"⚠️ [외부 부분 매도 감지] {ticker}",
                description=(
                    f"엔진 외부에서 {filled_qty:.2f}주만 매도됨 (DB 보유 {db_units:.2f}주)\n"
                    f"자동 회계를 건너뜁니다 — paper_positions 수량을 수동 확인하세요."
                ),
                color=0xE67E22,
            )
            return

        reason = "Broker Stop" if is_broker_stop else "External Sell (Broker)"
        async with engine._get_exit_lock(ticker):
            result = await engine._close_position(
                pos, fill_price, reason, external_fill=(filled_qty, fill_price)
            )
        if result is None:
            # CLAIM_CONFLICT — 엔진 청산 경로와 경합, 그쪽이 처리/복구함
            return
        try:
            from app.state import app_state

            app_state._held_tickers.discard(ticker)
        except Exception:
            pass
        status_emoji = "✅" if result["pnl_pct"] > 0 else "🛑"
        await webhook_manager.send_alert(
            title=f"{status_emoji} [BROKER EXIT] {ticker}",
            description=(
                f"청산가: ${result['fill_price']:.4f} | 수익률: {result['pnl_pct']:.2f}%\n"
                f"사유: {reason} — 브로커 단 체결을 회계에 반영"
            ),
            color=0x8E44AD,
        )

    async def _on_trade_update(data):
        event = getattr(data, "event", None)
        order = getattr(data, "order", None)
        if order is None:
            return

        ticker = getattr(order, "symbol", "?")
        side = getattr(order, "side", "?")
        qty = getattr(order, "filled_qty", None) or getattr(order, "qty", "?")
        fill_price = getattr(order, "filled_avg_price", None)
        order_id = str(getattr(order, "id", "?"))

        print(
            f"📡 [TradeUpdate] {ticker} event={event} side={side} "
            f"qty={qty} fill_price={fill_price}"
        )

        if event == "fill":
            is_own = engine is not None and order_id in engine._own_order_ids
            is_sell = str(side).lower().endswith("sell")
            if engine is not None and is_sell and not is_own:
                try:
                    await _handle_external_sell_fill(
                        ticker, order_id, float(qty), float(fill_price)
                    )
                except Exception as ext_err:
                    print(f"⚠️ [TradeUpdate] {ticker} 외부 매도 회계 실패: {ext_err}")
                    await webhook_manager.send_alert(
                        title=f"🚨 [외부 매도 회계 실패] {ticker}",
                        description=(
                            f"브로커 단 SELL 체결({qty}주 @ ${fill_price})을 DB에 반영하지 "
                            f"못했습니다: {ext_err}\npaper_positions/현금을 수동 확인하세요."
                        ),
                        color=0xFF0000,
                    )
                return
            await webhook_manager.send_alert(
                title=f"✅ [LIVE FILLED] {ticker} {str(side).upper()}",
                description=(
                    f"체결수량: {qty}주 | 체결가: ${fill_price}\n"
                    f"order_id: `{order_id}`"
                ),
                color=0x2ECC71,
            )

        elif event in ("canceled", "expired", "rejected"):
            # 추적 중인 브로커 스탑이 죽었으면 추적 해제 → 스위퍼가 재등록
            if engine is not None:
                tracked = engine._broker_stop_orders.get(ticker)
                if tracked is not None and tracked[0] == order_id:
                    engine._broker_stop_orders.pop(ticker, None)
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
