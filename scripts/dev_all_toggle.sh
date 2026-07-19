#!/bin/bash
# npm run dev:all의 실제 진입점.
#
# 로컬 dev:python과 상시 구동 launchd 서비스(com.muzestock.pythonengine)는
# 같은 Alpaca 계정으로 동시에 WebSocket 스트림을 열려고 시도해 충돌한다
# (포트 8001 충돌 + Alpaca "connection limit exceeded"). 그래서 로컬 개발
# 시작 전 launchd 서비스를 내리고, 개발 세션이 끝나면(Ctrl+C 등 어떤
# 방식으로 종료되든) 자동으로 다시 올려 상시 매매 감시(watchdog 포함)가
# 방치되지 않도록 한다.
set -uo pipefail

PLIST="$HOME/Library/LaunchAgents/com.muzestock.pythonengine.plist"
SERVICE_TARGET="gui/$(id -u)/com.muzestock.pythonengine"

restore_production() {
    echo ""
    echo "🔁 [dev:all] 로컬 개발 세션 종료 — 프로덕션 launchd 서비스 복구 중..."
    if [ -f "$PLIST" ]; then
        launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null
        sleep 2
        if launchctl list | grep -q com.muzestock.pythonengine; then
            echo "✅ [dev:all] com.muzestock.pythonengine 복구 완료."
        else
            echo "⚠️ [dev:all] launchd 복구 확인 실패 — 수동으로 확인하세요:"
            echo "    launchctl bootstrap gui/\$(id -u) $PLIST"
        fi
    else
        echo "⚠️ [dev:all] plist를 찾을 수 없습니다: $PLIST"
    fi
}
trap restore_production EXIT INT TERM

if launchctl list 2>/dev/null | grep -q com.muzestock.pythonengine; then
    echo "🛑 [dev:all] 프로덕션 launchd 서비스(com.muzestock.pythonengine) 중지 중..."
    launchctl bootout "$SERVICE_TARGET" 2>/dev/null
    sleep 1
fi

npm-run-all --parallel dev:frontend dev:python
