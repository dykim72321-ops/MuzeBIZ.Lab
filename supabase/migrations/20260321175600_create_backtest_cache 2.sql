-- Create backtest_cache table for caching Deno backtest results
CREATE TABLE IF NOT EXISTS public.backtest_cache (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    ticker TEXT NOT NULL,
    period TEXT NOT NULL,
    result_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique index to handle upserts based on ticker and period
CREATE UNIQUE INDEX IF NOT EXISTS idx_backtest_cache_lookup ON public.backtest_cache(ticker, period);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_public_backtest_cache_updated_at ON public.backtest_cache;
CREATE TRIGGER set_public_backtest_cache_updated_at
BEFORE UPDATE ON public.backtest_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();
