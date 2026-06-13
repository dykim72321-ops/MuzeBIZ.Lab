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

  const { activeItems, exitedItems } = useMemo(() => {
    return {
      activeItems: filteredItems.filter(item => item.status !== 'EXITED'),
      exitedItems: filteredItems.filter(item => item.status === 'EXITED'),
    };
  }, [filteredItems]);

  return (
    <section className="bg-white border border-slate-200/60 rounded-[2rem] p-6 shadow-xl shadow-slate-100/30 h-full flex flex-col relative overflow-hidden group/orbit">
      {/* HUD Background Elements */}
      <div className="absolute inset-0 opacity-[0.2] pointer-events-none bg-[linear-gradient(#f1f5f9_1px,transparent_1px),linear-gradient(90deg,#f1f5f9_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/5 blur-[80px] rounded-full -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-center shadow-sm">
             <Target className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Combined Tracking Orbit</span>
            <h2 className="text-base font-black text-slate-800">통합 관심종목 오빗</h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100/80 px-2.5 py-1 rounded-lg shrink-0">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-widest leading-none">감시망 가동 중</span>
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
          className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-9 pr-4 py-2 text-xs font-bold placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white transition-all text-slate-800"
        />
      </div>

      {/* Items Scroll Area */}
      <div className="space-y-4 flex-1 relative z-10 custom-scrollbar overflow-y-auto pr-1">
        {activeItems.length > 0 || exitedItems.length > 0 ? (
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
                        ? "bg-slate-50/90 border-indigo-400/40 shadow-sm"
                        : "bg-slate-50/30 border-slate-100/80 hover:bg-slate-50 hover:border-slate-200"
                    )}
                    onClick={() => handleItemClick(item, stock)}
                  >
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] pointer-events-none">
                        <Fingerprint className="w-10 h-10 text-slate-900" />
                    </div>

                    <div className="flex justify-between items-start mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-black text-slate-900 tracking-tighter leading-none group-hover:text-indigo-600 transition-colors uppercase font-mono">{item.ticker}</span>
                          <span className={clsx(
                            "text-[8px] font-black px-1.5 py-0.5 rounded border leading-none",
                            item.status === 'HOLDING' ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                          )}>
                            {item.status}
                          </span>
                          {item.isPenny && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded border leading-none bg-cyan-50 border-cyan-200 text-cyan-600">
                              페니
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-slate-400 font-bold tracking-tight normal-case truncate max-w-[150px] leading-none mt-1">{name}</span>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <div className="flex items-baseline justify-end gap-1 leading-none">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">DNA</span>
                          <span className={clsx("text-xs font-black font-mono leading-none", dnaScore >= 70 ? "text-indigo-600" : dnaScore >= 50 ? "text-emerald-600" : "text-rose-600")}>
                            {dnaScore.toFixed(0)}
                          </span>
                        </div>
                        {item.currentPrice > 0 && (
                          <div className="leading-none">
                            <span className="text-xs font-extrabold text-slate-800 font-mono">${item.currentPrice.toFixed(item.isPenny ? 4 : 2)}</span>
                            {item.changePercent !== 0 && (
                              <span className={clsx(
                                "text-[9px] font-black font-mono ml-1.5",
                                item.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
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
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/50 hover:border-rose-100 rounded-xl transition-all opacity-0 group-hover/item:opacity-100 shadow-sm z-20"
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

            {/* Exited Items Accordion */}
            {exitedItems.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowExited(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors border border-dashed border-slate-200"
                >
                  <span>청산 완료 {exitedItems.length}개</span>
                  <div className="flex items-center gap-1">
                    {showExited ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{showExited ? '접기' : '펼치기'}</span>
                  </div>
                </button>

                <AnimatePresence>
                  {showExited && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2.5 mt-2.5 overflow-hidden"
                    >
                      {exitedItems.map((item) => (
                        <div
                          key={item.ticker}
                          className="p-3.5 bg-slate-50/20 border border-slate-100 rounded-xl flex items-center justify-between opacity-60 group/exited relative pr-12"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] border bg-slate-100 border-slate-200 text-slate-400 font-mono">
                              {item.ticker.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-500 text-sm leading-none line-through">{item.ticker}</span>
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded border leading-none bg-slate-100 border-slate-200 text-slate-400">
                                  EXITED
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-semibold block mt-1">
                                {item.buyPrice ? `진입: $${item.buyPrice.toFixed(item.isPenny ? 4 : 2)}` : '-'}
                              </span>
                            </div>
                          </div>

                          {/* Hover Trash Button for Exited */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveWatchlist(item.ticker);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 hover:bg-rose-50 text-slate-300 hover:text-rose-600 border border-slate-200/50 hover:border-rose-100 rounded-xl transition-all opacity-0 group-hover/exited:opacity-100 shadow-sm"
                            title="제거"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          <div className="py-20 text-center opacity-30 bg-slate-50/40 border border-dashed border-slate-200 rounded-2xl">
            <Target className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">추적 중인 관심 종목이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Protocols Box */}
      <div className="mt-6 pt-5 border-t border-slate-100 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">감시 베이스 프로토콜 최적화</span>
          </div>
          
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Risk Engine</span>
              <span className="text-[10px] font-bold text-slate-700 font-mono uppercase tracking-tighter">Kelly-v2+</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Volatility Cap</span>
              <span className="text-[10px] font-bold text-slate-700 font-mono uppercase tracking-tighter">35% Cap</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Max MDD Guard</span>
              <span className="text-[10px] font-bold text-rose-600 font-mono uppercase tracking-tighter">2.5% LMT</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Signal Mode</span>
              <span className="text-[10px] font-bold text-emerald-600 font-mono uppercase tracking-tighter">QUANT_HYBRID</span>
            </div>
          </div>
      </div>
    </section>
  );
};
