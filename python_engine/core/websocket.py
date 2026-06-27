"""
websocket.py — WebSocket Connection Manager

main.py에서 분리된 WebSocket 연결 관리 모듈.

다른 모듈에서의 import 예시:
  from core.websocket import ConnectionManager
"""

from __future__ import annotations

from typing import List

from fastapi import WebSocket


class ConnectionManager:
    """WebSocket 클라이언트 연결 관리자"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)
