#!/bin/bash
# launchd가 이 스크립트를 통해 uvicorn을 기동한다.
# --reload 없이 실행 — 상시 구동 트레이딩 엔진에서 파일 변경 감지로 인한
# 예기치 않은 재시작(장중 포지션 모니터링 중단)을 막기 위함.
# 개발 중 코드 수정은 여전히 `npm run dev:python`(--reload 포함)로 진행한다.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONUNBUFFERED=1
exec ./.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8001
