"""
routers/penny.py — /api/penny/* 엔드포인트

퀀트 스캔 내부 로직(run_quant_scan_internal)은 main.py에 정의되어 있으며
이 라우터는 HTTP 엔드포인트만 담당한다. ($100 이하 일반주식 스캔)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Security
from pydantic import BaseModel

from deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/quant", tags=["quant-scan"])

# ── 상수 ────────────────────────────────────────────────────────────────────
SCAN_MAX_PRICE = 100.0
SCAN_TOP_N = 5


class PennyScanRequest(BaseModel):
    max_price: float = SCAN_MAX_PRICE
    top_n: int = SCAN_TOP_N


@router.post("/scan")
async def quant_scan(
    req: PennyScanRequest = Body(PennyScanRequest()),
    _api_key: str = Security(get_api_key),
):
    """수동 퀀트 스캔 트리거 ($100 이하 일반주식 — 내부 로직은 run_quant_scan_internal 사용)"""
    from main import run_quant_scan_internal

    return await run_quant_scan_internal(max_price=req.max_price, top_n=req.top_n)


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
