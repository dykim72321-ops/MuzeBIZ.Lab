import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ShieldCheck, Fingerprint, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { OrbitChartPanel } from './OrbitChartPanel';

interface MonitoringOrbitProps {
  watchlistItems: any[];
  watchlistStocks: any[];
  pulseMap: {[ticker: string]: any};
  handleDeepDive: (stock: any) => void;
  handleRemoveWatchlist: (ticker: string) => void;
}

export const MonitoringOrbit: React.FC<MonitoringOrbitProps> = ({
  watchlistItems,
  watchlistStocks,
  pulseMap,
  handleDeepDive,
  handleRemoveWatchlist,
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showExited, setShowExited] = useState(false);

  const handleItemClick = (item: any, stock: any) => {
    if (selectedTicker === item.ticker) {
      setSelectedTicker(null);
    } else {
      setSelectedTicker(item.ticker);
      if (stock) handleDeepDive(stock);
    }
  };

  const filteredItems = useMemo(() => {
    return watchlistItems.filter(item =>
      item.ticker.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [watchlistItems, searchTerm]);

  const activeItems = useMemo(() => {
    return filteredItems.filter(item => 
      item.status === 'HOLDING' || item.status === 'SCALE_OUT'
    );
  }, [filteredItems]);

  return (
    <section className="dark-glass-panel rounded-[2rem] p-6 border border-white/5 h-full flex flex-col relative overflow-hidden group/orbit">
      {/* HUD Background Elements */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/5 blur-[80px] rounded-full -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10 border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-md">
             <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-0.5 font-mono">Combined Tracking Orbit</span>
            <h2 className="text-base font-black text-white">통합 관심종목 오빗</h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 rounded-lg shrink-0 font-mono">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest leading-none">감시망 가동 중</span>
        </div>
      </div>

      {/* Ticker Search */}
      <div className="relative mb-6 z-10">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="티커 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#0d1527]/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-bold placeholder-slate-450 outline-none focus:border-indigo-500/60 focus:bg-[#0d1527]/80 transition-all text-slate-200 font-mono"
        />
      </div>

      {/* Items Scroll Area */}
      <div className="space-y-4 flex-1 relative z-10 custom-scrollbar overflow-y-auto pr-1">
        {activeItems.length > 0 ? (
          <>
            {/* Active Items */}
            {activeItems.map((item, idx) => {
              const stock = watchlistStocks.find(s => s.ticker === item.ticker);
              const pulseData = pulseMap[item.ticker];

              const dnaScore = pulseData?.dna_score || stock?.dna_score || stock?.dnaScore || item.initialDnaScore || 0;
              const barColor = dnaScore > 80 ? 'bg-indigo-500' : dnaScore > 50 ? 'bg-emerald-500' : 'bg-rose-500';
              const name = stock?.name || `${item.ticker} Asset`;
              const isSelected = selectedTicker === item.ticker;

              return (
                <div key={item.ticker} className="relative group/item">
                  <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className={clsx(
                      "backdrop-blur-md border p-4 rounded-2xl transition-all group overflow-hidden relative cursor-pointer active:scale-[0.99] select-none pr-12",
                      isSelected
                        ? "bg-[#111c35]/80 border-indigo-500/50 shadow-lg shadow-indigo-950/45 glow-border-indigo"
                        : "bg-white/5 border-white/10 hover:bg-[#111c35]/30 hover:border-slate-800"
                    )}
                    onClick={() => handleItemClick(item, stock)}
                  >
                    <div className="absolute top-0 right-0 p-3 opacity-[0.02] pointer-events-none">
                        <Fingerprint className="w-10 h-10 text-white" />
                    </div>

                    <div className="flex justify-between items-start mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-lg font-black text-white tracking-tighter leading-none group-hover:text-indigo-400 transition-colors uppercase font-mono">{item.ticker}</span>
                          <span className={clsx(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none font-mono",
                            item.status === 'HOLDING' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-indigo-500/10 border-indigo-500/25 text-indigo-450"
                          )}>
                            {item.status}
                          </span>
                          {item.isPenny && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none bg-cyan-500/10 border-cyan-500/25 text-cyan-400 font-mono">
                              페니
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-350 font-bold tracking-tight normal-case truncate max-w-[150px] leading-none mt-1">{name}</span>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <div className="flex items-baseline justify-end gap-1 leading-none">
                          <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">DNA</span>
                          <span className={clsx("text-sm font-black font-mono leading-none", dnaScore >= 70 ? "text-indigo-450" : dnaScore >= 50 ? "text-emerald-400" : "text-rose-400")}>
                            {dnaScore.toFixed(0)}
                          </span>
                        </div>
                        {item.currentPrice > 0 && (
                          <div className="leading-none pt-0.5">
                            <span className="text-sm font-extrabold text-white font-mono">${item.currentPrice.toFixed(item.isPenny ? 4 : 2)}</span>
                            {item.changePercent !== 0 && (
                              <span className={clsx(
                                "text-xs font-black font-mono ml-1.5",
                                item.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(dnaScore, 100)}%` }}
                        transition={{ duration: 1, delay: idx * 0.05 }}
                        className={clsx("h-full rounded-full transition-all", barColor)}
                      />
                    </div>
                  </motion.div>

                  {/* Hover Trash Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveWatchlist(item.ticker);
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 bg-slate-950/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-450 border border-white/10 hover:border-rose-550/30 rounded-xl transition-all opacity-0 group-hover/item:opacity-100 shadow-lg z-20 cursor-pointer"
                    title="제거"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Orbit Chart Panel */}
                  <AnimatePresence>
                    {isSelected && (
                      <OrbitChartPanel
                        item={item}
                        currentDna={dnaScore}
                        onClose={() => setSelectedTicker(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}


          </>
        ) : (
          <div className="py-20 text-center opacity-40 bg-white/5 border border-dashed border-white/10 rounded-2xl">
            <Target className="w-10 h-10 mx-auto mb-2 text-slate-400" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">추적 중인 관심 종목이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Protocols Box */}
      <div className="mt-6 pt-5 border-t border-white/10 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex items-center justify-center shadow-md">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-xs font-bold text-slate-350 uppercase tracking-widest font-mono">감시 베이스 프로토콜 최적화</span>
          </div>
          
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Risk Engine</span>
              <span className="text-xs font-bold text-white uppercase tracking-tighter">Kelly-v2+</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Volatility Cap</span>
              <span className="text-xs font-bold text-white uppercase tracking-tighter">35% Cap</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max MDD Guard</span>
              <span className="text-xs font-bold text-rose-400 uppercase tracking-tighter">2.5% LMT</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signal Mode</span>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-tighter">QUANT_HYBRID</span>
            </div>
          </div>
      </div>
    </section>
  );
};
