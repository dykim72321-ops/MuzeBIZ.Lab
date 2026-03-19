import { Outlet, NavLink } from 'react-router-dom';
import { TopNav } from './TopNav';
import { LayoutDashboard, List, Settings, Zap, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMarketPulse } from '../../hooks/useMarketPulse';
import { Toaster } from 'sonner';

export const Layout = () => {
  // Activate Realtime Pulse Listener
  const lastSignal = useMarketPulse();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      <Toaster position="bottom-right" theme="dark" richColors />

      {/* ⚡ Realtime Pulse Indicator (Global) */}
      <div className="fixed top-20 right-4 z-[90] flex items-center gap-2 pointer-events-none">
        {lastSignal && (
          <div className={clsx(
            "px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-top-2 duration-300",
            lastSignal.signal === 'OVERSOLD' ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
              lastSignal.signal === 'OVERBOUGHT' ? "bg-rose-50 border-rose-200 text-rose-700" :
                "bg-white border-slate-200 text-slate-600"
          )}>
            <Zap className={clsx("w-3 h-3 fill-current", lastSignal ? "animate-pulse" : "")} />
            <span className="text-xs font-bold font-mono">
              {lastSignal.ticker} RSI: {lastSignal.value}
            </span>
          </div>
        )}
      </div>

      {/* 상단 네비게이션 */}
      <TopNav />

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 relative min-h-screen overflow-y-auto overflow-x-hidden pb-20 lg:pb-0 transition-all duration-300">
        <div className="w-full max-w-[2000px] mx-auto p-4 md:p-8 lg:p-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile Nav Bar - Updated for Light Theme */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 h-16 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl flex items-center justify-around px-2 z-50 shadow-xl">
        <NavLink to="/" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-[#0176d3] bg-blue-50" : "text-slate-500")}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold">발굴</span>
        </NavLink>
        <NavLink to="/scanner" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-[#0176d3] bg-blue-50" : "text-slate-500")}>
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-bold">스캐너</span>
        </NavLink>
        <NavLink to="/watchlist" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-[#0176d3] bg-blue-50" : "text-slate-500")}>
          <List className="w-5 h-5" />
          <span className="text-[10px] font-bold">관심종목</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => clsx("flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors relative z-10", isActive ? "text-[#0176d3] bg-blue-50" : "text-slate-500")}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold">설정</span>
        </NavLink>
      </div>
    </div>
  );
};

