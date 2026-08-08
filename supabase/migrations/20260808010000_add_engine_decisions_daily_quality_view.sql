-- engine_decisions 일자별 데이터 품질 집계 뷰.
--
-- 배경: 데이터 품질 진단(라벨 오염률·독립 거래일수)을 행 단위 조회로 계산하면
-- PostgREST의 1,000행 상한(2026-08-07 알파 팩터 0건 버그 참고)에 걸린다.
-- 현재 적재 속도가 하루 500~900행이라 최신 1,000행은 2일치도 못 덮어,
-- "독립 거래일 20일" 같은 목표는 행 조회 방식으로는 영원히 도달 불가능하다.
-- 일자별로 미리 접어(fold) 반환하면 한 달치도 30행이라 상한과 무관해진다.
--
-- security_invoker=true: 뷰가 소유자(postgres) 권한으로 RLS를 우회하지 않고
-- 호출자 권한으로 실행되도록 한다 (Supabase security-definer-view 권고 준수).
create or replace view public.engine_decisions_daily_quality
with (security_invoker = true) as
select
  (ts at time zone 'America/New_York')::date            as et_date,
  count(*)                                              as total_rows,
  count(*) filter (where forward_return_30m is not null) as labeled_rows,
  -- 30분·60분 창이 같은 값 = 폴링 지연으로 같은 가격이 두 번 쓰인 오염 행
  count(*) filter (
    where forward_return_30m is not null
      and forward_return_60m is not null
      and abs(forward_return_30m - forward_return_60m) < 1e-9
  )                                                     as contaminated_rows,
  -- 2026-08-08 도입한 관찰 축이 실제로 채워지고 있는지
  count(*) filter (where time_bucket is not null)       as regime_rows
from public.engine_decisions
group by 1;

grant select on public.engine_decisions_daily_quality to anon, authenticated, service_role;
