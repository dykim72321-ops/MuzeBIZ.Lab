import { NavLink } from 'react-router-dom';
import { 
  Search, 
  Dna, 
  LayoutDashboard, 
  Bell,
  Menu,
  ChevronDown,
  Target
} from 'lucide-react';
import clsx from 'clsx';

const NAVIGATION = [
  { name: '통합 지휘소', icon: LayoutDashboard, path: '/stock/dashboard' },
  { name: '모니터링 오빗', icon: Target, path: '/watchlist' },
  { name: '제품 검색', icon: Search, path: '/parts-search' }
];

export const TopNav = () => {
  return (
    <nav className="bg-[#020617]/95 backdrop-blur-3xl border-b border-slate-800/80 sticky top-0 z-[100] font-sans shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
      <div className="max-w-[1700px] mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
        
        {/* Left: Logo & Nav */}
        <div className="flex items-center h-full gap-12">
          <NavLink to="/stock/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(99,102,241,0.15)] group-hover:border-indigo-400/40 transition-all">
              <Dna className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-2xl font-black text-white tracking-tighter uppercase font-mono">
              MuzeBIZ<span className="text-indigo-500 group-hover:text-indigo-400 transition-colors">.Lab</span>
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
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[inset_0_0_10px_rgba(99,102,241,0.05)]" 
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
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
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#020617] rounded-full border border-slate-800 shadow-inner">
             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">System Online</span>
          </div>

          <button className="p-3 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/5 group border border-transparent hover:border-indigo-500/20 rounded-xl transition-all relative">
            <Bell className="w-5 h-5 group-hover:animate-swing origin-top" />
            <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#020617] shadow-[0_0_10px_rgba(244,63,94,0.5)]"></span>
          </button>

          <button className="flex items-center gap-3 p-1 pl-1 pr-3 rounded-[1.25rem] border border-slate-800 hover:border-slate-600 bg-[#020617] shadow-2xl transition-all group">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-cyan-500 border border-white/10 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-[11px] font-black text-white">OP</span>
            </div>
            <div className="flex flex-col items-start leading-none gap-1">
                <span className="text-[10px] font-black text-white uppercase tracking-tight">Operator</span>
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Level 4</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
          </button>
          
          <button className="lg:hidden p-2 text-slate-400 hover:text-white transition-all">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>
    </nav>
  );
};
