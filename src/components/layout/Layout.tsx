import { Outlet, NavLink } from 'react-router-dom';
import { TopNav } from './TopNav';
import { LayoutDashboard, Search, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { Toaster } from 'sonner';

export const Layout = () => {

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-blue-800 font-sans selection:bg-blue-500/20 selection:text-blue-800">
      <Toaster position="bottom-right" theme="light" richColors />

      {/* 상단 네비게이션 */}
      <TopNav />

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 relative min-h-screen overflow-y-auto overflow-x-hidden pt-16 pb-20 lg:pb-0 transition-all duration-300">
        <div className="w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Nav Bar - Updated for Light Theme */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 h-16 bg-white/95 backdrop-blur-xl border border-blue-200 rounded-2xl flex items-center justify-around px-2 z-50 shadow-md">
        <NavLink to="/stock/dashboard" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-blue-600 bg-blue-50" : "text-blue-500 hover:text-blue-800")}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold">작전지휘소</span>
        </NavLink>
        <NavLink to="/reports" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-blue-600 bg-blue-50" : "text-blue-500 hover:text-blue-800")}>
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-bold">성과리포트</span>
        </NavLink>
        <NavLink to="/parts-search" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-blue-600 bg-blue-50" : "text-blue-500 hover:text-blue-800")}>
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-bold">부품검색</span>
        </NavLink>
      </div>
    </div>
  );
};

