import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Skeleton } from './components/ui/Skeleton';
import { queryClient } from './lib/queryClient';

// Lazy Loading 적용으로 초기 로딩 속도 개선
// 역할 정의:
//   /           → 작전 지휘소 (종합 대시보드: 펀드 + 오늘의 종목)
//   /pulse      → 실시간 퀀트 펄스 (WebSocket 라이브 스트림)
//   /scanner    → 마켓 스캐너 (심화 필터 탐색)
//   /portfolio  → 알파 펀드 (포트폴리오 운용)
//   /watchlist  → 관심 종목
//   /backtesting→ 백테스팅 히스토리
//   /settings   → 환경 설정
const PulseDashboard = lazy(() => import('./pages/PulseDashboard'));
const ScannerPage = lazy(() => import('./pages/ScannerPage').then(m => ({ default: m.ScannerPage })));
const AlphaFundView = lazy(() => import('./pages/AlphaFundView').then(m => ({ default: m.AlphaFundView })));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage').then(m => ({ default: m.WatchlistPage })));
const MuzepartSearchPage = lazy(() => import('./pages/MuzepartSearchPage').then(m => ({ default: m.MuzepartSearchPage })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const UnifiedDashboard = lazy(() => import('./pages/UnifiedDashboard').then(m => ({ default: m.UnifiedDashboard })));


const PersonaPerformance = lazy(() => import('./components/dashboard/PersonaPerformance').then(m => ({ default: m.PersonaPerformance })));
const SettingsView = lazy(() => import('./components/dashboard/SettingsView').then(m => ({ default: m.SettingsView })));

const LandingPage = lazy(() => import('./pages/LandingPage'));

// 로딩 폴백 컴포넌트
const PageLoadingFallback = () => (
  <div className="p-8 space-y-4 bg-slate-900 min-h-screen">
    <Skeleton className="h-[60px] w-full bg-slate-800" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Skeleton className="h-[300px] w-full lg:col-span-2 bg-slate-800" />
      <Skeleton className="h-[300px] w-full bg-slate-800" />
    </div>
    <Skeleton className="h-[400px] w-full bg-slate-800" />
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* 랜딩 및 도메인 분기 (Layout.tsx 바깥) */}
              <Route path="/" element={<LandingPage />} />
              
              {/* 내부 플랫폼 레이아웃 (Layout.tsx 적용) */}
              <Route element={<Layout />}>
                {/* 1. 홈: 통합 지휘 통제실 (Unified Command Center) */}
                <Route path="/stock/dashboard" element={<UnifiedDashboard />} />
                <Route path="command" element={<Navigate to="/stock/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />

                {/* 실시간 퀀트 펄스 */}
                <Route path="pulse" element={<PulseDashboard />} />

                {/* 2. 퀀트 핫 아이템 (마켓 스캐너) */}
                <Route path="scanner" element={<ScannerPage />} />
                <Route path="scan" element={<Navigate to="/scanner" replace />} />

                {/* 3. 부품 재고 검색 */}
                <Route path="parts-search" element={<MuzepartSearchPage />} />

                {/* 알파 펀드 */}
                <Route path="portfolio" element={<AlphaFundView />} />

                {/* 관심 종목 */}
                <Route path="watchlist" element={<WatchlistPage />} />

                {/* 기타 도구 */}
                <Route path="personas" element={<PersonaPerformance />} />

                {/* 기타 백그라운드 라우트 (비공개/테스트용) */}
                {/* 환경 설정 */}
                <Route path="settings" element={<SettingsView />} />

                {/* 404 → 랜딩 */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

