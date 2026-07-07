-- paper_account에 High-Water Mark(역대 최고 자산) 컬럼 추가
-- 기존 current_drawdown은 "원금 대비 마이너스인가"만 체크하는 오류가 있었음.
-- 진정한 MDD 계산을 위해서는 역대 최고 자산 대비 하락폭을 추적해야 한다.

ALTER TABLE public.paper_account
    ADD COLUMN IF NOT EXISTS high_water_mark DOUBLE PRECISION;

UPDATE public.paper_account
SET high_water_mark = GREATEST(total_assets, cash_available)
WHERE high_water_mark IS NULL;

ALTER TABLE public.paper_account
    ALTER COLUMN high_water_mark SET DEFAULT 100000.0,
    ALTER COLUMN high_water_mark SET NOT NULL;
