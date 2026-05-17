-- 레거시 테이블 제거
-- recommendation_history, stock_cache, yahoo_session 은 코드 어디에서도 참조되지 않음

drop table if exists public.recommendation_history;
drop table if exists public.stock_cache;
drop table if exists public.yahoo_session;
