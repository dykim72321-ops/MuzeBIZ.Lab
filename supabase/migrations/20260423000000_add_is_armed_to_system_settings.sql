-- system_settings에 is_armed 컬럼 추가
-- 서버 재시작 후에도 ARMED 상태 유지
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS is_armed boolean NOT NULL DEFAULT false;
