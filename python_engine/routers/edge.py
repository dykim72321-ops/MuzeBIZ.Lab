"""
routers/edge.py — /api/edge/monitor 엔드포인트
"""

import asyncio
import os

from fastapi import APIRouter, Security

from deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/edge", tags=["edge"])


@router.post("/monitor")
async def run_edge_monitor_endpoint(_api_key: str = Security(get_api_key)):
    """Edge Monitor 수동 실행 — 실제 vs 이론 승률 비교 후 system_settings에 기록."""
    supabase = app_state.supabase
    if not supabase:
        return {"error": "DB 미연결"}
    try:
        from portfolio_backtester import run_edge_monitor

        result = await asyncio.to_thread(
            run_edge_monitor,
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        )
        return result
    except Exception as e:
        return {"error": str(e)}
