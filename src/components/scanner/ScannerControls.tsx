import { Search, Zap, Clock, List, LayoutGrid } from 'lucide-react';
import clsx from 'clsx';

interface ScannerControlsProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  minDna: number;
  onMinDnaToggle: () => void;
  isHistorical: boolean;
  onHistoricalToggle: () => void;
  selectedRisk: string;
  onRiskChange: (risk: string) => void;
  selectedSector: string;
  onSectorChange: (sector: string) => void;
  sectors: string[];
  viewMode: 'table' | 'grid';
  onViewModeChange: (mode: 'table' | 'grid') => void;
}

export const ScannerControls = ({
  searchTerm,
  onSearchChange,
  minDna,
  onMinDnaToggle,
  isHistorical,
  onHistoricalToggle,
  selectedRisk,
  onRiskChange,
  selectedSector,
  onSectorChange,
  sectors,
  viewMode,
  onViewModeChange
}: ScannerControlsProps) => {
  return (
    <div className="bg-[#0b101a]/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-2xl">
      <div className="flex flex-col xl:flex-row gap-6 items-center justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 w-64 bg-black/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
            />
          </div>

          <button
            onClick={onMinDnaToggle}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-md border transition-all text-sm font-black active:scale-95 shadow-sm",
              minDna === 70
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                : "bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            )}
          >
            <Zap className={clsx("w-3.5 h-3.5", minDna === 70 ? "fill-current" : "")} />
            DNA 70+ SPEC
          </button>

          <button
            onClick={onHistoricalToggle}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-md border transition-all text-sm font-black active:scale-95 shadow-sm",
              isHistorical
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            )}
          >
            <Clock className={clsx("w-3.5 h-3.5", isHistorical ? "fill-current" : "")} />
            HISTORICAL SCAN
          </button>

          <div className="flex items-center bg-slate-900/50 rounded-lg p-1 border border-slate-800">
            {['All', 'Low', 'Medium', 'High'].map(risk => (
              <button
                key={risk}
                onClick={() => onRiskChange(risk)}
                className={clsx(
                  "px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedRisk === risk ? "bg-slate-800 text-indigo-400 shadow-sm border border-slate-700" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {risk}
              </button>
            ))}
          </div>

          <select
            value={selectedSector}
            onChange={(e) => onSectorChange(e.target.value)}
            className="bg-black/40 border border-slate-800 text-slate-300 rounded-lg px-4 py-2 text-sm font-bold focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
          >
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-900/50 border border-slate-800 rounded-lg p-1 shadow-inner">
            <button
              onClick={() => onViewModeChange('table')}
              className={clsx("p-2 rounded-md transition-all", viewMode === 'table' ? "bg-slate-800 text-indigo-400 shadow-sm" : "text-slate-400")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={clsx("p-2 rounded-md transition-all", viewMode === 'grid' ? "bg-slate-800 text-indigo-400 shadow-sm" : "text-slate-400")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
