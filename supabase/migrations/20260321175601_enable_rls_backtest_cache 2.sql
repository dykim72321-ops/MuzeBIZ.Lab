-- Enable Row Level Security
ALTER TABLE public.backtest_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow everyone (anon and authenticated) to read cached results
CREATE POLICY "Allow public read access on backtest_cache"
ON public.backtest_cache
FOR SELECT
TO public
USING (true);

-- Policy: Allow authenticated users to delete records (for cache flushing)
CREATE POLICY "Allow authenticated delete on backtest_cache"
ON public.backtest_cache
FOR DELETE
TO authenticated
USING (true);

-- Policy: Allow service_role full access (already bypassed, but for clarity)
-- Supabase service_role key already bypasses RLS, so no explicit policy needed here for the edge function.
-- However, we could add one if we want to be explicit.
