import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Sparkles, ShieldCheck, Fingerprint } from 'lucide-react';
import type { WatchlistItem } from '../../services/watchlistService';
import clsx from 'clsx';
import { OrbitChartPanel } from './OrbitChartPanel';

interface MonitoringOrbitProps {
  watchlistItems: WatchlistItem[];
  watchlistStocks: any[];
  pulseMap: {[ticker: string]: any};
  handleDeepDive: (stock: any) => void;
}

export const MonitoringOrbit: React.FC<MonitoringOrbitProps> = ({
  watchlistItems,
  watchlistStocks,
  pulseMap,
  handleDeepDive
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const handleItemClick = (item: WatchlistItem, stock: any) => {
    if (selectedTicker === item.ticker) {
      setSelectedTicker(null); // 토글 닫기
    } else {
      setSelectedTicker(item.ticker);
    }
  };

  return (
    <section className="bg-[#020617]/90 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-slate-800/50 h-full flex flex-col relative overflow-hidden group/orbit shadow-[0_0_80px_rgba(34,211,238,0.03)]">
      {/* HUD Background Elements */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/5 blur-[80px] rounded-full -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(34,211,238,0.15)]">
               <Target className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-[0.3em]">Monitoring Orbit</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Scanning Alpha Nexus</span>
              </div>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-slate-700 hover:text-cyan-400 transition-colors cursor-help" />
      </div>

      <div className="space-y-6 flex-1 relative z-10 custom-scrollbar overflow-y-auto pr-2">
        {watchlistItems.length > 0 ? (
          watchlistItems.map((item, idx) => {
            const stock = watchlistStocks.find(s => s.ticker === item.ticker);
            const pulseData = pulseMap[item.ticker];

            const dnaScore = pulseData?.dna_score || stock?.dna_score || stock?.dnaScore || 0;
            const barColor = dnaScore > 80 ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]' : dnaScore > 50 ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]';
            const name = stock?.name || `${item.ticker} Asset`;
            const isSelected = selectedTicker === item.ticker;

            return (
              <div key={item.ticker}>
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={clsx(
                  "backdrop-blur-md border p-5 rounded-3xl transition-all group overflow-hidden relative cursor-pointer active:scale-[0.98]",
                  isSelected
                    ? "bg-[#020617]/80 border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.08)]"
                    : "bg-[#020617]/40 border-slate-800/80 hover:bg-[#020617]/60"
                )}
                onClick={() => handleItemClick(item, stock)}
              >
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Fingerprint className="w-10 h-10 text-white" />
                </div>

                <div className="flex justify-between items-end mb-3">
                  <div>
                    <span className="block text-xl font-black text-white tracking-tighter leading-none mb-1 group-hover:text-cyan-400 transition-colors uppercase font-mono">{item.ticker}</span>
                    <span className="block text-[10px] text-slate-500 font-bold tracking-widest leading-none normal-case truncate max-w-[120px]">{name}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">DNA Score</span>
                    <span className={clsx("block text-lg font-black font-mono leading-none drop-shadow-sm", dnaScore >= 70 ? "text-cyan-400" : dnaScore >= 50 ? "text-emerald-400" : "text-rose-400")}>
                        {dnaScore.toFixed(0)}
                    </span>
                  </div>
                </div>
                
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(dnaScore, 100)}%` }}
                    transition={{ duration: 1, delay: idx * 0.1 }}
                    className={clsx("h-full rounded-full transition-all", barColor)}
                  />
                </div>
              </motion.div>

              {/* 차트 패널 — 선택된 종목에만 표시 */}
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
          })
        ) : (
          <div className="py-20 text-center opacity-20">
            <Target className="w-12 h-12 mx-auto mb-3" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Operational Vacuum</p>
          </div>
        )}
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/80 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-500/10 rounded-xl border border-blue-500/20 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Base Protocol Optimized</span>
          </div>
          
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Risk Engine</span>
              <span className="text-[10px] font-black text-white font-mono uppercase tracking-tighter">Kelly-v2+</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Volatility Cap</span>
              <span className="text-[10px] font-black text-white font-mono uppercase tracking-tighter">35% Cap</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Max MDD Guard</span>
              <span className="text-[10px] font-black text-rose-500 font-mono uppercase tracking-tighter">2.5% LMT</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Signal Mode</span>
              <span className="text-[10px] font-black text-emerald-500 font-mono uppercase tracking-tighter shadow-emerald-500/20">QUANT_HYBRID</span>
            </div>
          </div>
      </div>

      <div className="mt-6 p-5 bg-[#020617] border border-slate-800/80 rounded-3xl flex items-center justify-between relative z-10 shadow-inner">
         <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Node Status</span>
         <div className="flex gap-4">
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-black text-emerald-400 font-mono">12ms</span>
              <span className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">Latency</span>
            </div>
            <div className="h-4 w-px bg-slate-800/50 mt-1" />
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-black text-cyan-400 font-mono">99.9%</span>
              <span className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">Uptime</span>
            </div>
         </div>
      </div>
    </section>
  );
};
