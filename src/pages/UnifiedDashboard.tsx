import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  List, 
  Zap, 
  BarChart3, 
  TrendingUp, 
  Activity, 
  ArrowRight,
  ShieldCheck,
  Star
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { getWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { 
  getTopStocks, 
  fetchMultipleStocksOptimized
} from '../services/stockService';
import { getStrategyStats } from '../services/analysisService.ts';
import { processSignal } from '../utils/signalProcessor';
import { toast } from 'sonner';

// Components
import { MarketCommandHeader } from '../components/layout/MarketCommandHeader';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { BacktestChart } from '../components/ui/BacktestChart';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { QuantLiveTerminal } from '../components/dashboard/QuantLiveTerminal';
import { Card } from '../components/ui/Card';

export const UnifiedDashboard = () => {
  const navigate = useNavigate();
  const { pulseMap, isConnected, isHunting, huntStatus, triggerHunt } = useMarketEngine();

  // 1. Data States
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistStocks, setWatchlistStocks] = useState<any[]>([]);
  const [discoveryStocks, setDiscoveryStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [strategyStats, setStrategyStats] = useState<any | null>(null);

  // 2. Fetch Data
  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch Watchlist & Discovery in Parallel
      const items = await getWatchlist();
      setWatchlistItems(items);
      
      const [watchlistData, discoveryData, statsData] = await Promise.all([
        items.length > 0 ? fetchMultipleStocksOptimized(items.map(i => i.ticker)) : Promise.resolve([]),
        getTopStocks(false, 15),
        getStrategyStats()
      ]);
      
      setWatchlistStocks(watchlistData);
      setDiscoveryStocks(discoveryData.slice(0, 10));
      setStrategyStats(statsData);
    } catch (err) {
      console.error('Failed to load unified data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 3. Derived States
  const strongTickers = useMemo(() => 
    Object.keys(pulseMap).filter(t => pulseMap[t].strength === 'STRONG'),
    [pulseMap]
  );

  const normalTickers = useMemo(() => 
    Object.keys(pulseMap).filter(t => pulseMap[t].strength === 'NORMAL' && pulseMap[t].signal === 'BUY'),
    [pulseMap]
  );

  const filteredDiscovery = useMemo(() => {
    const watchlistTickers = new Set(watchlistItems.map(i => i.ticker));
    return discoveryStocks.filter(s => !watchlistTickers.has(s.ticker)).slice(0, 5);
  }, [discoveryStocks, watchlistItems]);

  const handleDeepDive = (stock: any) => {
    const displaySignal = processSignal(stock);
    setTerminalData({
      ticker: stock.ticker,
      dnaScore: stock.dnaScore,
      bullPoints: displaySignal.bullPoints,
      bearPoints: displaySignal.bearPoints,
      riskLevel: stock.dnaScore >= 70 ? 'Low' : 'Medium',
      formulaVerdict: displaySignal.reasoning,
      price: stock.price,
      change: `${stock.changePercent.toFixed(2)}%`,
    });
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-8 space-y-8 animate-in fade-in duration-700 bg-slate-50 min-h-screen">
      
      {/* 1. Unified Header */}
      <MarketCommandHeader 
        title="통합 지휘 통제실"
        subtitle=""
        isConnected={isConnected}
        isHunting={isHunting}
        huntStatus={huntStatus}
        onTriggerHunt={triggerHunt}
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-8 space-y-8">
              <div className="h-[400px] bg-white rounded-3xl border border-slate-200 animate-pulse" />
              <div className="h-[300px] bg-white rounded-3xl border border-slate-200 animate-pulse" />
           </div>
           <div className="lg:col-span-4">
              <div className="h-[700px] bg-slate-900 rounded-3xl animate-pulse" />
           </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Main Signals & Discovery (8/12) */}
        <div className="lg:col-span-8 space-y-12">
          
          {/* A. Quant Portfolio Performance (NEW) */}
          <QuantLiveTerminal />

          {/* B. Live Signal Matrix (Dashboard Part) */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                Live Command Matrix
              </h2>
              <span className="text-[10px] font-black text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded border border-emerald-100 uppercase tracking-widest">
                {strongTickers.length + normalTickers.length} active signals
              </span>
            </div>

            {/* STRONG SIGNALS with Charts */}
            {strongTickers.length > 0 && (
              <div className="grid grid-cols-1 gap-6">
                {strongTickers.map(ticker => {
                   const rawData = pulseMap[ticker];
                   const displaySignal = processSignal(rawData);
                   const cardData = {
                     dna_score: displaySignal.dnaScore,
                     bull_case: displaySignal.bullPoints.join(", "),
                     bear_case: displaySignal.bearPoints.join(", "),
                     reasoning_ko: displaySignal.reasoning,
                     tags: displaySignal.tags,
                   };

                   return (
                     <div key={ticker} className="bg-white border-2 border-indigo-100 rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <div className="w-1.5 h-8 bg-indigo-500 rounded-full" />
                              <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{ticker}</h3>
                           </div>
                           <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase">Mathematical Signal Triggered</span>
                        </div>
                        <QuantSignalCard data={cardData} />
                        <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50/50 rounded-2xl p-4">
                           <BacktestChart ticker={ticker} />
                        </div>
                     </div>
                   );
                })}
              </div>
            )}

            {/* NORMAL SIGNALS (Grid) */}
            {normalTickers.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {normalTickers.map((ticker) => (
                  <QuantSignalCard 
                    key={ticker} 
                    data={pulseMap[ticker].quant_metadata || null} 
                  />
                ))}
              </div>
            )}

            {strongTickers.length === 0 && normalTickers.length === 0 && (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-slate-200 animate-pulse" />
                </div>
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Awaiting Quant Engine Stream...</p>
              </div>
            )}
          </section>

          {/* B. Market Discovery -> 퀀트 핫 아이템 (TOP 5) */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                퀀트 핫 아이템 (TOP 5)
              </h2>
              <button 
                onClick={() => navigate('/scanner')}
                className="text-[10px] font-black text-[#0176d3] hover:underline flex items-center gap-1 uppercase tracking-widest"
              >
                Scan More <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {filteredDiscovery.map((stock, idx) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  key={stock.ticker}
                  onClick={() => handleDeepDive(stock)}
                  className="relative group cursor-pointer"
                >
                  <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-slate-900 border-2 border-white text-white flex items-center justify-center font-black text-[10px] z-20 shadow-lg group-hover:bg-[#0176d3] transition-colors">
                    {idx + 1}
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-[#0176d3] hover:shadow-2xl transition-all h-full flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center font-black text-xs text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-colors">
                        {stock.ticker[0]}
                      </div>
                      <span className={clsx(
                        "text-[10px] font-black font-mono",
                        stock.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-lg font-black text-slate-900 group-hover:text-[#0176d3] transition-colors">{stock.ticker}</span>
                      <span className="block text-[8px] text-slate-400 font-bold uppercase truncate">{stock.name}</span>
                    </div>
                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 font-mono">${stock.price.toFixed(1)}</span>
                      <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        <Zap className="w-3 h-3 text-[#0176d3] fill-current" />
                        <span className="text-[9px] font-black text-[#0176d3] font-mono">{stock.dnaScore}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: My Monitoring Orbit (4/12) */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800 h-full">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  My Monitoring Orbit
                </h2>
                <button 
                  onClick={() => navigate('/watchlist')}
                  className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <List className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-4">
              {watchlistItems.length > 0 ? (
                watchlistItems.map((item, idx) => {
                  const stock = watchlistStocks.find(s => s.ticker === item.ticker);
                  const isProfit = stock && item.buyPrice ? stock.price >= item.buyPrice : true;
                  
                  return (
                    <motion.div 
                      key={item.ticker}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all group cursor-pointer"
                      onClick={() => stock && handleDeepDive(stock)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center font-black text-xs text-indigo-400">
                            {item.ticker[0]}
                          </div>
                          <div>
                            <span className="block text-sm font-black text-white tracking-tight">{item.ticker}</span>
                            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest">{item.status}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={clsx(
                            "text-sm font-black font-mono",
                            isProfit ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {stock ? `$${stock.price.toFixed(2)}` : '---'}
                          </div>
                          {stock && (
                            <div className={clsx(
                              "text-[9px] font-black",
                              stock.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                            )}>
                              {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Condensed DNA Bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500" 
                            style={{ width: `${stock?.dnaScore || 50}%` }} 
                          />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 font-mono">
                          {stock?.dnaScore || '--'}
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-20 text-center opacity-30">
                  <Star className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-xs font-black uppercase tracking-widest">Orbit is Empty</p>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/50">
               <div className="bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-black text-indigo-300 uppercase tracking-tight">System Guard Active</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                    개인 궤도의 모든 종목은 **Kelly Criterion** 및 **MDD 방어 로직**에 의해 실시간 감시 중입니다.
                  </p>
               </div>
            </div>
          </section>
        </div>
      </div>

      {/* 4. Multi-Charts or Summary (Full Width) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-white border-slate-200">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              퀀트 MDD 회복 속도 분석 (Quant MDD)
            </h3>
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 py-6">
               {strategyStats ? (
                 <>
                   <div className="text-4xl font-black text-rose-500 tracking-tighter mb-1">
                     {strategyStats.mdd}%
                   </div>
                   <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                     Max Drawdown (1Y)
                   </div>
                   <div className="mt-4 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">
                     평균 회복 기간: {strategyStats.recovery_days}일
                   </div>
                 </>
               ) : (
                 <span className="text-[10px] font-black text-slate-300 uppercase italic">Data Processing...</span>
               )}
            </div>
          </Card>
          
          <Card className="p-6 bg-white border-slate-200 md:col-span-2">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0176d3]" />
              전략 통계 효율성 매트릭스 (Strategic Stats Matrix)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-auto">
               {strategyStats ? (
                 <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Win Rate</div>
                    <div className="text-xl font-black text-slate-900">{strategyStats.win_rate}%</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Profit Factor</div>
                    <div className="text-xl font-black text-indigo-600">{strategyStats.profit_factor}x</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Avg PnL</div>
                    <div className="text-xl font-black text-emerald-600">+{strategyStats.avg_pnl}%</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Trades</div>
                    <div className="text-xl font-black text-slate-900">{strategyStats.total_trades}</div>
                  </div>
                 </>
               ) : (
                <div className="col-span-4 h-32 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <span className="text-[10px] font-black text-slate-300 uppercase italic">Waiting for Signal Lock...</span>
                </div>
               )}
            </div>
          </Card>
      </section>
    </>
  )}

  {/* Modal Integration */}
      {terminalData && (
        <StockTerminalModal
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
          onAddToWatchlist={async () => {
             try {
               await addToWatchlist(
                 terminalData.ticker, 
                 undefined, 
                 'WATCHING', 
                 terminalData.price, 
                 undefined, 
                 undefined, 
                 terminalData.dnaScore
               );
               toast.success(`${terminalData.ticker} — 관심 종목에 추가되었습니다`, {
                 description: `DNA Score: ${terminalData.dnaScore}점`,
                 duration: 3000,
               });
               loadData();
             } catch (error) {
               toast.error('관심 종목 추가에 실패했습니다', {
                 description: '잠시 후 다시 시도해 주세요.',
               });
             }
          }}
        />
      )}
    </div>
  );
};
