-- "고점 매수" 개선(2026-07-20): 확장도 가드(페니 임계값 강화) + 급등 스파이크 가드를
-- 개선 검증 트래커의 자동 롤백 대상(ROLLBACK_ACTIONABLE_ITEMS)에 편입하기 위한 런타임
-- 설정 컬럼 추가. routers/checklist.py _apply_rollback_action("extension_guard_tighten")
-- 및 app/main.py run_startup_sequence()의 재시작 복원 로직이 이 컬럼을 참조한다.

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS extension_guard_penny_tight_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS spike_guard_enabled boolean NOT NULL DEFAULT true;
