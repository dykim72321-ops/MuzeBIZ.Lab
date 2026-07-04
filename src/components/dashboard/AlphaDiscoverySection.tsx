import { Sparkles, Activity, Target, Zap, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
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

function deriveMacdStatus(macdDiff?: number | null, macdDiffPrev?: number | null): string {
  const d = macdDiff ?? 0;
  const p = macdDiffPrev ?? 0;
  if (d > 0 && p <= 0) return 'golden';
  if (d < 0 && p >= 0) return 'dead';
  if (d > p) return 'rising';
  return 'falling';
}

export const AlphaDiscoverySection: React.FC<AlphaDiscoverySectionProps> = ({
  filteredDiscovery,
  handleDeepDive,
  lastFetchedTime
}) => {
  const navigate = useNavigate();

  const handleSimulator = (e: React.MouseEvent, stock: any) => {
    e.stopPropagation();
    const params = new URLSearchParams({
      ticker: stock.ticker,
      entry: String(stock.price ?? 10),
      penny: String((stock.price ?? 10) <= 1.0),
      ...(stock.rsi != null      && { rsi:  String(stock.rsi) }),
      ...(stock.rvol != null     && { rvol: String(stock.rvol) }),
      ...(stock.adx != null      && { adx:  String(stock.adx) }),
      ...(stock.atr_pct != null  && { atr:  String(stock.atr_pct) }),
      ...(stock.di_positive != null && { diPos: String(stock.di_positive) }),
      ...(stock.is_extended != null && { extended: String(stock.is_extended) }),
      macd: deriveMacdStatus(stock.macd_diff, stock.macd_diff_prev),
    });
    navigate(`/dna-simulator?${params.toString()}`);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-sm font-black text-blue-900 uppercase tracking-[0.3em]">
            Alpha Discovery Picks
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-100 rounded-full border border-blue-200">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">
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
              className="bg-white border border-blue-200 rounded-3xl p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[140px] group relative overflow-hidden active:scale-95 shadow-sm"
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-10 transition-opacity">
                <Activity className="w-10 h-10 text-blue-400" />
              </div>

              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-2xl font-black text-blue-900 tracking-tighter uppercase font-mono group-hover:text-blue-600 transition-colors">{stock.ticker}</span>
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
                <span className="block text-[9px] text-blue-400 font-bold uppercase tracking-widest truncate max-w-full">
                  {stock.name || `${stock.ticker} Asset`}
                </span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">DNA Strength</span>
                  <span className="text-lg font-black text-blue-600 font-mono tracking-tighter">
                    {dnaScore.toFixed(0)}
                  </span>
                </div>
                <div className="w-full h-1 bg-blue-200 rounded-full overflow-hidden mb-4">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(dnaScore, 100)}%` }}
                    transition={{ duration: 1.2, delay: idx * 0.1 }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => handlePaperBuy(e, stock.ticker, stock.price || 0)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-[9px] font-black text-emerald-700 uppercase tracking-widest transition-all active:scale-95"
                  >
                    <Zap className="w-3 h-3" />
                    Buy
                  </button>
                  <button
                    onClick={(e) => handleSimulator(e, stock)}
                    title="DNA 시뮬레이터에서 사전 점검"
                    className="flex items-center justify-center gap-1 px-2.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-[9px] font-black text-indigo-700 uppercase tracking-widest transition-all active:scale-95"
                  >
                    <FlaskConical className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        }) : (
          <div className="col-span-full py-12 bg-blue-50 rounded-3xl border border-dashed border-blue-300 flex flex-col items-center justify-center opacity-50">
            <Target className="w-10 h-10 text-blue-400 mb-3" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Awaiting Discovery Pulse...</span>
          </div>
        )}
      </div>
    </section>
  );
};
