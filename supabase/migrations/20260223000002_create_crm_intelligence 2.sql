-- 20260223000002_create_crm_intelligence.sql
-- Technical Intelligence & Sourcing Bridge tables

-- 1. Call Plans Table
CREATE TABLE IF NOT EXISTS public.crm_call_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    technical_log JSONB DEFAULT '[]'::jsonb, -- 기술 질의 및 응대 로그
    checklist JSONB DEFAULT '[]'::jsonb, -- 미팅 전 체크리스트
    defense_logic JSONB DEFAULT '{}'::jsonb, -- 거절 사유 대응 가이드
    is_quick_log BOOLEAN DEFAULT FALSE,
    notes TEXT,
    embedding VECTOR(1536), -- OpenAI text-embedding-3-small (1536 dims)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Sourced Parts Table (Rare Source Bridge)
CREATE TABLE IF NOT EXISTS public.crm_sourced_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_plan_id UUID REFERENCES public.crm_call_plans(id) ON DELETE CASCADE,
    part_number TEXT NOT NULL,
    risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_call_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sourced_parts ENABLE ROW LEVEL SECURITY;

-- Allow public access
CREATE POLICY "Public Read/Write CallPlans" ON public.crm_call_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write SourcedParts" ON public.crm_sourced_parts FOR ALL USING (true) WITH CHECK (true);
