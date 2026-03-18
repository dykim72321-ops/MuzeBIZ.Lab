-- 1. Fix Function Search Path Mutable
ALTER FUNCTION public.match_stock_patterns(vector, double precision, integer) SET search_path = '';
ALTER FUNCTION public.match_crm_call_plans(vector, double precision, integer) SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- 2. Fix Extension in Public
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- 3. Fix RLS Policy Always True (CRM Tables)
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Public Read/Write CallPlans" ON public.crm_call_plans;
DROP POLICY IF EXISTS "Public Read/Write Companies" ON public.crm_companies;
DROP POLICY IF EXISTS "Public Read/Write Contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Public Read/Write Projects" ON public.crm_projects;

-- Create secure policies (Only authenticated users have access)
CREATE POLICY "Enable all for authenticated users" ON public.crm_call_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.crm_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.crm_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.crm_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
