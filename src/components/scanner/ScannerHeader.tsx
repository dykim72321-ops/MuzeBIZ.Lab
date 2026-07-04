import { Zap, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface ScannerHeaderProps {
  loading: boolean;
  onRefresh: () => void;
}

export const ScannerHeader = ({ loading, onRefresh }: ScannerHeaderProps) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0b101a]/80 backdrop-blur-xl p-6 rounded-[1.5rem] border border-blue-800 shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <div className="flex items-center gap-5 relative z-10">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center justify-center">
          <Zap className="w-6 h-6 text-white fill-white/20" />
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Quant Intelligence Terminal</p>
          <h1 className="text-3xl font-black text-white tracking-tighter">퀀트 핫 아이템</h1>
        </div>
      </div>

      <div className="flex items-center gap-4 relative z-10">
        <div className="hidden lg:flex items-center gap-3 py-2.5 px-5 bg-blue-900/50 rounded-xl border border-blue-800 text-[10px]">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
          <span className="font-black text-blue-400 uppercase tracking-widest">Market Pulse:</span>
          <span className="font-black text-white uppercase tracking-widest">Optimized Signal Stream</span>
        </div>
        

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all active:scale-95 border border-indigo-400/30"
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          Sync Data
        </button>
      </div>
    </header>
  );
};
