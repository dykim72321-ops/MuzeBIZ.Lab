"""
routers/portfolio.py — /api/portfolio, /api/discoveries 엔드포인트
"""

import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException

from state import app_state

router = APIRouter(tags=["portfolio"])


@router.get("/api/portfolio")
async def get_portfolio():
    """가상 계좌 잔고 및 보유 포지션 데이터 반환"""
    from engine.paper_engine import INITIAL_CAPITAL

    supabase = app_state.supabase
    paper_engine = app_state.paper_engine

    if not supabase:
        raise HTTPException(status_code=500, detail="DB connection not initialized")

    try:
        acc_task = asyncio.to_thread(
            supabase.table("paper_account").select("*").limit(1).execute
        )
        pos_task = asyncio.to_thread(
            supabase.table("paper_positions").select("*").execute
        )

        acc_res, pos_res = await asyncio.gather(acc_task, pos_task)

        acc = (
            acc_res.data[0]
            if acc_res.data
            else {"total_assets": INITIAL_CAPITAL, "cash_available": INITIAL_CAPITAL}
        )
        positions = pos_res.data

        invested_capital = await paper_engine.calculate_invested_capital(
            positions=positions
        )
        current_total = float(acc.get("cash_available") or 0) + invested_capital

        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        history_res = await asyncio.to_thread(
            supabase.table("paper_history")
            .select("profit_amt")
            .gte("created_at", today_start.isoformat())
            .execute
        )
        daily_pnl = sum(
            float(r.get("profit_amt") or 0) for r in (history_res.data or [])
        )
        daily_pnl_pct = (
            (daily_pnl / INITIAL_CAPITAL * 100) if INITIAL_CAPITAL > 0 else 0
        )

        return {
            "totalAssets": round(float(current_total), 2),
            "cashAvailable": round(float(acc["cash_available"]), 2),
            "investedCapital": round(float(invested_capital), 2),
            "dailyPnL": round(daily_pnl, 2),
            "dailyPnLPct": round(daily_pnl_pct, 2),
            "positions": [
                {
                    "ticker": p["ticker"],
                    "status": p["status"],
                    "weight": round(p["weight"], 4),
                    "entryPrice": p["entry_price"],
                    "currentPrice": p["current_price"],
                    "tsThreshold": p["ts_threshold"],
                    "pnlPct": round(
                        float(p["current_price"] / p["entry_price"] - 1) * 100, 2
                    ),
                }
                for p in positions
            ],
        }
    except Exception as e:
        print(f"❌ Portfolio Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/discoveries")
async def get_discoveries(limit: int = 10, sort_by: str = "updated_at"):
    """오늘의 추천 종목(Alpha Discovery Picks) 목록 반환"""
    db = app_state.db
    try:
        results = await asyncio.to_thread(db.get_latest_discoveries, limit, sort_by)
        return results
    except Exception as e:
        print(f"❌ Discovery Fetch Error: {e}")
        return []
