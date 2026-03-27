-- Update quant_signals
ALTER TABLE public.quant_signals 
ADD COLUMN IF NOT EXISTS rvol NUMERIC; -- Already exists in 20260321092000_quant_trading_schema.sql, but for safety.

-- Update active_positions
ALTER TABLE public.active_positions
ADD COLUMN IF NOT EXISTS scaled_out BOOLEAN DEFAULT FALSE;

-- Update trade_history
ALTER TABLE public.trade_history
ADD COLUMN IF NOT EXISTS is_win BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.trade_history
ADD COLUMN IF NOT EXISTS exit_reason TEXT; -- Mapping to exit_reason in original schema

-- Ensure indices for performance
CREATE INDEX IF NOT EXISTS idx_quant_signals_status ON public.quant_signals(status);
CREATE INDEX IF NOT EXISTS idx_trade_history_date ON public.trade_history(exit_date DESC);
