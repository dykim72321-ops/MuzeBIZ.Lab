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
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 dark-glass-panel p-6 rounded-[2rem] border border-slate-200/80 shadow-sm relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="flex items-center gap-5 relative z-10">
        <div className="w-12 h-12 bg-indigo-50 border border-indigo-150 rounded-xl shadow-sm flex items-center justify-center">
          <Zap className="w-6 h-6 text-indigo-600 fill-indigo-600/10" />
        </div>
        <div>
          <p className="text-xs font-black text-indigo-700 uppercase tracking-[0.2em] mb-1">Tactical Watchlist</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">모니터링 오빗</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <div className="relative group/input">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-indigo-600 transition-colors" />
          <input
            type="text"
            placeholder="티커 검색..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white outline-none w-48 transition-all font-mono"
          />
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-1 flex">
          <button
            onClick={() => onViewModeChange('grid')}
            className={clsx(
              'p-1.5 rounded transition-all cursor-pointer',
              viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200/50' : 'text-slate-500 hover:text-slate-850'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={clsx(
              'p-1.5 rounded transition-all cursor-pointer',
              viewMode === 'list' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200/50' : 'text-slate-500 hover:text-slate-850'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
