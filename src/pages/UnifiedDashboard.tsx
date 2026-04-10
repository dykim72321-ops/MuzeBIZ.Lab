import { useState, useEffect, useMemo, useCallback } from 'react';

import { 
  Zap,
  ShieldCheck
} from 'lucide-react';
import { fetchStrategyStats } from '../services/pythonApiService';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { StrategicSignalMatrix } from '../components/dashboard/StrategicSignalMatrix';
import { AlphaDiscoverySection } from '../components/dashboard/AlphaDiscoverySection';
import { MonitoringOrbit } from '../components/dashboard/MonitoringOrbit';


// Hooks & Services
import { useMarketEngine } from '../hooks/useMarketEngine';
import { getWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { fetchMultipleStocksOptimized } from '../services/stockService';
import { processSignal } from '../utils/signalProcessor';
import { toast } from 'sonner';
import { supabase as supabaseClient } from '../lib/supabase';


import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { LiveExecutionCenter } from '../components/dashboard/LiveExecutionCenter';
import { PerformanceSummary } from '../components/dashboard/PerformanceSummary';

export const UnifiedDashboard = () => {
  const { pulseMap } = useMarketEngine();

  // 1. Data States
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistStocks, setWatchlistStocks] = useState<any[]>([]);
  const [discoveryStocks, setDiscoveryStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [strategyStats, setStrategyStats] = useState<any | null>(null);
  const [lastFetchedTime, setLastFetchedTime] = useState<string>('--:--:--');
  const [isMarketOpen, setIsMarketOpen] = useState(false);

  // US 시장 개장 여부 체크 (ET 기준 평일 09:30~16:00)
  useEffect(() => {
    const checkMarket = () => {
      const now = new Date();
      const etOffset = -5 * 60; // EST (DST 고려하지 않은 단순 기준)
      const localOffset = now.getTimezoneOffset();
      const etNow = new Date(now.getTime() + (localOffset + etOffset) * 60000);
      const day = etNow.getDay(); // 0=일, 6=토
      const hours = etNow.getHours();
      const minutes = etNow.getMinutes();
      const timeInMin = hours * 60 + minutes;
      const open = day >= 1 && day <= 5 && timeInMin >= 570 && timeInMin < 960; // 9:30~16:00
      setIsMarketOpen(open);
    };
    checkMarket();
    const id = setInterval(checkMarket, 60000);
    return () => clearInterval(id);
  }, []);

  // 2. Fetch Data
  const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const items = await getWatchlist();
        setWatchlistItems(items);
        
        // Parallelized fetching
        const [watchlistData, statsData] = await Promise.all([
          items.length > 0 ? fetchMultipleStocksOptimized(items.map(i => i.ticker)) : Promise.resolve([]),
          fetchStrategyStats()
        ]);

        // [Fix] Direct Supabase fetch using imported client
        const { data: dData, error: dError } = await supabaseClient
          .from('daily_discovery')
          .select('*')
          .order('dna_score', { ascending: false })
          .limit(15);
        
        if (dError) console.error('Discovery fetch error:', dError);


        setWatchlistStocks(watchlistData);
        setDiscoveryStocks(dData || []);
        setStrategyStats(statsData);
        setLastFetchedTime(new Date().toISOString().substring(11, 19));
      } catch (err) {
        console.error('Failed to load unified data:', err);
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    return (discoveryStocks || [])
      .filter(s => !watchlistTickers.has(s.ticker) && (s.dna_score || 0) >= 80)
      .slice(0, 5);
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
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Terminal Grid Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Ambient Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-1/2 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full -translate-x-1/2 pointer-events-none" />

      {/* 🆕 Global Refresh Indicator (Syncing mode) */}
      {loading && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-[#0b101a]/90 backdrop-blur-xl px-4 py-2 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em]">Synchronizing Nexus...</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-10 animate-in fade-in duration-700 relative z-10">
        {/* 1. Unified Header (Alpha Discovery Terminal) */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-slate-800/50 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Integrated Intelligence Nexus</span>
            </div>
            <h1 className="text-4xl font-black text-white flex items-center gap-4 tracking-tighter">
              <Zap className="w-10 h-10 text-indigo-500 fill-indigo-500/20" />
              Alpha Discovery Terminal
            </h1>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Global Market Status</span>
              <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full border shadow-[0_0_15px_rgba(16,185,129,0.1)] ${isMarketOpen ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800/40 border-slate-700/40'}`}>
                <div className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-slate-600'}`} />
                <span className={`text-xs font-black uppercase tracking-widest leading-none ${isMarketOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isMarketOpen ? 'Market Open' : 'Market Closed'}
                </span>
              </div>
            </div>
            <button className="flex items-center gap-3 px-6 py-3 bg-indigo-900/10 border border-indigo-500/30 rounded-2xl hover:bg-indigo-900/20 transition-all shadow-[0_0_20px_rgba(99,102,241,0.1)] group/guard">
              <ShieldCheck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">NexGuard Locked</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
                <div className="h-[400px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
                <div className="h-[300px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
            </div>
            <div className="lg:col-span-4">
                <div className="h-[700px] bg-[#0b101a]/40 rounded-[2.5rem] border border-slate-800 animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {/* TOP ROW: Alpha Discovery (Full Width) */}
            <div className="relative z-10">
              <AlphaDiscoverySection 
                filteredDiscovery={filteredDiscovery} 
                handleDeepDive={handleDeepDive} 
                lastFetchedTime={lastFetchedTime}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start relative z-10">
              {/* LEFT COLUMN: Strategic Signal Matrix (8/12) */}
              <div className="lg:col-span-8 space-y-10">
                <StrategicSignalMatrix 
                  strongTickers={strongTickers} 
                  normalTickers={normalTickers} 
                  pulseMap={pulseMap} 
                />

                {/* 🆕 Integrated Command Center (Live Execution) */}
                <div className="mt-10">
                  <LiveExecutionCenter />
                </div>
              </div>

              {/* RIGHT COLUMN: Monitoring Orbit & Stats (4/12) */}
              <div className="lg:col-span-4 space-y-8">
                <PerformanceSummary stats={strategyStats} />
                
                <MonitoringOrbit 
                  watchlistItems={watchlistItems} 
                  watchlistStocks={watchlistStocks} 
                  pulseMap={pulseMap}
                  handleDeepDive={handleDeepDive} 
                />
              </div>
            </div>
            
            {/* Hidden / Internal Modules (Kept for functionality) */}
            <div className="hidden">
              <CommandSettings />
            </div>
          </div>
        )}
      </div>

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
