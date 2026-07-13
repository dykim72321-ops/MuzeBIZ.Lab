"""
routers/checklist.py — /api/checklist/* 엔드포인트

실계좌(LIVE) 전환 준비도 체크리스트 (live_transition_checklist 테이블) 조회/토글.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Security, status

from deps import get_api_key
from state import app_state
from routers.strategy import _compute_bucket_stats

router = APIRouter(prefix="/api/checklist", tags=["checklist"])

# ── 자동 검증 임계값 (evaluate_checklist에서 사용) ──
CHECKLIST_MIN_DAYS = 90
CHECKLIST_MIN_TRADES = 50
CHECKLIST_MIN_WIN_RATE = 55
CHECKLIST_MIN_PROFIT_FACTOR = 1.3
CHECKLIST_MAX_MDD = -15.0


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
        .select("is_checked, is_automated")
        .eq("item_key", item_key)
        .single()
        .execute
    )
    if not current.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="체크리스트 항목 없음"
        )

    if current.data.get("is_automated"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="자동 검증 항목은 수동으로 토글할 수 없습니다.",
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


async def evaluate_checklist():
    """paper_history 기반 성과를 계산해 자동 검증 항목(is_checked/auto_note/checked_at)을 갱신.

    main.py의 auto_checklist_eval_scheduler가 24시간마다 호출한다.
    """
    supabase = app_state.supabase
    if not supabase:
        return

    print("🔄 [Checklist Eval] 자동 검증을 시작합니다...")
    res = await asyncio.to_thread(
        supabase.table("paper_history")
        .select("pnl_pct,profit_amt,closed_at,ticker,exit_reason")
        .order("closed_at", desc=False)
        .execute
    )
    trades = res.data or []
    stats = _compute_bucket_stats(trades)
    now_utc = datetime.now(timezone.utc)

    first_trade_dt = None
    if trades and trades[0].get("closed_at"):
        first_trade_dt = datetime.fromisoformat(
            trades[0]["closed_at"].replace("Z", "+00:00")
        )
    days_passed = (now_utc - first_trade_dt).days if first_trade_dt else 0
    total_trades = stats.get("total_trades", 0)
    win_rate = stats.get("win_rate", 0)
    profit_factor = stats.get("profit_factor", 0)
    mdd = stats.get("mdd", 0)

    # (item_key, 통과 여부, 안내 문구)
    conditions = [
        (
            "min_3month_period",
            first_trade_dt is not None and days_passed >= CHECKLIST_MIN_DAYS,
            (
                f"{days_passed}일 경과 / 목표 {CHECKLIST_MIN_DAYS}일"
                if first_trade_dt
                else "거래 내역 없음"
            ),
        ),
        (
            "min_trade_count",
            total_trades >= CHECKLIST_MIN_TRADES,
            f"거래 {total_trades}건 / 목표 {CHECKLIST_MIN_TRADES}건",
        ),
        (
            "win_rate_threshold",
            win_rate >= CHECKLIST_MIN_WIN_RATE
            and profit_factor >= CHECKLIST_MIN_PROFIT_FACTOR,
            f"승률 {win_rate:.1f}% PF {profit_factor:.2f} / 목표 {CHECKLIST_MIN_WIN_RATE}% PF {CHECKLIST_MIN_PROFIT_FACTOR}",
        ),
        (
            "mdd_acceptable",
            mdd >= CHECKLIST_MAX_MDD,
            f"MDD {mdd:.1f}% / 목표 {CHECKLIST_MAX_MDD}% 이내",
        ),
    ]

    current_res = await asyncio.to_thread(
        supabase.table("live_transition_checklist")
        .select("item_key, is_checked, auto_note")
        .in_("item_key", [key for key, _, _ in conditions])
        .execute
    )
    current_state = {item["item_key"]: item for item in (current_res.data or [])}

    for key, new_checked, new_note in conditions:
        curr = current_state.get(key)
        if not curr:
            continue
        old_checked = curr.get("is_checked", False)
        old_note = curr.get("auto_note", "")
        if old_checked == new_checked and old_note == new_note:
            continue

        # 항목은 마이그레이션 시딩 시 이미 생성되어 있고 여기선 갱신만 하므로,
        # upsert(INSERT ... ON CONFLICT) 대신 update를 사용한다. upsert는 충돌 여부와
        # 무관하게 후보 INSERT 행이 NOT NULL 컬럼(category/label 등, 이 payload엔 없음)
        # 검증을 먼저 통과해야 해서 기존 행이 있어도 실패한다.
        update_fields = {"is_checked": new_checked, "auto_note": new_note}
        if new_checked and not old_checked:
            update_fields["checked_at"] = now_utc.isoformat()
        elif not new_checked and old_checked:
            update_fields["checked_at"] = None

        await asyncio.to_thread(
            supabase.table("live_transition_checklist")
            .update(update_fields)
            .eq("item_key", key)
            .execute
        )
        print(
            f"✅ [Checklist Eval] {key} 갱신: {old_checked}->{new_checked} ({new_note})"
        )
