-- 20260221000000_create_paper_trading_tables.sql
-- Paper Trading Engine Schema for MuzeBIZ.Lab v2.0

-- 1. Paper Account Status (Single row tracking)
CREATE TABLE IF NOT EXISTS public.paper_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_assets DOUBLE PRECISION NOT NULL DEFAULT 100000.0, -- Default $100k
    cash_available DOUBLE PRECISION NOT NULL DEFAULT 100000.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Initialize with one row if empty
INSERT INTO public.paper_account (total_assets, cash_available)
SELECT 100000.0, 100000.0
WHERE NOT EXISTS (SELECT 1 FROM public.paper_account);

-- 2. Active Paper Positions
CREATE TABLE IF NOT EXISTS public.paper_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'HOLD', -- 'HOLD', 'SCALE_OUT'
    weight DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    entry_price DOUBLE PRECISION NOT NULL,
    current_price DOUBLE PRECISION NOT NULL,
    ts_threshold DOUBLE PRECISION NOT NULL, -- Trailing Stop 방어선
    highest_price DOUBLE PRECISION NOT NULL, -- 트레일링 스탑 계산용 최고가
    is_scaled_out BOOLEAN DEFAULT FALSE,     -- v4 50% 분할 익절 여부
    units DOUBLE PRECISION NOT NULL DEFAULT 0.0, -- 보유 수량
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Trade History (Closed positions)
CREATE TABLE IF NOT EXISTS public.paper_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_price DOUBLE PRECISION NOT NULL,
    pnl_pct DOUBLE PRECISION NOT NULL,
    profit_amt DOUBLE PRECISION NOT NULL,
    exit_reason TEXT, -- 'Trailing Stop', 'Take Profit', etc.
    closed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paper_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_history ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (Development simplicity)
CREATE POLICY "Public Read/Write Account" ON public.paper_account FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Positions" ON public.paper_positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write History" ON public.paper_history FOR ALL USING (true) WITH CHECK (true);

-- Functions for auto updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_paper_account_modtime
    BEFORE UPDATE ON public.paper_account
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_paper_positions_modtime
    BEFORE UPDATE ON public.paper_positions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
