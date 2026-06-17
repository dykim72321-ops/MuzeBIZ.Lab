-- system_settings에 Edge Monitor 경보 컬럼 추가
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS edge_alert_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edge_alert_message text;
