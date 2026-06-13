import { Search, Zap, LayoutGrid, List } from 'lucide-react';
import clsx from 'clsx';

interface WatchlistHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export const WatchlistHeader = ({
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: WatchlistHeaderProps) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-[1.5rem] border border-slate-200/60 shadow-md relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="flex items-center gap-5 relative z-10">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.3)] flex items-center justify-center">
          <Zap className="w-6 h-6 text-white fill-white/20" />
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Tactical Watchlist</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">모니터링 오빗</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <div className="relative group/input">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-indigo-500 transition-colors" />
          <input
            type="text"
            placeholder="티커 검색..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 outline-none w-48 transition-all"
          />
        </div>
        <div className="bg-slate-100/80 border border-slate-200/60 rounded-lg p-1 flex">
          <button
            onClick={() => onViewModeChange('grid')}
            className={clsx(
              'p-1.5 rounded transition-all',
              viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/20' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={clsx(
              'p-1.5 rounded transition-all',
              viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/20' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
