-- watchlist에 재스캔 시각(recency) 추적 컬럼 추가.
--
-- 문제: get_watchlist_tickers()가 실시간 Alpaca 스트림 구독 대상 상위 N개를
-- initial_dna_score(고정값) 내림차순으로만 뽑는데, 이 값은 처음 발굴 시점에
-- 박제되고 재스캔되지 않는 한 갱신되지 않는다. WATCHING 상태로 매수 전환 없이
-- 몇 달째 쌓인 행(2026-08-03 기준 1,793건)이 대부분이라, 오래전 DNA=100짜리
-- 낡은 종목이 오늘 재발굴된 DNA 90점대 신선한 종목보다 항상 순위에서 앞서
-- 구독 슬롯을 영구 점거하는 문제가 있었다(HYFM DNA93이 상위 30위 밖으로 밀려
-- 실시간 데이터를 전혀 못 받은 사례로 확인).
--
-- updated_at을 추가하고, 트리거로 UPDATE 시마다 자동 갱신되게 해
-- core/quant_scanner.py의 재스캔 UPDATE 경로(별도 코드 수정 불필요)를 포함한
-- 모든 갱신 경로에서 "마지막으로 실제 스캔에 다시 걸린 시각"을 얻을 수 있게 한다.
alter table watchlist
  add column if not exists updated_at timestamptz not null default now();

comment on column watchlist.updated_at is
  '이 행이 마지막으로 갱신된 시각(트리거로 자동 갱신). 재스캔 시 initial_dna_score와 함께 갱신되어, 스트림 구독 우선순위 산정(recency)과 오래된 WATCHING 행 자동 만료 판정에 쓰인다.';

create or replace function set_watchlist_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_watchlist_updated_at on watchlist;
create trigger trg_watchlist_updated_at
  before update on watchlist
  for each row
  execute function set_watchlist_updated_at();
