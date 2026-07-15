from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root():
    return {"message": "MuzeBIZ Unified Python Platform is running!"}


# ── WebSocket /ws/pulse ──────────────────────────────────────────────────────
