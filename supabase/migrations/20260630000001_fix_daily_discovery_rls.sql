-- daily_discovery RLS 정책 수정
-- Railway 백엔드가 anon 키로 연결될 때도 upsert 가능하도록 정책 확대
-- daily_discovery는 퀀트 엔진이 단독으로 쓰는 발굴 신호 캐시 테이블 (사용자 데이터 없음)

-- 기존 write 정책 전부 제거 후 재생성
DROP POLICY IF EXISTS "Service role write access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Service role update access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Service role delete access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Allow service role full access" ON public.daily_discovery;
DROP POLICY IF EXISTS "Backend write access" ON public.daily_discovery;

-- 백엔드 서비스가 어떤 role로 연결되든 write 허용
-- (daily_discovery = 퀀트 엔진 출력 캐시, 민감 사용자 데이터 없음)
CREATE POLICY "Backend write access" ON public.daily_discovery
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
