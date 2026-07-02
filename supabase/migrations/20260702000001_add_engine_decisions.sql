create table if not exists engine_decisions (
  id          bigint generated always as identity primary key,
  ts          timestamptz default now(),
  ticker      text not null,
  gate        text not null,   -- 어느 게이트에서 결정됐는가
  outcome     text not null,   -- 'EXECUTED' | 'BLOCKED'
  signal      text,            -- 'BUY' | 'SELL' | 'HOLD'
  dna_score   float,
  rsi         float,
  rvol        float,
  price       float,
  note        text             -- 차단 사유 또는 실행 요약
);

-- 최근 조회 성능을 위한 인덱스
create index if not exists engine_decisions_ts_idx on engine_decisions (ts desc);
create index if not exists engine_decisions_ticker_idx on engine_decisions (ticker, ts desc);

-- RLS: service role만 쓰기, anon은 읽기
alter table engine_decisions enable row level security;

create policy "anon read engine_decisions"
  on engine_decisions for select using (true);

create policy "service insert engine_decisions"
  on engine_decisions for insert
  with check (true);
