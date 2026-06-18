-- Add default target profit and default stop loss columns to system_settings
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS default_target_profit NUMERIC DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS default_stop_loss NUMERIC DEFAULT 2.5;

-- Update existing row to set default values if they are null
UPDATE system_settings
SET 
  default_target_profit = COALESCE(default_target_profit, 5.0),
  default_stop_loss = COALESCE(default_stop_loss, 2.5);
