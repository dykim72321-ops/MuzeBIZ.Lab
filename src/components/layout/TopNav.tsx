import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Menu,
  X,
  BarChart3
} from 'lucide-react';
import clsx from 'clsx';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import { toast } from 'sonner';

const NAVIGATION = [
  { name: '통합 지휘소', icon: LayoutDashboard, path: '/stock/dashboard' },
  { name: '성과 리포트', icon: BarChart3, path: '/reports' },
  { name: '제품 검색', icon: Search, path: '/parts-search' }
];

export const TopNav = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isOnline, lastChecked } = useSystemStatus();

  const handleStatusClick = () => {
    if (isOnline) {
      toast.success(`System is Online (Last checked: ${lastChecked.toLocaleTimeString()})`);
    } else {
      toast.error(`System is Offline. Engine connection failed! (Last checked: ${lastChecked.toLocaleTimeString()})`);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-white/95 backdrop-blur-xl border-b border-blue-200 font-sans shadow-sm">
        {/* Left: Logo & Nav */}
        <div className="flex items-center gap-8">
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-white rounded-lg border border-blue-200 flex items-center justify-center shadow-sm group-hover:border-blue-400 transition-all overflow-hidden p-1">
              <img src="/logo.png" alt="MuzeBIZ Logo" className="w-full h-full object-contain group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xl font-black text-black tracking-tighter uppercase font-mono">
              MuzeBIZ<span className="text-blue-700 transition-colors">.Lab</span>
            </span>
          </NavLink>

          <div className="hidden lg:flex items-center gap-6">
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/stock/dashboard'}
                className={({ isActive }) => clsx(
                  "py-5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2",
                  isActive
                    ? "text-blue-800 border-blue-800"
                    : "text-blue-900 border-transparent hover:text-black hover:border-blue-300"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleStatusClick}
            className={clsx(
              "flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-sm transition-all cursor-pointer hover:scale-105",
              isOnline ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"
            )}
            title="Click to view detailed system status"
          >
             <div className={clsx(
               "w-2 h-2 rounded-full animate-pulse",
               isOnline ? "bg-emerald-600 shadow-[0_0_10px_rgba(5,150,105,0.5)]" : "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"
             )} />
             <span className={clsx(
               "text-[10px] font-black uppercase tracking-widest leading-none",
               isOnline ? "text-blue-900" : "text-red-900"
             )}>
               {isOnline ? "System Online" : "System Offline"}
             </span>
          </button>

          <button
            className="lg:hidden p-2 text-blue-900 hover:text-black transition-all cursor-pointer"
            onClick={() => setMobileOpen(prev => !prev)}
            aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[99]">
          {/* Backdrop */}
          <div
           className="absolute inset-0 bg-blue-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-in panel */}
          <div className="absolute top-0 right-0 h-full w-72 bg-white border-l-2 border-blue-200 shadow-2xl flex flex-col pt-20 pb-8 px-4 gap-2">
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/stock/dashboard'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  "flex items-center gap-3 px-4 py-4 rounded-md text-sm font-black uppercase tracking-widest transition-all",
                  isActive
                    ? "bg-blue-50 text-blue-800"
                    : "text-blue-900 hover:text-black hover:bg-blue-50"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
