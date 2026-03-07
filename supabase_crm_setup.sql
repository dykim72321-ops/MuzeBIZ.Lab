-- =========================================================================
-- CRM Hub - Supabase [B2B Sales Intelligence] Full Schema Setup
-- =========================================================================
-- 이 스크립트를 Supabase 대시보드의 SQL Editor에 붙여넣고 실행(Run)하세요.
-- 기존에 테이블이 없으면 생성하고, 필요한 익스텐션과 함수를 설정합니다.

-- 1. EXTENSIONS & FUNCTIONS
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. CORE TABLES
-- Companies Table
CREATE TABLE IF NOT EXISTS public.crm_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    industry TEXT,
    address TEXT,
    tech_stack JSONB DEFAULT '[]'::jsonb,
    dart_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts Table
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    department TEXT,
    position TEXT,
    influence_level TEXT CHECK (influence_level IN ('CHAMPION', 'BLOCKER', 'INFLUENCER', 'USER')),
    preferences JSONB DEFAULT '{}'::jsonb,
    contact_history TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Projects Table (Pipeline)
CREATE TABLE IF NOT EXISTS public.crm_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    stage TEXT NOT NULL DEFAULT 'NEEDS' CHECK (stage IN ('NEEDS', 'SAMPLE', 'TEST', 'NEGOTIATION', 'WIN', 'DROP')),
    target_product TEXT,
    competitor_product TEXT,
    expected_value DOUBLE PRECISION DEFAULT 0.0,
    velocity_data JSONB DEFAULT '{}'::jsonb,
    customer_dna_alert_level TEXT DEFAULT 'NORMAL',
    next_followup_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Design-in History Table
CREATE TABLE IF NOT EXISTS public.crm_design_in_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    part_number TEXT NOT NULL,
    application_name TEXT,
    status TEXT CHECK (status IN ('DESIGNED_IN', 'PROTOTYPE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Call Plans Table
CREATE TABLE IF NOT EXISTS public.crm_call_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    technical_log JSONB DEFAULT '[]'::jsonb,
    checklist JSONB DEFAULT '[]'::jsonb,
    defense_logic JSONB DEFAULT '{}'::jsonb,
    is_quick_log BOOLEAN DEFAULT FALSE,
    notes TEXT,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Sourced Parts Table
CREATE TABLE IF NOT EXISTS public.crm_sourced_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_plan_id UUID REFERENCES public.crm_call_plans(id) ON DELETE CASCADE,
    part_number TEXT NOT NULL,
    risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. INDEXES & RPC
CREATE INDEX IF NOT EXISTS idx_crm_call_plans_embedding ON public.crm_call_plans 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION match_crm_call_plans (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  contact_id uuid,
  visit_date timestamptz,
  technical_log jsonb,
  defense_logic jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.company_id,
    cp.contact_id,
    cp.visit_date,
    cp.technical_log,
    cp.defense_logic,
    1 - (cp.embedding <=> query_embedding) AS similarity
  FROM crm_call_plans cp
  WHERE 1 - (cp.embedding <=> query_embedding) > match_threshold
  ORDER BY cp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. SECURITY (RLS)
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_design_in_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_call_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sourced_parts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Companies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_companies' AND policyname = 'Public Read/Write Companies') THEN
        CREATE POLICY "Public Read/Write Companies" ON public.crm_companies FOR ALL USING (true) WITH CHECK (true);
    END IF;
    -- Contacts
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_contacts' AND policyname = 'Public Read/Write Contacts') THEN
        CREATE POLICY "Public Read/Write Contacts" ON public.crm_contacts FOR ALL USING (true) WITH CHECK (true);
    END IF;
    -- Projects
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_projects' AND policyname = 'Public Read/Write Projects') THEN
        CREATE POLICY "Public Read/Write Projects" ON public.crm_projects FOR ALL USING (true) WITH CHECK (true);
    END IF;
    -- Call Plans
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_call_plans' AND policyname = 'Public Read/Write CallPlans') THEN
        CREATE POLICY "Public Read/Write CallPlans" ON public.crm_call_plans FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. TRIGGERS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crm_companies_modtime') THEN
        CREATE TRIGGER update_crm_companies_modtime BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crm_contacts_modtime') THEN
        CREATE TRIGGER update_crm_contacts_modtime BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crm_projects_modtime') THEN
        CREATE TRIGGER update_crm_projects_modtime BEFORE UPDATE ON public.crm_projects FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
