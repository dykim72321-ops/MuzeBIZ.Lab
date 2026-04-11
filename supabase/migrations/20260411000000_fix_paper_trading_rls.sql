-- 20260411000000_fix_paper_trading_rls.sql
-- Fix: Paper trading tables need anon access for backend server (uses anon key)
-- The previous migration (20260318000001) restricted to 'authenticated' only,
-- which broke the Python backend that uses the anon key.

-- 1. Restore anon + authenticated access to paper trading tables
DROP POLICY IF EXISTS "Auth Read/Write Account" ON public.paper_account;
DROP POLICY IF EXISTS "Auth Read/Write Positions" ON public.paper_positions;
DROP POLICY IF EXISTS "Auth Read/Write History" ON public.paper_history;

CREATE POLICY "Backend Read/Write Account" ON public.paper_account
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Backend Read/Write Positions" ON public.paper_positions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Backend Read/Write History" ON public.paper_history
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Fix total_assets if it's 0 (caused by initialize_account() bug using wrong column names)
UPDATE public.paper_account
SET total_assets = 100000.0, cash_available = 100000.0
WHERE total_assets = 0 OR total_assets IS NULL;

-- 3. Ensure at least one paper account row exists
INSERT INTO public.paper_account (total_assets, cash_available)
SELECT 100000.0, 100000.0
WHERE NOT EXISTS (SELECT 1 FROM public.paper_account);
