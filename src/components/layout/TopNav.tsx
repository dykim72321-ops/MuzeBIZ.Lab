import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Search,
  Dna,
  LayoutDashboard,
  Bell,
  Menu,
  X,

  FlaskConical
} from 'lucide-react';
import clsx from 'clsx';

const NAVIGATION = [
  { name: '통합 지휘소', icon: LayoutDashboard, path: '/stock/dashboard' },

  { name: 'DNA 시뮬레이터', icon: FlaskConical, path: '/dna-simulator' },
  { name: '제품 검색', icon: Search, path: '/parts-search' }
];

export const TopNav = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="bg-[#0a0f1c]/90 backdrop-blur-3xl border-b border-slate-800 sticky top-0 z-[100] font-sans shadow-lg">
        <div className="max-w-[1700px] mx-auto px-6 md:px-10 h-20 flex items-center justify-between">

          {/* Left: Logo & Nav */}
          <div className="flex items-center h-full gap-12">
            <NavLink to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(99,102,241,0.05)] group-hover:border-indigo-500/30 transition-all">
                <Dna className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
              </div>
              <span className="text-2xl font-black text-white tracking-tighter uppercase font-mono">
                MuzeBIZ<span className="text-indigo-400 group-hover:text-indigo-300 transition-colors">.Lab</span>
              </span>
            </NavLink>

            <div className="hidden lg:flex h-full items-center gap-1">
              {NAVIGATION.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/stock/dashboard'}
                  className={({ isActive }) => clsx(
                    "h-12 px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-xl border border-transparent",
                    isActive
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-md"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-950/60 rounded-full border border-slate-800 shadow-inner">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">System Online</span>
            </div>

            <button className="p-3 text-slate-400 hover:text-indigo-400 hover:bg-white/5 group border border-transparent hover:border-slate-800 rounded-xl transition-all relative cursor-pointer">
              <Bell className="w-5 h-5 group-hover:animate-swing origin-top" />
              <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#0a0f1c] shadow-[0_0_10px_rgba(244,63,94,0.5)]"></span>
            </button>

            <button
              className="lg:hidden p-2 text-slate-400 hover:text-white transition-all cursor-pointer"
              onClick={() => setMobileOpen(prev => !prev)}
              aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[99]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-in panel */}
          <div className="absolute top-0 right-0 h-full w-72 bg-[#0a0f1c] border-l border-slate-800 shadow-2xl flex flex-col pt-24 pb-8 px-4 gap-1">
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/stock/dashboard'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-all",
                  isActive
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
