-- 스프레드 게이트 Shadow 모드(2026-07-31): 진입 체결 직전 IEX 최신 호가로 계산한
-- 스프레드를 engine_decisions에 기록만 하고 차단에는 쓰지 않는다. 몇 주 표본이
-- 쌓인 뒤 "스프레드 넓은 진입군 vs 좁은 진입군"의 실제 forward_return_30m 차이를
-- 비교해야 실제 차단 게이트로 전환할지 판단할 수 있다 (IEX 피드가 저유동성 종목에서
-- stale해질 수 있음이 ZNB 사례로 이미 확인됐으므로 quote_stale=true 표본은 분석 시
-- 반드시 제외해야 한다).
alter table engine_decisions
  add column if not exists spread_pct float,
  add column if not exists quote_stale boolean;
