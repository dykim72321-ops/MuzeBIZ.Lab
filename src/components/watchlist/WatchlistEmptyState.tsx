import { Activity, Search, Zap } from 'lucide-react';

interface WatchlistEmptyStateProps {
  onAddTicker: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onNavigateScanner: () => void;
}

export const WatchlistEmptyState = ({ onAddTicker, onNavigateScanner }: WatchlistEmptyStateProps) => {
  return (
    <div className="text-center py-40 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm px-6">
      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
        <Activity className="w-8 h-8 text-slate-400" />
      </div>
      <p className="text-xl text-slate-900 font-black tracking-tight mb-2">My Monitoring Orbit is empty</p>
      <p className="text-sm font-medium text-slate-500 mb-8 max-w-sm mx-auto">
        시장의 흐름을 추적할 관심 종목이 아직 없습니다. 검색을 통해 직접 추가하거나 퀀트 스캐너에서 유망 종목을 찾아보세요.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <div className="relative group w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
          <input 
            type="text" 
            placeholder="티커 직접 추가 (Enter)" 
            className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-[#0176d3] focus:ring-4 focus:ring-blue-100 outline-none w-full sm:w-64 transition-all shadow-sm"
            onKeyDown={onAddTicker}
          />
        </div>
        <button 
          onClick={onNavigateScanner}
          className="px-6 py-3 bg-[#0176d3] text-white font-black text-sm rounded-xl shadow-md hover:bg-[#014486] hover:shadow-lg transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Zap className="w-4 h-4 fill-current opacity-80" /> 퀀트 아이템 탐색
        </button>
      </div>
    </div>
  );
};
