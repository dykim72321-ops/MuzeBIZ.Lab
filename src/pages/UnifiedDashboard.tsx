import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  List, 
  Zap, 
  TrendingUp, 
  Activity, 
  ArrowRight,
  ShieldCheck,
  Star
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchStrategyStats, apiFetch } from '../services/pythonApiService';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import clsx from 'clsx';

// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { getWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { fetchMultipleStocksOptimized } from '../services/stockService';
import { processSignal } from '../utils/signalProcessor';
import { toast } from 'sonner';

// Components
import { MarketCommandHeader } from '../components/layout/MarketCommandHeader';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { LiveExecutionCenter } from '../components/dashboard/LiveExecutionCenter';
import { PerformanceSummary } from '../components/dashboard/PerformanceSummary';

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
  const [pulseStatus, setPulseStatus] = useState<any>(null);

  // 2. Fetch Data
  const loadData = async () => {
      setLoading(true);
      try {
        const items = await getWatchlist();
        setWatchlistItems(items);
        
        // Parallelized fetching
        const [watchlistData, statsData] = await Promise.all([
          items.length > 0 ? fetchMultipleStocksOptimized(items.map(i => i.ticker)) : Promise.resolve([]),
          fetchStrategyStats()
        ]);

        // [Fix] Direct Supabase fetch for discovery to replace deleted 404 endpoint
        const { data: dData, error: dError } = await (window as any).supabase
          .from('daily_discovery')
          .select('*')
          .order('dna_score', { ascending: false })
          .limit(15);
        
        if (dError) console.error('Discovery fetch error:', dError);

        try {
          const pData = await apiFetch('/api/pulse/status');
          setPulseStatus(pData);
        } catch (e) {
          console.warn('[Dashboard] Pulse status fetch failed');
        }
        
        setWatchlistStocks(watchlistData);
        setDiscoveryStocks(dData || []);
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
    return (discoveryStocks || []).filter(s => !watchlistTickers.has(s.ticker)).slice(0, 5);
  }, [discoveryStocks, watchlistItems]);

  const handleDeepDive = (stock: any) => {
    const displaySignal = processSignal(stock);
    setTerminalData({
      ticker: stock.ticker,
      dnaScore: stock.dna_score || stock.dnaScore || 0,
      bullPoints: displaySignal.bullPoints,
      bearPoints: displaySignal.bearPoints,
      riskLevel: (stock.dna_score || 0) >= 70 ? 'Low' : (stock.dna_score || 0) >= 50 ? 'Medium' : 'High',
      formulaVerdict: displaySignal.reasoning,
      price: stock.price || 0,
      change: `${(stock.change_percent || stock.changePercent || 0).toFixed(2)}%`,
      efficiencyRatio: stock.efficiency_ratio || stock.efficiencyRatio || 0,
      kellyWeight: stock.kelly_weight || stock.kellyWeight || 0,
      quantData: stock.quant_metadata || null
    });
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-8 space-y-8 animate-in fade-in duration-700 bg-slate-50 min-h-screen relative overflow-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* 1. Unified Header */}
      <MarketCommandHeader 
        title="통합 지휘 통제실"
        subtitle={pulseStatus?.market_status === 'CLOSED' ? "🌙 Market Closed (Snapshot Analysis View)" : "⚡ Real-time Market Pulse Live v4"}
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
            {/* LEFT COLUMN: Strategic Execution & Trading (8/12) */}
            <div className="lg:col-span-8 space-y-8 relative z-10">
              
              {/* A. 실전 타격 통제실 (Execution Center) - HIGHLIGHTED TOP POSITION */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[32px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                <div className="relative">
                  <LiveExecutionCenter />
                </div>
              </div>

              {/* B. Live Signal Matrix (Dashboard Part) */}
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-600" />
                    Strategic Signal Matrix
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
                         <div key={ticker} className="glass-card rounded-3xl p-6 hover-glow animate-in fade-in slide-in-from-bottom-4 transition-all duration-500">
                            <div className="flex items-center justify-between mb-4">
                               <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{ticker}</h3>
                               </div>
                               <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase border border-indigo-100">Mathematical Signal Triggered</span>
                            </div>
                            <QuantSignalCard data={cardData} />
                         </div>
                       );
                    })}
                  </div>
                )}

                {/* NORMAL SIGNALS (Grid) */}
                {normalTickers.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {normalTickers.map((ticker) => (
                      <div key={ticker} className="glass-card rounded-2xl p-0 overflow-hidden hover-glow transition-all">
                        <QuantSignalCard 
                          data={pulseMap[ticker].quant_metadata || null} 
                        />
                      </div>
                    ))}
                  </div>
                )}

                {strongTickers.length === 0 && normalTickers.length === 0 && (
                  <div className="glass-card rounded-3xl border border-dashed border-slate-300 p-16 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Activity className="w-8 h-8 text-slate-200 animate-pulse" />
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Awaiting Quant Engine Stream...</p>
                  </div>
                )}
              </section>

              {/* C. Market Discovery -> 퀀트 핫 아이템 (TOP 5) */}
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-500" />
                    Alpha Discovery (Top Picks)
                  </h2>
                  <button 
                    onClick={() => navigate('/scanner')}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-widest transition-colors"
                  >
                    Scan Intelligence <ArrowRight className="w-3 h-3" />
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
                      <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-slate-900 border-2 border-white text-white flex items-center justify-center font-black text-[10px] z-20 shadow-lg group-hover:bg-indigo-600 transition-colors">
                        {idx + 1}
                      </div>
                      <div className="glass-card p-5 rounded-2xl hover:border-indigo-500/50 hover-glow transition-all h-full flex flex-col">
                        <div className="flex justify-between items-start mb-3">
                          <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center font-black text-xs text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            {stock.ticker[0]}
                          </div>
                          <span className={clsx(
                            "text-[10px] font-black font-mono",
                            (stock.change_percent || stock.changePercent || 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                          )}>
                            {(stock.change_percent || stock.changePercent || 0) >= 0 ? '+' : ''}{(stock.change_percent || stock.changePercent || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{stock.ticker}</span>
                          <span className="block text-[8px] text-slate-400 font-bold uppercase truncate">{stock.name}</span>
                        </div>
                        <div className="mt-auto pt-4 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 font-mono">${stock.price.toFixed(1)}</span>
                          <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            <Zap className="w-3 h-3 text-indigo-600 fill-current" />
                            <span className="text-[9px] font-black text-indigo-600 font-mono">{stock.dna_score || stock.dnaScore}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Monitoring & Performance Orbit (4/12) */}
            <div className="lg:col-span-4 space-y-6 relative z-10">
              
              {/* 1. Performance Summary Widget */}
              <PerformanceSummary stats={strategyStats} />

              {/* 2. Monitoring Orbit Section */}
              <section className="bg-slate-950 rounded-3xl p-6 shadow-2xl border border-slate-800 h-full relative overflow-hidden">
                {/* Background Accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-[60px] pointer-events-none" />
                
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      Monitoring Orbit
                    </h2>
                    <button 
                      onClick={() => navigate('/watchlist')}
                      className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700"
                    >
                      <List className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4 relative z-10">
                  {watchlistItems.length > 0 ? (
                    watchlistItems.map((item, idx) => {
                      const stock = watchlistStocks.find(s => s.ticker === item.ticker);
                      const buyPrice = item.buyPrice || stock?.price || 0;
                      const currentReturnPct = buyPrice > 0 ? ((stock?.price || 0) - buyPrice) / buyPrice * 100 : 0;
                      
                      return (
                        <motion.div 
                          key={item.ticker}
                          initial={{ x: 20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: idx * 0.1 }}
                          className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all group cursor-pointer"
                          onClick={() => stock && handleDeepDive(stock)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center font-black text-xs text-indigo-400 border border-slate-700">
                                {item.ticker[0]}
                              </div>
                              <div>
                                <span className="block text-sm font-black text-white tracking-tight">{item.ticker}</span>
                                <span className="block text-[9px] text-slate-600 font-bold uppercase tracking-widest">{item.status}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={clsx(
                                "text-xs font-black font-mono",
                                currentReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {currentReturnPct >= 0 ? '+' : ''}{currentReturnPct.toFixed(1)}%
                              </div>
                              {stock && (
                                <div className="mt-1 text-[10px] font-black text-white/90 font-mono">
                                  ${stock.price.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                                style={{ width: `${stock?.dna_score || stock?.dnaScore || 50}%` }} 
                              />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 font-mono">
                              {stock?.dna_score || stock?.dnaScore || '--'}
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

                <div className="mt-8 pt-6 border-t border-slate-800/50 relative z-10">
                   <div className="bg-indigo-500/5 p-4 rounded-2xl border border-indigo-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black text-indigo-300 uppercase tracking-tight">System Guard Active</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        개인 궤도의 모든 종목은 **Kelly Criterion** 및 **MDD 방어 로직**에 의해 실시간 감시 중입니다.
                      </p>
                   </div>
                </div>
              </section>
            </div>
          </div>

          {/* 시스템 관제 패널 - FOOTER AREA */}
          <div className="grid grid-cols-1 gap-8 relative z-10">
            <CommandSettings />
          </div>
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
