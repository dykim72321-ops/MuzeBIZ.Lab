-- 로컬/Railway 등 서로 다른 인스턴스가 같은 Alpaca 계정으로 동시에
-- WebSocket 스트림을 열어 "connection limit exceeded"가 발생하는 문제를
-- TTL 기반 분산 락으로 해결한다. system_settings는 이미 is_armed 등
-- 크로스 프로세스 싱글톤 상태를 저장하는 관례가 있어 여기에 함께 둔다.
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS stream_lock_owner TEXT,
    ADD COLUMN IF NOT EXISTS stream_lock_expires_at TIMESTAMP WITH TIME ZONE;
