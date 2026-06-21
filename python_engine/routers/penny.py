"""
routers/penny.py — /api/penny/* 엔드포인트

페니 스캔 내부 로직(run_penny_scan_internal)은 main.py에 남아있으며
이 라우터는 HTTP 엔드포인트만 담당한다.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Security
from pydantic import BaseModel

from deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/penny", tags=["penny"])

# ── 상수 ────────────────────────────────────────────────────────────────────
PENNY_MAX_PRICE = 1.0
PENNY_TOP_N = 3


class PennyScanRequest(BaseModel):
    max_price: float = PENNY_MAX_PRICE
    top_n: int = PENNY_TOP_N


@router.post("/scan")
async def penny_scan(
    req: PennyScanRequest = Body(PennyScanRequest()),
    _api_key: str = Security(get_api_key),
):
    """수동 페니 스캔 트리거 (HTTP endpoint — 내부 로직은 run_penny_scan_internal 사용)"""
    # run_penny_scan_internal은 main.py에 정의되어 있음 (pulse engine과 결합도 높음)
    from main import run_penny_scan_internal

    return await run_penny_scan_internal(max_price=req.max_price, top_n=req.top_n)


@router.get("/scan/status")
async def penny_scan_status():
    """자동 스캔 상태 조회 — 마지막 실행 시각, 캐시 결과 수, 다음 실행까지 남은 시간"""
    last_penny_scan_at = app_state.last_penny_scan_at
    penny_scan_results_cache = app_state.penny_scan_results_cache

    next_scan_seconds: Optional[int] = None
    if last_penny_scan_at:
        elapsed = (datetime.now() - last_penny_scan_at).total_seconds()
        interval = 4 * 3600
        remaining = interval - elapsed
        next_scan_seconds = max(0, int(remaining))

    return {
        "last_scan_at": last_penny_scan_at.isoformat() if last_penny_scan_at else None,
        "cached_results": len(penny_scan_results_cache),
        "next_scan_in_seconds": next_scan_seconds,
        "auto_scan_active": True,
    }
