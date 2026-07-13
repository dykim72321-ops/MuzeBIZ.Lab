-- realtime_signals에 smoothed_er 컬럼 추가
-- main.py의 realtime_signals insert가 smoothed_er를 허용 컬럼으로 포함해 전송하지만
-- 해당 컬럼이 테이블에 없어 매 봉마다 insert가 PGRST204로 실패하고 있었음.
-- (paper_engine.py의 ATR 적응형 트레일링 스탑 Efficiency Ratio 값)
ALTER TABLE public.realtime_signals
  ADD COLUMN IF NOT EXISTS smoothed_er NUMERIC;
