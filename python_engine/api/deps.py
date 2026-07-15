"""
deps.py — FastAPI 공통 의존성

각 라우터에서 `from api.deps import get_api_key` 로 임포트한다.
"""

import os

from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader

API_KEY_NAME = "X-Admin-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def get_api_key(header_value: str = Security(api_key_header)) -> str:
    """ADMIN_SECRET_KEY 환경변수와 헤더 값을 비교하여 인증"""
    admin_key = os.getenv("ADMIN_SECRET_KEY") or os.getenv("VITE_ADMIN_SECRET_KEY")
    if not admin_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin secret key not configured on server",
        )
    if header_value == admin_key:
        return header_value
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )
