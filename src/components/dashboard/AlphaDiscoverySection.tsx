import { Sparkles, Activity, Target, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { executeManualOrder } from '../../services/pythonApiService';
import { toast } from 'sonner';

interface AlphaDiscoverySectionProps {
  filteredDiscovery: any[];
  handleDeepDive: (stock: any) => void;
  lastFetchedTime?: string;
}

const handlePaperBuy = async (e: React.MouseEvent, ticker: string, price: number) => {
  e.stopPropagation();
  const toastId = toast.loading(`${ticker} Paper Buy 주문 전송 중...`);
  try {
    const quantity = price > 0 ? Math.max(1, Math.floor(50 / price)) : 1;
    await executeManualOrder({ ticker, side: 'buy', quantity, type: 'market' });
    toast.success(`${ticker} Paper Buy 체결`, {
      id: toastId,
      description: `${quantity}주 시장가 매수 완료 (DNA ≥ 80)`,
    });
  } catch {
    toast.error(`${ticker} 주문 실패`, { id: toastId, description: 'FastAPI 서버 연결을 확인하세요.' });
  }
};

export const AlphaDiscoverySection: React.FC<AlphaDiscoverySectionProps> = ({
  filteredDiscovery,
  handleDeepDive,
  lastFetchedTime
}) => {

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em]">
            Alpha Discovery Picks
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              SYNC: {lastFetchedTime || new Date().toISOString().substring(11, 19)} UTC
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {filteredDiscovery.length > 0 ? filteredDiscovery.map((stock, idx) => {
          const changePercent = stock.change_percent || stock.changePercent || 0;
          const dnaScore = stock.dna_score || stock.dnaScore || 0;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: idx * 0.05, type: "spring", stiffness: 100 }}
              key={stock.ticker}
              onClick={() => handleDeepDive(stock)}
              className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[140px] group relative overflow-hidden active:scale-95 shadow-sm"
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-10 transition-opacity">
                <Activity className="w-10 h-10 text-slate-400" />
              </div>

              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-mono group-hover:text-blue-600 transition-colors">{stock.ticker}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-200 tracking-widest">DNA≥80</span>
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-black font-mono",
                      changePercent >= 0 ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
                    )}>
                      {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate max-w-full">
                  {stock.name || `${stock.ticker} Asset`}
                </span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">DNA Strength</span>
                  <span className="text-lg font-black text-blue-600 font-mono tracking-tighter">
                    {dnaScore.toFixed(0)}
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mb-4">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(dnaScore, 100)}%` }}
                    transition={{ duration: 1.2, delay: idx * 0.1 }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
                <button
                  onClick={(e) => handlePaperBuy(e, stock.ticker, stock.price || 0)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-[9px] font-black text-emerald-700 uppercase tracking-widest transition-all active:scale-95"
                >
                  <Zap className="w-3 h-3" />
                  Paper Buy
                </button>
              </div>
            </motion.div>
          );
        }) : (
          <div className="col-span-full py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-300 flex flex-col items-center justify-center opacity-50">
            <Target className="w-10 h-10 text-slate-400 mb-3" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Awaiting Discovery Pulse...</span>
          </div>
        )}
      </div>
    </section>
  );
};
