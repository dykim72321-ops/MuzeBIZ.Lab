-- rsi_falling_knife_fix(2026-08-01) 개선 검증 트래커 자동 롤백 편입(2026-08-04)을 위한
-- 런타임 설정 컬럼. quant_engine.set_rsi_mean_reversion_mode()가 이 값을 모듈 플래그로
-- 반영하고, routers/checklist.py _apply_rollback_action("rsi_falling_knife_fix") 및
-- app/main.py run_startup_sequence()의 재시작 복원 로직이 이 컬럼을 참조한다.
-- false(기본) = 현재 낙폭방어 채점식, true = 2026-08-01 이전 평균회귀 채점식으로 롤백.

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS rsi_mean_reversion_mode boolean NOT NULL DEFAULT false;
