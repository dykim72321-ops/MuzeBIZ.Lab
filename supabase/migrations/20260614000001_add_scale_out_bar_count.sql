-- Scale-Out 쿨다운: Scale-Out 이후 최소 N봉 동안 TS 체크를 유예하기 위한 카운터
ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS scale_out_bar_count INTEGER NOT NULL DEFAULT 0;
