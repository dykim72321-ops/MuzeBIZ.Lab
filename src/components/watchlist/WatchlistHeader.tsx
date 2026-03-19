import { Search, Zap, LayoutGrid, List } from 'lucide-react';

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
  onViewModeChange 
}: WatchlistHeaderProps) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Tactical Watchlist</p>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">My Monitoring Orbit</h1>
        </div>
      </div>
        
      <div className="flex items-center gap-3">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
          <input 
            type="text"
            placeholder="Ticker search..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-md text-sm text-slate-900 focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3] outline-none w-48 transition-all bg-white shadow-sm"
          />
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-md p-1 flex">
          <button 
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
