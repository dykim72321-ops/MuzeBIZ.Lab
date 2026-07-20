-- 개선 검증 트래커의 자동 롤백 기능 지원.
-- 1) system_settings에 런타임 조정 가능한 파라미터 컬럼 추가 (기존 하드코딩 상수의 현재값을 기본값으로 시딩)
-- 2) 검증 판정 이력 + 자동 조치 여부를 기록하는 improvement_rollback_log 테이블 신규 생성

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS penny_dna_gate integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS atr_stop_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_daily_trades_per_ticker integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reentry_cooldown_minutes integer NOT NULL DEFAULT 15;

CREATE TABLE IF NOT EXISTS improvement_rollback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text NOT NULL,
  status text NOT NULL,
  consecutive_regressed integer NOT NULL DEFAULT 0,
  action_taken boolean NOT NULL DEFAULT false,
  action_detail text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_improvement_rollback_log_item_checked
  ON improvement_rollback_log (item_key, checked_at DESC);
