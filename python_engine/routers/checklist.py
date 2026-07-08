"""
routers/checklist.py — /api/checklist/* 엔드포인트

실계좌(LIVE) 전환 준비도 체크리스트 (live_transition_checklist 테이블) 조회/토글.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Security, status

from deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/checklist", tags=["checklist"])


@router.get("")
async def get_checklist(api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("*")
        .order("sort_order", desc=False)
        .execute
    )
    return res.data or []


@router.post("/{item_key}/toggle")
async def toggle_checklist_item(item_key: str, api_key: str = Security(get_api_key)):
    supabase = app_state.supabase
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB 미연결"
        )

    current = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("is_checked")
        .eq("item_key", item_key)
        .single()
        .execute
    )
    if not current.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="체크리스트 항목 없음"
        )

    new_checked = not current.data["is_checked"]
    updated = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .update(
            {
                "is_checked": new_checked,
                "checked_at": (
                    datetime.now(timezone.utc).isoformat() if new_checked else None
                ),
            }
        )
        .eq("item_key", item_key)
        .execute
    )
    return updated.data[0]
