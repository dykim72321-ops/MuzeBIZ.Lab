-- ==========================================
-- Phase 2: Quant Engine Stateful Schema
-- ==========================================
-- 이 스키마는 MuzeBIZ.Lab의 클라우드 자동화 매매(Paper Trading)를 위한
-- DB 뼈대입니다. (Stateless Edge Function의 메모리 역할)

-- 1. quant_signals (시그널 대기열)
-- 장 마감 후 스캐너가 포착한 내일 아침 매수 대상 리스트
CREATE TABLE IF NOT EXISTS public.quant_signals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker TEXT NOT NULL,
    signal_date DATE NOT NULL,
    target_entry_action TEXT NOT NULL DEFAULT 'BUY_OPEN', -- 내일 시가 매수
    dna_score NUMERIC NOT NULL,                           -- 포착 당시의 DNA Score (>= 80)
    rvol NUMERIC,                                         -- 포착 당시의 거래량 폭발 지수
    status TEXT NOT NULL DEFAULT 'PENDING',               -- PENDING, EXECUTED, CANCELLED
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. active_positions (현재 보유 포지션)
-- 다음날 실제 시가(Open)에 매수가 체결되고 나서 포지션을 들고 있는 바구니
CREATE TABLE IF NOT EXISTS public.active_positions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,                          -- 동일 종목 중복 매수 방지
    entry_price NUMERIC NOT NULL,                         -- 실제 체결된 매수가
    entry_date DATE NOT NULL,                             -- 체결 일자
    initial_atr NUMERIC NOT NULL,                         -- 매수 시점의 기준 변동성 (ATR)
    highest_high NUMERIC NOT NULL,                        -- [핵심] Trailing Stop을 위한 진입 이후 최고가 갱신
    days_held INTEGER NOT NULL DEFAULT 0,                 -- 보유 기간 (Time Stop 체크용)
    amount NUMERIC NOT NULL DEFAULT 0,                    -- 투자 수량 (Half-Kelly 등 자산 배분 결과)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. trade_history (매매 원장)
-- 청산(Target, Stop, Time-Stop) 발생 시 active_positions에서 삭제되고 이곳에 영구 보존됨
CREATE TABLE IF NOT EXISTS public.trade_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker TEXT NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE NOT NULL,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC NOT NULL,
    pnl NUMERIC NOT NULL,                                 -- 절대적인 손익액 ($)
    pnl_percent NUMERIC NOT NULL,                         -- 수익률 (%)
    exit_reason TEXT NOT NULL,                            -- TARGET, STOP, TIME_STOP
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- Row Level Security (RLS) 및 트리거
-- ==========================================

-- RLS 활성화 (보안의 기본)
ALTER TABLE public.quant_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

-- Select Policies: 프론트엔드 대시보드(Terminal)에서 누구나 읽을 수 있도록 허용
-- (실제 운영 시에는 authenticated 롤 등으로 제한하는 편이 좋습니다)
CREATE POLICY "Enable read access for all users" ON public.quant_signals FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.active_positions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.trade_history FOR SELECT USING (true);

-- API 통신(Edge Function 봇)을 위한 Insert/Update는 Service Role Key로 우회하므로
-- 별도의 변경 허용 Policy를 추가하지 않아도 됩니다. (선택적)

-- active_positions 테이블의 updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_timestamp ON public.active_positions;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.active_positions
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
