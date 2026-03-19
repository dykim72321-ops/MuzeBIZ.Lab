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
    <div className="sfdc-card p-4">
      <div className="flex flex-col xl:flex-row gap-6 items-center justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="sfdc-input pl-10 w-64"
            />
          </div>

          <button
            onClick={onMinDnaToggle}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-md border transition-all text-sm font-black active:scale-95 shadow-sm",
              minDna === 70
                ? "bg-blue-50 border-blue-200 text-[#0176d3]"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
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
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Clock className={clsx("w-3.5 h-3.5", isHistorical ? "fill-current" : "")} />
            HISTORICAL SCAN
          </button>

          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-inner">
            {['All', 'Low', 'Medium', 'High'].map(risk => (
              <button
                key={risk}
                onClick={() => onRiskChange(risk)}
                className={clsx(
                  "px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedRisk === risk ? "bg-white text-[#0176d3] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {risk}
              </button>
            ))}
          </div>

          <select
            value={selectedSector}
            onChange={(e) => onSectorChange(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 rounded-md px-4 py-2 text-sm font-bold focus:border-[#0176d3] focus:ring-4 focus:ring-blue-100 outline-none shadow-sm transition-all"
          >
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-1 shadow-inner">
            <button
              onClick={() => onViewModeChange('table')}
              className={clsx("p-2 rounded-md transition-all", viewMode === 'table' ? "bg-white text-[#0176d3] shadow-sm" : "text-slate-400")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={clsx("p-2 rounded-md transition-all", viewMode === 'grid' ? "bg-white text-[#0176d3] shadow-sm" : "text-slate-400")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
