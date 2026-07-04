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
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-white/95 backdrop-blur-xl border-b border-blue-200 font-sans shadow-sm">
        {/* Left: Logo & Nav */}
        <div className="flex items-center gap-8">
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-blue-100 rounded-lg border border-blue-300 flex items-center justify-center shadow-sm group-hover:border-blue-600 transition-all">
              <Dna className="w-6 h-6 text-blue-700 group-hover:scale-110 transition-transform" />
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
          <div className="flex items-center gap-2.5 px-4 py-2 bg-blue-50 rounded-full border border-blue-200 shadow-sm">
             <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(5,150,105,0.5)]" />
             <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest leading-none">System Online</span>
          </div>

          <button className="p-2 text-blue-800 hover:text-blue-900 hover:bg-blue-50 group rounded-lg transition-all relative cursor-pointer">
            <Bell className="w-5 h-5 group-hover:animate-swing origin-top" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-600 rounded-full"></span>
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
