-- RLS 정책 수정: risk_audits 테이블 SELECT 권한 추가
-- 
-- 문제: Frontend에서 risk_audits 테이블 조회 시 406 에러 발생
-- 원인: RLS 정책이 익명(anon) 또는 인증된(authenticated) 사용자의 SELECT를 차단
-- 해결: 적절한 SELECT 정책 추가

-- 1. 현재 RLS 정책 확인
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'risk_audits';

-- 2. RLS가 활성화되어 있는지 확인
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE tablename = 'risk_audits';

-- 3. 익명 사용자에게 READ 권한 부여 (옵션 A: 가장 간단)
-- 기존 정책이 있다면 먼저 삭제
DROP POLICY IF EXISTS "Allow anonymous read access to risk_audits" ON risk_audits;

-- 새 정책 생성
CREATE POLICY "Allow anonymous read access to risk_audits"
ON risk_audits
FOR SELECT
TO anon
USING (true);

-- 또는

-- 4. 인증된 사용자에게만 READ 권한 부여 (옵션 B: 보안 강화)
-- CREATE POLICY IF NOT EXISTS "Allow authenticated read access to risk_audits"
-- ON risk_audits
-- FOR SELECT
-- TO authenticated
-- USING (true);

-- 5. 사용자별 데이터 제한 (옵션 C: 최고 보안)
-- 만약 risk_audits 테이블에 user_id 컬럼이 있다면:
-- CREATE POLICY IF NOT EXISTS "Users can read their own risk audits"
-- ON risk_audits
-- FOR SELECT
-- TO authenticated
-- USING (auth.uid() = user_id);

-- ⚠️ 주의사항:
-- - 옵션 A는 모든 사용자가 모든 risk_audits를 볼 수 있음
-- - 프로덕션 환경에서는 옵션 B 또는 C 권장
-- - 현재 앱 로직은 인증 없이 동작하므로 옵션 A 적용 권장

-- 6. 정책 적용 후 확인
-- SELECT policyname, permissive, roles, cmd 
-- FROM pg_policies 
-- WHERE tablename = 'risk_audits';
