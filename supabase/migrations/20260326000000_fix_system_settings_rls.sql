-- Fix RLS policy for system_settings to allow front-end updates
-- This allows anyone (anon/authenticated) to update the settings row (id=1)

DROP POLICY IF EXISTS "Allow update for service role" ON public.system_settings;

CREATE POLICY "Allow update for everyone" ON public.system_settings
    FOR UPDATE 
    USING (true) 
    WITH CHECK (id = 1);

-- Ensure anon and authenticated roles have permission to update
GRANT UPDATE ON public.system_settings TO anon, authenticated;
