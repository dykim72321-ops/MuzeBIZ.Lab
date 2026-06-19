import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Search, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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
    const statusOrder: Record<string, number> = {
      'HOLDING': 1,
      'SCALE_OUT': 2,
      'WATCHING': 3,
    };
    return filteredItems
      .filter(item => item.status !== 'EXITED')
      .sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
  }, [filteredItems]);

  const exitedItems = useMemo(() => {
    return filteredItems.filter(item => item.status === 'EXITED');
  }, [filteredItems]);

  return (
    <section className="bg-transparent h-full flex flex-col relative overflow-hidden group/orbit">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 relative z-10">
        <div>
          <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest block mb-1">Combined Tracking Orbit</span>
          <h2 className="text-[15px] font-bold text-slate-900 font-sans">통합 관심종목 오빗</h2>
        </div>
        <div className="flex items-center gap-2 text-slate-500 shrink-0 font-mono">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest leading-none">ORBIT SCANNER</span>
        </div>
      </div>

      {/* Ticker Search */}
      <div className="relative mb-6 z-10">
        <Search className="w-4 h-4 text-indigo-500 absolute left-0 top-3 drop-shadow-[0_0_6px_rgba(79,70,229,0.4)] stroke-[2.5]" />
        <input
          type="text"
          placeholder="티커 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-b border-slate-200 pl-8 pr-4 py-2.5 text-sm font-semibold placeholder-slate-400 outline-none focus:border-slate-900 transition-colors text-slate-900 font-sans"
        />
      </div>

      {/* Items Scroll Area */}
      <div className="flex-1 relative z-10 custom-scrollbar overflow-y-auto pr-1">
        {activeItems.length > 0 ? (
          <div className="flex flex-col">
            {activeItems.map((item, idx) => (
              <OrbitItem
                key={item.ticker}
                item={item}
                idx={idx}
                stock={watchlistStocks.find(s => s.ticker === item.ticker)}
                pulseData={pulseMap[item.ticker]}
                isSelected={selectedTicker === item.ticker}
                onItemClick={handleItemClick}
                onRemove={handleRemoveWatchlist}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center">
            <Target className="w-8 h-8 mx-auto mb-4 text-indigo-500 drop-shadow-[0_0_12px_rgba(79,70,229,0.4)] stroke-[2.5]" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider font-sans">추적 중인 종목이 없습니다.</p>
          </div>
        )}

        {/* EXITED toggle */}
        {exitedItems.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowExited(v => !v)}
              className="flex items-center gap-2 text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors w-full py-2 border-t border-slate-100"
            >
              {showExited ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              청산 완료 {exitedItems.length}개 {showExited ? '▲ 접기' : '▼ 펼치기'}
            </button>
            <AnimatePresence>
              {showExited && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col overflow-hidden"
                >
                  {exitedItems.map((item, idx) => (
                    <OrbitItem
                      key={item.ticker}
                      item={item}
                      idx={idx}
                      stock={watchlistStocks.find(s => s.ticker === item.ticker)}
                      pulseData={pulseMap[item.ticker]}
                      isSelected={selectedTicker === item.ticker}
                      onItemClick={handleItemClick}
                      onRemove={handleRemoveWatchlist}
                      dimmed
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Minimal Protocols Footer */}
      <div className="mt-8 pt-4 border-t border-slate-100">
          <div className="flex justify-between text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
             <span>Engine: Kelly-v2+</span>
             <span>Guard: 2.5% LMT</span>
             <span>Mode: Q-Hybrid</span>
          </div>
      </div>
    </section>
  );
};

interface OrbitItemProps {
  item: any;
  idx: number;
  stock: any;
  pulseData: any;
  isSelected: boolean;
  onItemClick: (item: any, stock: any) => void;
  onRemove: (ticker: string) => void;
  dimmed?: boolean;
}

const OrbitItem: React.FC<OrbitItemProps> = ({ item, idx, stock, pulseData, isSelected, onItemClick, onRemove, dimmed }) => {
  const dnaScore = pulseData?.dna_score || stock?.dna_score || stock?.dnaScore || item.initialDnaScore || 0;
  const name = stock?.name || `${item.ticker} Asset`;

  return (
    <div className={clsx("relative group/item", dimmed && "opacity-50")}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: idx * 0.05 }}
        className={clsx(
          "py-5 transition-all group relative cursor-pointer select-none border-b border-slate-100 last:border-none",
          isSelected ? "bg-slate-50 -mx-4 px-4" : "bg-transparent hover:bg-slate-50 -mx-4 px-4"
        )}
        onClick={() => onItemClick(item, stock)}
      >
        <div className="flex justify-between items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-slate-900 tracking-tight leading-none group-hover:text-slate-600 transition-colors uppercase font-mono">{item.ticker}</span>
              <span className={clsx(
                "text-[10px] font-mono font-semibold uppercase tracking-widest",
                item.status === 'HOLDING' ? "text-emerald-500" :
                item.status === 'WATCHING' ? "text-slate-400" :
                "text-slate-500"
              )}>
                {item.status}
              </span>
            </div>
            <span className="block text-xs text-slate-500 truncate max-w-[180px] leading-none mt-0.5">{name}</span>
          </div>

          <div className="text-right flex items-center gap-8">
            <div>
              <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-1">DNA</div>
              <div className="text-base font-semibold font-mono leading-none text-slate-900">
                {dnaScore.toFixed(0)}
              </div>
            </div>
            {item.currentPrice > 0 && (
              <div>
                <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-1">Current</div>
                <div className="leading-none font-mono flex items-baseline gap-2">
                  <span className="text-base font-semibold font-mono text-slate-900">${item.currentPrice.toFixed(item.isPenny ? 4 : 2)}</span>
                  {item.changePercent !== 0 && (
                    <span className={clsx(
                      "text-[10px] font-normal",
                      item.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Hover Trash Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(item.ticker); }}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover/item:opacity-100 z-20 cursor-pointer"
        title="제거"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Orbit Chart Panel */}
      <AnimatePresence>
        {isSelected && (
          <OrbitChartPanel
            item={item}
            currentDna={dnaScore}
            onClose={() => onItemClick(item, stock)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
