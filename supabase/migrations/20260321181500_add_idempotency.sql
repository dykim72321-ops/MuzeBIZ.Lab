-- Add last_monitored_at for idempotency and surveillance tracking
ALTER TABLE active_positions
ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN active_positions.last_monitored_at IS 'The last time this position was checked by the monitor-positions engine to prevent overlap.';
