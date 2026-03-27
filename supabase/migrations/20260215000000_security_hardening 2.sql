-- 20260215000000_security_hardening.sql
-- MuzeBIZ.Lab Supabase Security Hardening Migration

-- 1. Enable RLS on all public tables
ALTER TABLE IF EXISTS public.risk_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_legends ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recommendation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.persona_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.news_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_discovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.yahoo_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_analysis_cache ENABLE ROW LEVEL SECURITY;

-- 2. Refine Policies for daily_discovery (Ensuring only service_role can write)
DROP POLICY IF EXISTS "Public read access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Service role write access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Service role update access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Service role delete access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Allow public read access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Allow service role full access" ON public.daily_discovery;

CREATE POLICY "Allow public read access" ON public.daily_discovery FOR SELECT TO public USING (true);
CREATE POLICY "Allow service role full access" ON public.daily_discovery FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Define basic public read policies for other informational tables
DO $$
BEGIN
    -- risk_audits
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'risk_audits') THEN
        DROP POLICY IF EXISTS "Allow anonymous read access to risk_audits" ON public.risk_audits;
        CREATE POLICY "Allow public select" ON public.risk_audits FOR SELECT TO public USING (true);
    END IF;

    -- stock_legends
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'stock_legends') THEN
        DROP POLICY IF EXISTS "Allow public read stock_legends" ON public.stock_legends;
        CREATE POLICY "Allow public read stock_legends" ON public.stock_legends FOR SELECT TO public USING (true);
    END IF;

    -- market_patterns
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'market_patterns') THEN
        CREATE POLICY "Allow public read market_patterns" ON public.market_patterns FOR SELECT TO public USING (true);
    END IF;
END $$;

-- 4. Harden SQL Functions (Fixing Search Path Vulnerability)
-- Functions found in migrations or reported in advisor

-- match_market_patterns
CREATE OR REPLACE FUNCTION public.match_market_patterns(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  event_name text,
  description text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    market_patterns.id,
    market_patterns.event_name,
    market_patterns.description,
    market_patterns.metadata,
    1 - (market_patterns.embedding <=> query_embedding) AS similarity
  FROM market_patterns
  WHERE 1 - (market_patterns.embedding <=> query_embedding) > match_threshold
  ORDER BY market_patterns.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- match_stock_patterns
CREATE OR REPLACE FUNCTION public.match_stock_patterns(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  ticker text,
  name text,
  period text,
  description text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    stock_legends.id,
    stock_legends.ticker,
    stock_legends.name,
    stock_legends.period,
    stock_legends.description,
    1 - (stock_legends.embedding <=> query_embedding) AS similarity
  FROM stock_legends
  WHERE 1 - (stock_legends.embedding <=> query_embedding) > match_threshold
  ORDER BY stock_legends.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- get_recent_recommendations
CREATE OR REPLACE FUNCTION public.get_recent_recommendations(days_ago int DEFAULT 7)
RETURNS TABLE (ticker text) 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT recommendation_history.ticker
  FROM recommendation_history
  WHERE recommended_at > NOW() - (days_ago || ' days')::INTERVAL;
END;
$$;

-- log_recommendation
CREATE OR REPLACE FUNCTION public.log_recommendation(
  p_ticker text,
  p_dna_score int,
  p_action text,
  p_confidence text
) RETURNS void 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO recommendation_history (ticker, dna_score, action, confidence)
  VALUES (p_ticker, p_dna_score, p_action, p_confidence);
END;
$$;

-- update_stock_cache_timestamp
CREATE OR REPLACE FUNCTION public.update_stock_cache_timestamp()
RETURNS trigger 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Note: The following functions were reported as insecure (mutating search_path) 
-- but were not found explicitly in migration files.
-- We apply protection dynamically to any matching functions found in 'public'.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN 
        SELECT proname, oidvectortypes(proargtypes) AS args 
        FROM pg_proc 
        JOIN pg_namespace n ON n.oid = pronamespace 
        WHERE n.nspname = 'public' 
        AND proname IN ('increment_persona_score', 'update_stock_cache_time')
    LOOP
        EXECUTE 'ALTER FUNCTION public.' || quote_ident(f.proname) || '(' || f.args || ') SET search_path = public';
        RAISE NOTICE 'Secured function: public.%(%)', f.proname, f.args;
    END LOOP;
END $$;
