-- Update active_positions table with smart backend columns
ALTER TABLE active_positions
ADD COLUMN IF NOT EXISTS current_stop_price NUMERIC,
ADD COLUMN IF NOT EXISTS current_target_price NUMERIC;

-- Create an index for faster querying by status, just in case
-- (Already handled by idx_active_positions_ticker, but good for scaling)

-- Add comments for Supabase dashboard
COMMENT ON COLUMN active_positions.current_stop_price IS 'Calculated stop loss price (Hard Stop or Trailing Stop) updated by monitor-positions.';
COMMENT ON COLUMN active_positions.current_target_price IS 'Calculated target price for scaling out or exiting updated by monitor-positions.';
