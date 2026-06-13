import { Activity, Search, Zap } from 'lucide-react';

interface WatchlistEmptyStateProps {
  onAddTicker: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onNavigateScanner: () => void;
}

export const WatchlistEmptyState = ({ onAddTicker, onNavigateScanner }: WatchlistEmptyStateProps) => {
  return (
    <div className="text-center py-48 bg-white/80 rounded-[3rem] border-2 border-dashed border-slate-200 shadow-sm px-6 backdrop-blur-md relative overflow-hidden group">
      {/* Background Decorative Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
      
      <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-slate-200/55 shadow-inner relative z-10">
        <Activity className="w-10 h-10 text-indigo-600 animate-pulse" />
      </div>
      
      <div className="relative z-10">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-4">모니터링 오빗이 비어 있습니다</h2>
        <p className="text-sm font-semibold text-slate-500 mb-10 max-w-md mx-auto leading-relaxed tracking-wide">
          시장의 흐름을 추적할 관심 종목이 아직 없습니다.<br />
          검색을 통해 직접 추가하거나 퀀트 스캐너에서 유망 종목을 찾아보세요.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-5 relative z-10">
        <div className="relative group w-full sm:w-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="티커 수동 추가 (Enter)" 
            className="pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none w-full sm:w-72 transition-all shadow-inner uppercase tracking-wider"
            onKeyDown={onAddTicker}
          />
        </div>
        <button 
          onClick={onNavigateScanner}
          className="px-8 py-4 bg-indigo-600 text-white font-bold text-sm rounded-2xl shadow-md hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 w-full sm:w-auto uppercase tracking-widest active:scale-95 border border-indigo-400/20"
        >
          <Zap className="w-4 h-4 fill-current opacity-80" /> 퀀트 아이템 탐색
        </button>
      </div>
    </div>
  );
};
