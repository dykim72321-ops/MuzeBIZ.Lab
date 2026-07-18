-- ATR 기반 초기 트레일링 스탑 거리(%)를 진입 시점에 고정 저장.
--
-- 기존에는 트레일링 스탑의 비가역 하한선(_compute_locked_floor)이
-- entry_price * TS_INIT_PCT(고정 %)로만 계산돼, 변동성이 큰 종목은 정상적인
-- 노이즈에도 스탑에 잘리고 변동성이 작은 종목은 스탑이 지나치게 느슨한
-- 문제가 있었다(2026-07-18 승률 분석). ATR 기반으로 폭을 조절하되, 라이브
-- ATR을 매 봉마다 다시 읽어 하한선을 재계산하면 ATR 급변(뉴스 이벤트 등) 시
-- 이미 확보한 방어선이 느슨해질 수 있으므로, 진입 시점 값을 1회 고정해
-- 저장한다.
alter table paper_positions
  add column if not exists entry_stop_pct double precision;

comment on column paper_positions.entry_stop_pct is
  'ATR 기반 초기 스탑 거리 비율(0~1, 예: 0.12 = -12%). 진입 시점에 1회 계산되어 고정되며, 이후 트레일링 스탑의 비가역 하한선(locked floor) 계산에 재사용된다. NULL이면 레거시(고정 % TS_INIT_PCT/PENNY_TS_INIT_PCT) 방식으로 폴백.';
