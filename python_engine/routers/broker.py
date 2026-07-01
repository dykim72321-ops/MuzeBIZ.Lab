"""
routers/broker.py — /api/broker/* 엔드포인트

Alpaca 실계좌 + Paper Trading 양쪽 모두 포함.
"""

import asyncio
import os
from datetime import datetime
from typing import Optional, List

import yfinance as yf
from fastapi import APIRouter, HTTPException, Security, status
from pydantic import BaseModel

from deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/broker", tags=["broker"])


# ── Pydantic 모델 ───────────────────────────────────────────────────────────


class PanicSellRequest(BaseModel):
    confirm: bool


class ArmRequest(BaseModel):
    arm: bool


class OrderRequest(BaseModel):
    ticker: str
    side: str  # 'buy' or 'sell'
    quantity: float
    type: str = "market"  # 'market' or 'limit'
    price: Optional[float] = None


class ClosePositionRequest(BaseModel):
    ticker: str


class PaperSellRequest(BaseModel):
    ticker: str


# ── Alpaca 실계좌 ────────────────────────────────────────────────────────────


@router.get("/account")
async def get_broker_account(api_key: str = Security(get_api_key)):
    """Alpaca 계좌 현황 조회 (Buying Power, PnL 등)"""
    trading_client = app_state.trading_client
    if not trading_client:
        return {"error": "Trading client not initialized"}

    try:
        acc = await asyncio.to_thread(trading_client.get_account)

        equity = float(acc.equity)
        last_equity = float(acc.last_equity)
        today_pnl = equity - last_equity
        today_pnl_pct = (today_pnl / last_equity * 100) if last_equity > 0 else 0

        drawdown = 0.0
        if equity < last_equity:
            drawdown = round(((last_equity - equity) / last_equity) * 100, 2)

        return {
            "buying_power": float(acc.buying_power),
            "equity": equity,
            "today_pnl": round(today_pnl, 2),
            "today_pnl_pct": round(today_pnl_pct, 2),
            "current_drawdown": drawdown,
            "currency": acc.currency,
            "status": acc.status,
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/liquidate-all")
async def liquidate_all_positions(
    req: PanicSellRequest, api_key: str = Security(get_api_key)
):
    """🚨 Master Kill Switch: Cancels all orders and liquidates all positions"""
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")

    trading_client = app_state.trading_client
    webhook = app_state.webhook

    try:
        if not trading_client:
            raise HTTPException(
                status_code=500, detail="Trading client not initialized"
            )

        await asyncio.to_thread(trading_client.cancel_orders)
        liquidate_result = await asyncio.to_thread(
            trading_client.close_all_positions, cancel_orders=True
        )

        if webhook:
            await webhook.send_alert(
                title="🚨 [DEFCON 1] PANIC LIQUIDATE TRIGGERED",
                description="사령관의 명령으로 모든 미체결 주문이 취소되고 포지션 청산이 시작되었습니다.",
                color=0xFF0000,
            )

        return {
            "status": "success",
            "message": "All orders cancelled and positions liquidation initiated.",
            "details": str(liquidate_result),
        }

    except Exception as e:
        print(f"❌ Panic Sell Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_broker_status(api_key: str = Security(get_api_key)):
    """Returns Alpaca connection status and current system ARM state"""
    trading_client = app_state.trading_client
    if not trading_client:
        return {
            "status": "DISCONNECTED",
            "is_armed": app_state.SYSTEM_ARMED,
            "error": "Trading client not initialized",
        }

    try:
        acc = await asyncio.to_thread(trading_client.get_account)
        return {
            "status": "ALIVE",
            "is_armed": app_state.SYSTEM_ARMED,
            "account_status": acc.status,
            "buying_power": float(acc.buying_power),
            "equity": float(acc.equity),
            "currency": acc.currency,
        }
    except Exception as e:
        return {"status": "ERROR", "is_armed": app_state.SYSTEM_ARMED, "error": str(e)}


@router.post("/arm")
async def toggle_arm_system(req: ArmRequest, api_key: str = Security(get_api_key)):
    """Toggles the global SYSTEM_ARMED state and persists to DB."""
    app_state.SYSTEM_ARMED = req.arm
    supabase = app_state.supabase
    webhook = app_state.webhook

    if supabase:
        try:
            await asyncio.to_thread(
                supabase.table("system_settings")
                .update({"is_armed": app_state.SYSTEM_ARMED})
                .eq("id", 1)
                .execute
            )
        except Exception as e:
            print(f"⚠️ [ARM] DB persist failed: {e}")

    status_text = (
        "ARMED (Combat Mode)" if app_state.SYSTEM_ARMED else "DISARMED (Safe Mode)"
    )
    print(f"📡 [SYSTEM] {status_text} by administrator.")

    if webhook:
        await webhook.send_alert(
            title=f"📡 SYSTEM {status_text}",
            description=f"사령관이 시스템을 {'무장' if app_state.SYSTEM_ARMED else '해제'}했습니다. "
            f"{'자동 매수/매도가 활성화됩니다.' if app_state.SYSTEM_ARMED else '자동 매매가 중지됩니다.'}",
            color=0xFF00FF if app_state.SYSTEM_ARMED else 0x5D3FD3,
        )

    return {
        "status": "success",
        "is_armed": app_state.SYSTEM_ARMED,
        "message": f"System {status_text}",
    }


@router.post("/order")
async def execute_manual_order(req: OrderRequest, api_key: str = Security(get_api_key)):
    """Executes a manual market or limit order via Alpaca"""
    import ta
    import pandas as pd
    from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
    from alpaca.trading.enums import OrderSide, TimeInForce

    print(f"📥 [Manual Order] {req.side} {req.quantity} {req.ticker}")
    trading_client = app_state.trading_client
    supabase = app_state.supabase
    webhook = app_state.webhook

    if not trading_client:
        raise HTTPException(status_code=503, detail="Trading client not initialized")

    try:
        side = OrderSide.BUY if req.side.lower() == "buy" else OrderSide.SELL
        symbol = req.ticker.upper()

        if req.type.lower() == "market":
            order_data = MarketOrderRequest(
                symbol=symbol,
                qty=req.quantity,
                side=side,
                time_in_force=TimeInForce.GTC,
            )
        else:
            if not req.price:
                raise HTTPException(
                    status_code=400, detail="Limit price is required for limit orders"
                )
            order_data = LimitOrderRequest(
                symbol=symbol,
                qty=req.quantity,
                side=side,
                limit_price=req.price,
                time_in_force=TimeInForce.GTC,
            )

        print(
            f"⚖️ [Manual Order] Submitting to Alpaca: {symbol} x {req.quantity} {req.side}"
        )
        order = await asyncio.to_thread(trading_client.submit_order, order_data)

        if supabase:
            try:
                ticker_yf = yf.Ticker(symbol)
                df_yf = await asyncio.to_thread(ticker_yf.history, period="5d")
                current_price = req.price if req.price else df_yf["Close"].iloc[-1]

                atr = current_price * 0.05
                if len(df_yf) >= 5:
                    high = df_yf["High"]
                    low = df_yf["Low"]
                    close = df_yf["Close"]
                    atr_series = ta.volatility.AverageTrueRange(
                        high, low, close, window=5
                    ).atr()
                    if not pd.isna(atr_series.iloc[-1]):
                        atr = float(atr_series.iloc[-1])

                if side == OrderSide.BUY:
                    existing_pos = await asyncio.to_thread(
                        supabase.table("active_positions")
                        .select("*")
                        .eq("ticker", symbol)
                        .execute
                    )

                    if existing_pos.data:
                        old = existing_pos.data[0]
                        new_amount = float(old["amount"]) + req.quantity
                        new_entry_price = (
                            float(old["entry_price"]) * float(old["amount"])
                            + current_price * req.quantity
                        ) / new_amount

                        await asyncio.to_thread(
                            supabase.table("active_positions")
                            .update(
                                {
                                    "amount": new_amount,
                                    "entry_price": new_entry_price,
                                    "highest_high": max(
                                        float(old["highest_high"]), current_price
                                    ),
                                    "updated_at": datetime.now().isoformat(),
                                }
                            )
                            .eq("ticker", symbol)
                            .execute
                        )
                    else:
                        new_pos = {
                            "ticker": symbol,
                            "entry_price": current_price,
                            "entry_date": datetime.now().date().isoformat(),
                            "initial_atr": atr,
                            "highest_high": current_price,
                            "days_held": 0,
                            "amount": req.quantity,
                        }
                        await asyncio.to_thread(
                            supabase.table("active_positions").insert(new_pos).execute
                        )

                elif side == OrderSide.SELL:
                    existing_pos = await asyncio.to_thread(
                        supabase.table("active_positions")
                        .select("*")
                        .eq("ticker", symbol)
                        .execute
                    )

                    if existing_pos.data:
                        old = existing_pos.data[0]
                        old_amount = float(old["amount"])

                        if req.quantity >= old_amount:
                            await asyncio.to_thread(
                                supabase.table("active_positions")
                                .delete()
                                .eq("ticker", symbol)
                                .execute
                            )
                            pnl = (
                                current_price - float(old["entry_price"])
                            ) * old_amount
                            pnl_pct = (
                                current_price / float(old["entry_price"]) - 1
                            ) * 100

                            history_data = {
                                "ticker": symbol,
                                "entry_date": old["entry_date"],
                                "exit_date": datetime.now().date().isoformat(),
                                "entry_price": old["entry_price"],
                                "exit_price": current_price,
                                "pnl": pnl,
                                "pnl_percent": pnl_pct,
                                "exit_reason": "MANUAL_SELL",
                            }
                            await asyncio.to_thread(
                                supabase.table("trade_history")
                                .insert(history_data)
                                .execute
                            )
                        else:
                            await asyncio.to_thread(
                                supabase.table("active_positions")
                                .update(
                                    {
                                        "amount": old_amount - req.quantity,
                                        "updated_at": datetime.now().isoformat(),
                                    }
                                )
                                .eq("ticker", symbol)
                                .execute
                            )

                print(f"✅ [Sync] Manual trade for {symbol} synced to Supabase.")
            except Exception as sync_e:
                print(f"⚠️ [Sync Error] Failed to sync manual trade: {sync_e}")

        if webhook:
            color = 0x2ECC71 if side == OrderSide.BUY else 0xE74C3C
            await webhook.send_alert(
                title=f"🎯 [MANUAL ORDER] {symbol} {req.side.upper()}",
                description=f"수량: {req.quantity}주 | 유형: {req.type.upper()}\n상태: {order.status}",
                color=color,
            )

        return {
            "status": "success",
            "order_id": str(order.id),
            "client_order_id": order.client_order_id,
            "message": f"Manual {req.side} order for {symbol} submitted and synced.",
        }
    except Exception as e:
        error_msg = str(e)
        print(f"❌ [Manual Order] Execution failed: {error_msg}")
        return {"status": "error", "error": error_msg}


@router.post("/close-position")
async def close_specific_position(
    req: ClosePositionRequest, api_key: str = Security(get_api_key)
):
    """Closes a specific position by ticker"""
    trading_client = app_state.trading_client
    webhook = app_state.webhook

    if not trading_client:
        raise HTTPException(status_code=500, detail="Trading client not initialized")

    try:
        symbol = req.ticker.upper()
        result = await asyncio.to_thread(
            trading_client.close_position_by_symbol, symbol
        )

        if webhook:
            await webhook.send_alert(
                title=f"🛑 [MANUAL CLOSE] {symbol}",
                description=f"{symbol} 포지션에 대한 수동 청산 명령이 실행되었습니다.",
                color=0xE06666,
            )

        return {
            "status": "success",
            "symbol": symbol,
            "message": f"Position for {symbol} has been closed.",
        }
    except Exception as e:
        print(f"❌ Close Position Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/positions")
async def get_broker_positions(api_key: str = Security(get_api_key)):
    """Alpaca 보유 포지션 조회"""
    trading_client = app_state.trading_client
    if not trading_client:
        return []
    try:
        positions = await asyncio.to_thread(trading_client.get_all_positions)
        return [
            {
                "id": p.asset_id,
                "ticker": p.symbol,
                "entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price),
                "quantity": float(p.qty),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "unrealized_plpc": float(p.unrealized_plpc) * 100,
                "change_percent": float(p.change_today) * 100,
            }
            for p in positions
        ]
    except Exception as e:
        print(f"❌ Broker Positions Error: {e}")
        return {"error": str(e)}


@router.get("/orders")
async def get_broker_orders(limit: int = 50, api_key: str = Security(get_api_key)):
    """Alpaca 최근 주문 내역 조회"""
    trading_client = app_state.trading_client
    if not trading_client:
        return []
    try:
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus

        req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=limit, nested=True)
        orders = await asyncio.to_thread(trading_client.get_orders, filter=req)
        return [
            {
                "id": str(o.id),
                "ticker": o.symbol,
                "side": o.side.value,
                "type": o.type.value,
                "quantity": float(o.qty) if o.qty else 0,
                "filled_qty": float(o.filled_qty) if o.filled_qty else 0,
                "filled_avg_price": (
                    float(o.filled_avg_price) if o.filled_avg_price else 0
                ),
                "status": o.status.value,
                "created_at": o.created_at.isoformat(),
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ]
    except Exception as e:
        print(f"❌ Broker Orders Error: {e}")
        return {"error": str(e)}


# ── Paper Trading ────────────────────────────────────────────────────────────


@router.get("/paper/account")
async def get_paper_account(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 계좌 정보 조회"""
    from paper_engine import INITIAL_CAPITAL

    paper_engine = app_state.paper_engine
    supabase = app_state.supabase

    if not paper_engine:
        return {"error": "Paper engine not initialized"}
    try:
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        acc, invested_capital, history_res = await asyncio.gather(
            paper_engine.get_account(),
            paper_engine.calculate_invested_capital(),
            asyncio.to_thread(
                supabase.table("paper_history")
                .select("profit_amt")
                .gte("created_at", today_start.isoformat())
                .execute
            ),
        )
        if not acc:
            return {"error": "Account not found"}

        cash_available = float(acc.get("cash_available") or INITIAL_CAPITAL)
        total_assets = cash_available + invested_capital

        total_pnl = total_assets - INITIAL_CAPITAL
        total_pnl_pct = (
            (total_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )
        current_drawdown = round(min(total_pnl_pct, 0), 2)

        today_pnl = sum(
            float(r.get("profit_amt") or 0) for r in (history_res.data or [])
        )
        today_pnl_pct = (
            (today_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )

        return {
            "cash_available": round(cash_available, 2),
            "total_assets": round(total_assets, 2),
            "invested_capital": round(invested_capital, 2),
            "today_pnl": round(today_pnl, 2),
            "today_pnl_pct": round(today_pnl_pct, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "current_drawdown": current_drawdown,
            "currency": "USD",
            "status": "ACTIVE",
            "is_paper_trading": True,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/paper/positions")
async def get_paper_positions(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 현재 포지션 조회"""
    paper_engine = app_state.paper_engine
    supabase = app_state.supabase

    if not paper_engine:
        return []
    try:
        res = await asyncio.to_thread(
            supabase.table("paper_positions").select("*").execute
        )
        return res.data
    except Exception:
        return []


@router.get("/paper/history")
async def get_paper_history(api_key: str = Security(get_api_key)):
    """Supabase 기반 페이퍼 트레이딩 매매 이력 조회"""
    paper_engine = app_state.paper_engine
    supabase = app_state.supabase

    if not paper_engine:
        return []
    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("*")
            .order("created_at", desc=True)
            .limit(30)
            .execute
        )
        history = []
        for item in res.data:
            pnl_pct = item.get("pnl_pct", 0)
            history.append(
                {
                    "id": str(item.get("id")),
                    "ticker": item.get("ticker"),
                    "side": "sell",
                    "type": item.get("exit_reason") or "trailing_stop",
                    "quantity": item.get("units", "--"),
                    "filled_qty": item.get("units", "--"),
                    "filled_avg_price": item.get("exit_price"),
                    "entry_price": item.get("entry_price"),
                    "exit_price": item.get("exit_price"),
                    "exit_reason": item.get("exit_reason") or "trailing_stop",
                    "pnl_pct": round(float(pnl_pct or 0), 2),
                    "profit_amt": round(float(item.get("profit_amt") or 0), 2),
                    "status": "filled",
                    "created_at": item.get("closed_at") or item.get("created_at"),
                }
            )
        return history
    except Exception:
        return []


@router.delete("/paper/history/{history_id}")
async def delete_paper_history(history_id: str, _api_key: str = Security(get_api_key)):
    """청산 이력 단건 삭제"""
    supabase = app_state.supabase
    try:
        res = await asyncio.to_thread(
            supabase.table("paper_history").delete().eq("id", history_id).execute
        )
        if res.data:
            return {"ok": True, "deleted_id": history_id}
        return {"ok": False, "detail": "Record not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/paper/sell")
async def manual_paper_sell(
    req: PaperSellRequest, api_key: str = Security(get_api_key)
):
    """사령관 수동 페이퍼 트레이딩 포지션 청산"""
    from paper_engine import _apply_slippage

    paper_engine = app_state.paper_engine
    supabase = app_state.supabase

    if not paper_engine:
        raise HTTPException(status_code=503, detail="Paper engine not initialized")

    ticker = req.ticker.upper()
    pos = await paper_engine.get_position(ticker)
    if not pos:
        raise HTTPException(status_code=404, detail=f"No open position for {ticker}")

    entry_price = float(pos["entry_price"])
    units = float(pos["units"])

    signal_price = float(pos.get("current_price") or entry_price)
    try:
        tick = yf.Ticker(ticker)
        hist = tick.history(period="1d", interval="1m")
        if not hist.empty:
            signal_price = float(hist["Close"].iloc[-1])
    except Exception:
        pass

    is_penny = entry_price <= 1.0
    fill_price = _apply_slippage(signal_price, is_buy=False, is_penny=is_penny)
    slippage_pct = (fill_price / signal_price - 1) * 100

    pnl_pct = (fill_price / entry_price - 1) * 100
    profit_amt = (fill_price - entry_price) * units
    proceeds = fill_price * units

    acc = await paper_engine.get_account()
    if acc:
        new_cash = float(acc["cash_available"]) + proceeds
        await asyncio.to_thread(
            supabase.table("paper_account")
            .update({"cash_available": new_cash})
            .eq("id", acc["id"])
            .execute
        )

    history_data = {
        "ticker": ticker,
        "entry_price": entry_price,
        "exit_price": fill_price,
        "signal_price": signal_price,
        "slippage_pct": round(slippage_pct, 4),
        "pnl_pct": round(pnl_pct, 2),
        "profit_amt": round(profit_amt, 2),
        "exit_reason": "Manual Sell",
    }
    await asyncio.to_thread(
        supabase.table("paper_history").insert(history_data).execute
    )
    await asyncio.to_thread(
        supabase.table("paper_positions").delete().eq("ticker", ticker).execute
    )

    status_emoji = "✅" if pnl_pct > 0 else "🛑"
    await paper_engine.webhook.send_alert(
        title=f"{status_emoji} [PAPER MANUAL EXIT] {ticker}",
        description=(
            f"시장가: ${signal_price:.4f} → 체결가: ${fill_price:.4f} "
            f"(슬리피지 {slippage_pct:+.2f}%) | 수익률: {pnl_pct:.2f}%\n사유: 사령관 수동 매도"
        ),
        color=0x2ECC71 if pnl_pct > 0 else 0xE74C3C,
    )

    return {
        "status": "success",
        "ticker": ticker,
        "exit_price": round(fill_price, 4),
        "pnl_pct": round(pnl_pct, 2),
        "profit_amt": round(profit_amt, 2),
    }


@router.post("/paper/emergency-liquidate")
async def emergency_liquidate(api_key: str = Security(get_api_key)):
    """Watchdog 트리거: SYSTEM_ARMED 해제 + 모든 paper 포지션을 DB에서 정리."""
    app_state.SYSTEM_ARMED = False

    paper_engine = app_state.paper_engine
    supabase = app_state.supabase
    webhook = app_state.webhook

    if not paper_engine:
        return {"status": "error", "detail": "Paper engine not initialized"}

    if supabase:
        try:
            await asyncio.to_thread(
                supabase.table("system_settings")
                .update({"is_armed": False})
                .eq("id", 1)
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Emergency] ARM DB persist failed: {e}")

    positions = await paper_engine.get_all_positions()
    if not positions:
        return {"status": "success", "closed": 0, "message": "포지션 없음"}

    acc = await paper_engine.get_account()
    total_proceeds = 0.0
    closed_tickers = []

    for pos in positions:
        ticker = pos["ticker"]
        entry_price = float(pos["entry_price"])
        units = float(pos["units"])
        exit_price = float(pos.get("current_price") or entry_price)
        pnl_pct = (exit_price / entry_price - 1) * 100 if entry_price > 0 else 0.0
        profit_amt = (exit_price - entry_price) * units
        proceeds = exit_price * units

        try:
            history_data = {
                "ticker": ticker,
                "entry_price": entry_price,
                "exit_price": exit_price,
                "pnl_pct": round(pnl_pct, 2),
                "profit_amt": round(profit_amt, 2),
                "exit_reason": "Watchdog Emergency Liquidation",
            }
            await asyncio.to_thread(
                supabase.table("paper_history").insert(history_data).execute
            )
            await asyncio.to_thread(
                supabase.table("paper_positions").delete().eq("ticker", ticker).execute
            )
            closed_tickers.append(ticker)
            total_proceeds += proceeds
        except Exception as e:
            print(f"⚠️ [Emergency] Failed to close {ticker}: {e}")

    if acc and total_proceeds > 0:
        try:
            new_cash = float(acc["cash_available"]) + total_proceeds
            await asyncio.to_thread(
                supabase.table("paper_account")
                .update({"cash_available": new_cash})
                .eq("id", acc["id"])
                .execute
            )
        except Exception as e:
            print(f"⚠️ [Emergency] Cash update failed: {e}")

    for t in closed_tickers:
        app_state._held_tickers.discard(t)

    if webhook:
        await webhook.send_alert(
            title="🚨 [WATCHDOG] 긴급 청산 완료 — 자동매매 해제",
            description=(
                f"청산 종목: {', '.join(closed_tickers) or '없음'}\n"
                "SYSTEM_ARMED → False\n24시간 셧다운 모드 진입."
            ),
            color=0xFF0000,
        )
    print(
        f"🚨 [Emergency] Liquidated {len(closed_tickers)} positions. SYSTEM_ARMED=False."
    )

    return {
        "status": "success",
        "closed": len(closed_tickers),
        "tickers": closed_tickers,
        "is_armed": False,
    }


class QuotesRequest(BaseModel):
    tickers: List[str]


@router.get("/closed-trades")
async def get_closed_trades(limit: int = 30, api_key: str = Security(get_api_key)):
    """Alpaca 체결 주문 기반 FIFO 손익 계산 — 완성된 매수→매도 라운드트립 반환"""
    trading_client = app_state.trading_client
    if not trading_client:
        return []

    try:
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus

        req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=500, nested=False)
        orders = await asyncio.to_thread(trading_client.get_orders, filter=req)

        # 체결 완료 주문만 필터, fill 시각 오름차순 정렬
        filled = [
            o
            for o in orders
            if str(o.status.value) == "filled"
            and o.filled_at
            and float(o.filled_qty or 0) > 0
        ]
        filled.sort(key=lambda o: o.filled_at)

        # FIFO 포지션 장부: ticker → [{price, qty}]
        book: dict[str, list[dict]] = {}
        closed_trades: list[dict] = []

        for o in filled:
            ticker = o.symbol
            qty = float(o.filled_qty or 0)
            price = float(o.filled_avg_price or 0)
            side = str(o.side.value)
            filled_at = o.filled_at

            if side == "buy":
                book.setdefault(ticker, []).append({"price": price, "qty": qty})

            elif side == "sell" and book.get(ticker):
                remain = qty
                total_cost = 0.0
                matched = 0.0

                lots = book[ticker]
                while remain > 0 and lots:
                    lot = lots[0]
                    take = min(lot["qty"], remain)
                    total_cost += lot["price"] * take
                    matched += take
                    remain -= take
                    lot["qty"] -= take
                    if lot["qty"] < 1e-6:
                        lots.pop(0)

                if matched > 0:
                    avg_entry = total_cost / matched
                    pnl_pct = (price / avg_entry - 1) * 100 if avg_entry > 0 else 0.0
                    profit_amt = (price - avg_entry) * matched
                    closed_trades.append(
                        {
                            "id": str(o.id),
                            "ticker": ticker,
                            "units": round(matched, 4),
                            "entry_price": round(avg_entry, 4),
                            "exit_price": round(price, 4),
                            "pnl_pct": round(pnl_pct, 2),
                            "profit_amt": round(profit_amt, 2),
                            "exit_reason": "Alpaca Order",
                            "created_at": filled_at.isoformat(),
                        }
                    )

        # 최신순 반환
        closed_trades.reverse()
        return closed_trades[:limit]

    except Exception as e:
        print(f"❌ Closed Trades Error: {e}")
        return []


@router.get("/quote/{ticker}")
async def get_alpaca_quote(ticker: str, api_key: str = Security(get_api_key)):
    """Alpaca 실시간 단일 시세 및 거래 정보 조회"""
    api_key_id = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    if not api_key_id or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca API keys not configured")

    try:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import (
            StockLatestTradeRequest,
            StockLatestQuoteRequest,
        )

        client = StockHistoricalDataClient(api_key_id, api_secret)

        # 1. Latest Trade
        trade_req = StockLatestTradeRequest(symbol_or_symbols=ticker)
        trade_res = await asyncio.to_thread(client.get_stock_latest_trade, trade_req)

        # 2. Latest Quote
        quote_req = StockLatestQuoteRequest(symbol_or_symbols=ticker)
        quote_res = await asyncio.to_thread(client.get_stock_latest_quote, quote_req)

        trade = trade_res.get(ticker)
        quote = quote_res.get(ticker)

        if not trade:
            raise HTTPException(
                status_code=404, detail=f"No trade data found for {ticker}"
            )

        return {
            "ticker": ticker,
            "price": float(trade.price),
            "size": float(trade.size),
            "timestamp": trade.timestamp.isoformat(),
            "bid_price": float(quote.bid_price) if quote else 0.0,
            "ask_price": float(quote.ask_price) if quote else 0.0,
            "bid_size": float(quote.bid_size) if quote else 0.0,
            "ask_size": float(quote.ask_size) if quote else 0.0,
        }
    except Exception as e:
        print(f"❌ Alpaca Quote Error for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quotes")
async def get_alpaca_quotes(req: QuotesRequest, api_key: str = Security(get_api_key)):
    """Alpaca 실시간 다중 시세 및 거래 정보 조회 (Batch)"""
    api_key_id = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")
    if not api_key_id or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca API keys not configured")

    if not req.tickers:
        return {}

    try:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import (
            StockLatestTradeRequest,
            StockLatestQuoteRequest,
        )

        client = StockHistoricalDataClient(api_key_id, api_secret)

        # 1. Latest Trades
        trade_req = StockLatestTradeRequest(symbol_or_symbols=req.tickers)
        trade_res = await asyncio.to_thread(client.get_stock_latest_trade, trade_req)

        # 2. Latest Quotes
        quote_req = StockLatestQuoteRequest(symbol_or_symbols=req.tickers)
        quote_res = await asyncio.to_thread(client.get_stock_latest_quote, quote_req)

        results = {}
        for ticker in req.tickers:
            trade = trade_res.get(ticker)
            quote = quote_res.get(ticker)
            if trade:
                results[ticker] = {
                    "ticker": ticker,
                    "price": float(trade.price),
                    "size": float(trade.size),
                    "timestamp": trade.timestamp.isoformat(),
                    "bid_price": float(quote.bid_price) if quote else 0.0,
                    "ask_price": float(quote.ask_price) if quote else 0.0,
                    "bid_size": float(quote.bid_size) if quote else 0.0,
                    "ask_size": float(quote.ask_size) if quote else 0.0,
                }
        return results
    except Exception as e:
        print(f"❌ Alpaca Quotes Batch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
