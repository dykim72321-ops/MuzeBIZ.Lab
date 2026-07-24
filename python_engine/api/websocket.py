from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.state import app_state

router = APIRouter()


@router.websocket("/ws/pulse")
async def websocket_endpoint(websocket: WebSocket):
    await app_state.manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        app_state.manager.disconnect(websocket)
    except Exception as e:
        print(f"⚠️ [WebSocket] Unexpected disconnect: {e}")
        app_state.manager.disconnect(websocket)
