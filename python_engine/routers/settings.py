"""
routers/settings.py — /api/settings/* 엔드포인트

Discord Webhook 설정 관리.
"""

import asyncio

from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel

from api.deps import get_api_key
from state import app_state

router = APIRouter(prefix="/api/settings", tags=["settings"])


class WebhookUpdateRequest(BaseModel):
    webhook_url: str


@router.post("/webhook")
async def update_webhook_url(
    req: WebhookUpdateRequest, _api_key: str = Security(get_api_key)
):
    """Discord Webhook URL을 DB에 저장하고 메모리에 즉시 반영."""
    supabase = app_state.supabase
    webhook = app_state.webhook
    paper_engine = app_state.paper_engine

    url = req.webhook_url.strip()
    if url and not url.startswith("https://discord.com/api/webhooks/"):
        raise HTTPException(
            status_code=422, detail="유효하지 않은 Discord Webhook URL 형식입니다."
        )

    if supabase:
        try:
            await asyncio.to_thread(
                supabase.table("system_settings")
                .update({"webhook_url": url or None, "updated_at": "now()"})
                .eq("id", 1)
                .execute
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DB 저장 실패: {e}")

    if webhook:
        webhook.webhook_url = url
        webhook.has_warned = False
    if paper_engine and paper_engine.webhook:
        paper_engine.webhook.webhook_url = url
        paper_engine.webhook.has_warned = False

    print(f"🔗 [Settings] Discord Webhook URL {'설정 완료' if url else '제거됨'}.")
    return {"status": "success", "configured": bool(url)}


@router.post("/webhook/test")
async def test_webhook(_api_key: str = Security(get_api_key)):
    """저장된 Discord Webhook URL로 테스트 메시지를 전송."""
    supabase = app_state.supabase
    webhook = app_state.webhook

    if not webhook:
        raise HTTPException(status_code=503, detail="Webhook manager not initialized")

    if not webhook.webhook_url and supabase:
        try:
            res = await asyncio.to_thread(
                supabase.table("system_settings").select("webhook_url").limit(1).execute
            )
            if res.data and res.data[0].get("webhook_url"):
                webhook.webhook_url = res.data[0]["webhook_url"]
                webhook.has_warned = False
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    if not webhook.webhook_url:
        raise HTTPException(
            status_code=400,
            detail="Discord Webhook URL이 설정되지 않았습니다. 먼저 URL을 저장하세요.",
        )

    await webhook.send_alert(
        title="🧪 MuzeStock.Lab — Webhook 테스트",
        description=(
            "Discord 알림 연결이 정상적으로 작동하고 있습니다! ✅\n\n"
            "Quant Engine이 매수/청산 신호를 이 채널로 전송합니다."
        ),
        color=0x00B347,
    )
    return {"status": "success", "message": "테스트 알림 전송 완료"}
