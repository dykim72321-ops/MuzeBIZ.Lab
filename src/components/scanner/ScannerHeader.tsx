import { Zap, ArrowUpRight, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface ScannerHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  onNavigateWatchlist: () => void;
}

export const ScannerHeader = ({ loading, onRefresh, onNavigateWatchlist }: ScannerHeaderProps) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Quant Intelligence</p>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">퀀트 핫 아이템</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 py-2 px-4 bg-slate-50 rounded-lg border border-slate-200 text-xs">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-500">AI Market Pulse</span>
          <span className="font-black text-slate-800">Bullish Sector Rotation</span>
        </div>
        <button
          onClick={onNavigateWatchlist}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm border border-slate-200 transition-colors"
        >
          My Monitoring Orbit
          <ArrowUpRight className="w-4 h-4" />
        </button>
        <button
          onClick={onRefresh}
          className="sfdc-button-primary flex items-center gap-2"
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          데이터 동기화
        </button>
      </div>
    </header>
  );
};
