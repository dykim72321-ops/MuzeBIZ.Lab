-- Create system_settings table for dynamic configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    alert_threshold INTEGER DEFAULT 85,
    webhook_url TEXT,
    cache_ttl_hours INTEGER DEFAULT 24,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT singleton_row CHECK (id = 1) -- Ensure only one settings row exists
);

-- Seed initial data
INSERT INTO public.system_settings (id, alert_threshold, cache_ttl_hours)
VALUES (1, 85, 24)
ON CONFLICT (id) DO NOTHING;

-- Grant access to authenticated users and service role
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for everyone" ON public.system_settings
    FOR SELECT USING (true);

CREATE POLICY "Allow update for service role" ON public.system_settings
    FOR UPDATE USING (true) WITH CHECK (true);
