import { NavLink } from 'react-router-dom';
import { 
  Search, 
  Dna, 
  LayoutDashboard, 
  Bell,
  Menu,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';

const NAVIGATION = [
  { name: '통합 지휘소', icon: LayoutDashboard, path: '/' },
  { name: '제품 검색', icon: Search, path: '/parts-search' }
];

export const TopNav = () => {
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-[100] shadow-sm font-sans">
      <div className="max-w-[2000px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Logo & Nav */}
        <div className="flex items-center h-full gap-8">
          <NavLink to="/" className="flex items-center gap-2 text-[#0176d3]">
            <div className="w-8 h-8 bg-[#0176d3] rounded-md flex items-center justify-center">
              <Dna className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter text-slate-800">
              MuzeBIZ<span className="text-[#0176d3]">.Lab</span>
            </span>
          </NavLink>

          <div className="hidden lg:flex h-full items-center">
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => clsx(
                  "h-full px-4 flex items-center gap-2 text-sm font-bold transition-all border-b-4",
                  isActive 
                    ? "border-[#0176d3] text-[#0176d3] bg-blue-50/50" 
                    : "border-transparent text-slate-600 hover:text-[#0176d3] hover:bg-slate-50 hover:border-slate-300"
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

          <button className="p-2 text-slate-500 hover:text-[#0176d3] hover:bg-slate-100 rounded-full transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>

          <button className="flex items-center gap-2 p-1 pl-1 pr-2 rounded-full border border-slate-200 hover:border-slate-300 bg-white shadow-sm transition-all">
            <div className="w-7 h-7 bg-gradient-to-tr from-[#0176d3] to-blue-400 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-black text-white">OP</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>
          
          <button className="lg:hidden p-2 text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>
    </nav>
  );
};
