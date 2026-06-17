-- 20260617234000_add_slippage_columns_to_paper_trading.sql
-- Add tracking columns for slippage analysis (Signal Price vs Fill Price)

-- 1. Update paper_positions table
ALTER TABLE public.paper_positions
ADD COLUMN IF NOT EXISTS signal_price DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS entry_slippage DOUBLE PRECISION;

-- 2. Update paper_history table
ALTER TABLE public.paper_history
ADD COLUMN IF NOT EXISTS signal_price DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS slippage_pct DOUBLE PRECISION;
