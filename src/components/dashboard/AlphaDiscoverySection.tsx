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
    <section className="space-y-6 relative">
      <div className="flex items-center justify-between pb-2 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(34,211,238,0.15)]">
             <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>
          <h2 className="text-sm font-black text-white uppercase tracking-[0.3em]">
            Alpha Discovery Picks
          </h2>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#020617]/60 rounded-full border border-slate-800/80">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    SYNC: {lastFetchedTime || new Date().toISOString().substring(11, 19)} UTC
                </span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 relative z-10">
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
              className="bg-[#020617]/40 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 hover:border-cyan-500/50 hover:bg-[#020617]/60 transition-all cursor-pointer flex flex-col justify-between min-h-[140px] group relative overflow-hidden active:scale-95 shadow-lg"
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-10 transition-opacity">
                  <Activity className="w-10 h-10 text-white" />
              </div>
              
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-2xl font-black text-white tracking-tighter uppercase font-mono group-hover:text-cyan-400 transition-colors">{stock.ticker}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 tracking-widest">DNA≥80</span>
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-black font-mono",
                      changePercent >= 0 ? "text-emerald-400 bg-emerald-500/5" : "text-rose-400 bg-rose-500/5"
                    )}>
                      {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <span className="block text-[9px] text-slate-600 font-bold uppercase tracking-widest truncate max-w-full opacity-60">
                  {stock.name || `${stock.ticker} Asset`}
                </span>
              </div>
              
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">DNA Strength</span>
                  <span className="text-lg font-black text-cyan-400 font-mono tracking-tighter drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                    {dnaScore.toFixed(0)}
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden border border-white/5 mb-4">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(dnaScore, 100)}%` }}
                    transition={{ duration: 1.2, delay: idx * 0.1 }}
                    className="h-full bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                  />
                </div>
                <button
                  onClick={(e) => handlePaperBuy(e, stock.ticker, stock.price || 0)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-[9px] font-black text-emerald-400 uppercase tracking-widest transition-all active:scale-95"
                >
                  <Zap className="w-3 h-3 fill-emerald-400/20" />
                  Paper Buy
                </button>
              </div>
            </motion.div>
          );
        }) : (
            <div className="col-span-full py-12 bg-[#020617]/40 rounded-3xl border border-dashed border-slate-800 flex flex-col items-center justify-center opacity-30">
                <Target className="w-10 h-10 text-slate-500 mb-3" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Awaiting Discovery Pulse...</span>
            </div>
        )}
      </div>
    </section>
  );
};
