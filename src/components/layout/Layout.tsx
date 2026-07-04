import { Outlet, NavLink } from 'react-router-dom';
import { TopNav } from './TopNav';
import { LayoutDashboard, Settings, Zap, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMarketPulse } from '../../hooks/useMarketPulse';
import { Toaster } from 'sonner';

export const Layout = () => {
  // Activate Realtime Pulse Listener
  const lastSignal = useMarketPulse();

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-blue-800 font-sans selection:bg-blue-500/20 selection:text-blue-800">
      <Toaster position="bottom-right" theme="light" richColors />

      {/* ⚡ Realtime Pulse Indicator (Global) */}
      <div className="fixed top-24 right-4 z-[90] flex items-center gap-2 pointer-events-none">
        {lastSignal && (
          <div className={clsx(
            "px-3 py-1.5 rounded-full border shadow-md backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-top-2 duration-300",
            lastSignal.signal === 'OVERSOLD' ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-[0_4px_12px_rgba(16,185,129,0.1)]" :
              lastSignal.signal === 'OVERBOUGHT' ? "bg-rose-50 border-rose-200 text-rose-700 shadow-[0_4px_12px_rgba(244,63,94,0.1)]" :
                "bg-white border-blue-200 text-blue-700"
          )}>
            <Zap className={clsx("w-3 h-3 fill-current", lastSignal ? "animate-pulse" : "")} />
            <span className="text-xs font-black font-mono">
              {lastSignal.ticker} RSI: {lastSignal.value}
            </span>
          </div>
        )}
      </div>

      {/* 상단 네비게이션 */}
      <TopNav />

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 relative min-h-screen overflow-y-auto overflow-x-hidden pt-12 pb-20 lg:pb-0 transition-all duration-300">
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
        <NavLink to="/parts-search" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-blue-600 bg-blue-50" : "text-blue-500 hover:text-blue-800")}>
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-bold">부품검색</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-blue-600 bg-blue-50" : "text-blue-500 hover:text-blue-800")}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold">설정</span>
        </NavLink>
      </div>
    </div>
  );
};

