-- Scale-In(추가 매수) 1회 제한 플래그.
--
-- 기존 엔진은 포지션당 최초 진입 이후 추가 매수 로직이 전혀 없어, ANTX처럼
-- 미실현 수익이 계속 좋아지는 승자에도 절대 추가 배팅을 할 수 없는 구조였다.
-- MAX_CONCENTRATION_PCT/MAX_BUY_BUDGET 상한은 그대로 유지하면서, 포지션당
-- 평생 1회·최소 수익률(SCALE_IN_PROFIT_TRIGGER) 확인 후에만 추가 매수를
-- 허용하는 Scale-In 기능을 추가한다(engine/paper_engine.py 참고). 이 컬럼은
-- scaled_in=False 조건부 UPDATE(CAS)로 동시 중복 스케일인을 막는 클레임
-- 용도로도 쓰인다.
alter table paper_positions
  add column if not exists scaled_in boolean not null default false;

comment on column paper_positions.scaled_in is
  '포지션당 평생 1회 한정 추가 매수(Scale-In) 실행 여부. True가 되면 이후 이 포지션에는 다시 추가 매수하지 않는다. 신규 진입 시 항상 False로 시작.';
