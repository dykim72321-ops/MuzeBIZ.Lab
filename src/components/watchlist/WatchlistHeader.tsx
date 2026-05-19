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
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0b101a]/80 backdrop-blur-xl p-6 rounded-[1.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="flex items-center gap-5 relative z-10">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center justify-center">
          <Zap className="w-6 h-6 text-white fill-white/20" />
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Tactical Watchlist</p>
          <h1 className="text-3xl font-black text-white tracking-tighter">My Monitoring Orbit</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <div className="relative group/input">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/input:text-indigo-400 transition-colors" />
          <input
            type="text"
            placeholder="Ticker search..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 bg-black/40 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 outline-none w-48 transition-all"
          />
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-1 flex">
          <button
            onClick={() => onViewModeChange('grid')}
            className={clsx(
              'p-1.5 rounded transition-all',
              viewMode === 'grid' ? 'bg-slate-800 text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={clsx(
              'p-1.5 rounded transition-all',
              viewMode === 'list' ? 'bg-slate-800 text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
