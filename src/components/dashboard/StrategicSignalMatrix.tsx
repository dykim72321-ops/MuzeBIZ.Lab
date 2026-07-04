import { Activity, TrendingUp, TrendingDown, Fingerprint, Zap } from 'lucide-react';
import { processSignal } from '../../utils/signalProcessor';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface StrategicSignalMatrixProps {
  strongTickers: string[];
  normalTickers: string[];
  pulseMap: any;
  handleDeepDive?: (stock: any) => void;
}

export const StrategicSignalMatrix: React.FC<StrategicSignalMatrixProps> = ({
  strongTickers,
  normalTickers,
  pulseMap,
  handleDeepDive,
}) => {
  return (
    <section className="space-y-8 relative">
      <div className="flex items-center justify-between border-b border-blue-800/80 pb-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(99,102,241,0.15)]">
             <Activity className="w-5 h-5 text-indigo-400" />
          </div>
          <h2 className="text-sm font-black text-white uppercase tracking-[0.3em]">
            Strategic Signal Matrix
          </h2>
        </div>
        <div className="flex gap-2 bg-[#020617] p-1 rounded-xl border border-blue-800/80">
          <button className="px-5 py-2 text-[10px] font-black text-blue-500 hover:text-white uppercase tracking-widest transition-all rounded-lg">
            Active Nodes
          </button>
          <button className="px-5 py-2 bg-indigo-600 text-white font-black text-[10px] rounded-lg uppercase tracking-widest shadow-[0_0_15px_rgba(79,70,229,0.35)]">
            Focus Logic
          </button>
        </div>
      </div>

      {/* STRONG SIGNALS with Custom Layout */}
      {strongTickers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {strongTickers.map((ticker, idx) => {
              const rawData = pulseMap[ticker];
              const displaySignal = processSignal(rawData);
              const isBull = displaySignal.status === 'BUY' || displaySignal.status === 'STRONG_BUY' || rawData.signal === 'BUY';
              
              const bgColor = isBull ? "bg-emerald-500/[0.03]" : "bg-rose-500/[0.03]";
              const borderColor = isBull ? "border-emerald-500/30" : "border-rose-500/30";
              const textColor = isBull ? "text-emerald-400" : "text-rose-400";
              const Icon = isBull ? TrendingUp : TrendingDown;
              const buttonShadow = isBull ? "shadow-[0_0_20px_rgba(52,211,153,0.3)]" : "shadow-[0_0_20px_rgba(244,63,94,0.3)]";

              return (
                <motion.div 
                    key={ticker}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={clsx(
                        "rounded-[2.5rem] p-8 border backdrop-blur-3xl transition-all h-full flex flex-col hover:-translate-y-1 relative group overflow-hidden", 
                        bgColor, 
                        borderColor,
                        isBull ? "hover:shadow-[0_0_80px_rgba(52,211,153,0.05)]" : "hover:shadow-[0_0_80px_rgba(244,63,94,0.05)]"
                    )}
                >
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Fingerprint className="w-24 h-24 text-white" />
                  </div>

                  <div className="flex justify-between items-start mb-8 relative z-10">
                    <div className="flex gap-5 items-center">
                      <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner", bgColor, borderColor)}>
                        <Icon className={clsx("w-7 h-7", textColor)} />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-white tracking-tighter uppercase font-mono">{ticker}</h3>
                        <span className={clsx("text-[9px] font-black uppercase tracking-[0.3em] block mt-1 opacity-70", textColor)}>
                          {isBull ? "STRAT_ALPHA_PRIME" : "STRAT_ALPHA_DELTA"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-1">Confidence</span>
                      <span className={clsx("text-3xl font-black font-mono tracking-tighter", textColor)}>
                        {displaySignal.dnaScore}<span className="text-sm ml-0.5 opacity-50">%</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5 flex-1 relative z-10">
                    <div className="bg-[#020617]/40 rounded-3xl p-5 border border-blue-800/50 backdrop-blur-md">
                      <h4 className={clsx("text-[9px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2", textColor)}>
                        <Zap className="w-3 h-3 fill-current" />
                        {isBull ? "Bullish Catalysts" : "Bearish Catalysts"}
                      </h4>
                      <ul className="space-y-3">
                        {(isBull ? displaySignal.bullPoints : displaySignal.bearPoints).slice(0, 3).map((point, i) => (
                          <li key={i} className="flex gap-2.5 items-start text-[11px] text-blue-400 font-medium leading-relaxed">
                            <span className={clsx("w-1 h-1 rounded-full mt-1.5 shrink-0 animate-pulse", isBull ? "bg-emerald-400" : "bg-rose-400")} />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="bg-[#020617]/40 rounded-3xl p-5 border border-blue-800/50 backdrop-blur-md opacity-60">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-4 text-blue-500">
                        {isBull ? "Delta Risks" : "Bull Offset"}
                      </h4>
                      <ul className="space-y-3">
                        {(isBull ? displaySignal.bearPoints : displaySignal.bullPoints).slice(0, 3).map((point, i) => (
                          <li key={i} className="flex gap-2.5 items-start text-[11px] text-blue-500 font-medium leading-relaxed">
                             <div className="w-1 h-1 bg-blue-700 rounded-full mt-1.5 shrink-0" />
                             {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-blue-800/50 flex justify-between items-center relative z-10">
                    <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Execution Node Locked</span>
                    <button
                      onClick={() => handleDeepDive?.(rawData)}
                      className={clsx(
                        "px-8 py-3.5 rounded-2xl font-black text-xs text-white transition-all uppercase tracking-widest shadow-2xl active:scale-95",
                        isBull ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500",
                        buttonShadow
                      )}
                    >
                      {isBull ? "Execute Long" : "Execute Short"}
                    </button>
                  </div>
                </motion.div>
              );
          })}
        </div>
      )}

      {/* NORMAL SIGNALS (Grid) */}
      {normalTickers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {normalTickers.map((ticker) => {
            const rawData = pulseMap[ticker];
            const displaySignal = processSignal(rawData);
            
            return (
              <motion.div 
                key={ticker} 
                className="bg-[#020617]/40 backdrop-blur-md border border-blue-800/80 rounded-[2rem] p-6 hover:border-indigo-500/40 hover:bg-[#020617]/60 transition-all group cursor-help relative"
              >
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-2xl font-black text-white tracking-widest uppercase font-mono group-hover:text-indigo-400 transition-all">{ticker}</h4>
                  <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">AlphaSync</span>
                  </div>
                </div>
                <p className="text-[11px] text-blue-500 line-clamp-2 leading-relaxed mb-6 font-medium">
                  {displaySignal.reasoning || displaySignal.bullPoints[0]}
                </p>
                <div className="flex justify-between items-center pt-5 border-t border-blue-800/50">
                  <div className="flex flex-col">
                      <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">DNA Score</span>
                      <span className="text-xl font-black text-white font-mono leading-none mt-1">{displaySignal.dnaScore}</span>
                  </div>
                  <button
                    onClick={() => handleDeepDive?.(rawData)}
                    className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 transition-all uppercase tracking-[0.2em] bg-indigo-500/5 px-4 py-2 rounded-xl border border-indigo-500/10"
                  >
                    Details
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {strongTickers.length === 0 && normalTickers.length === 0 && (
        <div className="bg-[#020617]/40 backdrop-blur-3xl rounded-[3rem] border border-dashed border-blue-800 p-24 text-center">
          <Activity className="w-16 h-16 text-indigo-500 animate-pulse mx-auto mb-6 opacity-30 shadow-[0_0_20px_rgba(99,102,241,0.2)]" />
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-2 opacity-50">Deep Market Scan Active</p>
          <p className="text-blue-700 text-[10px] font-medium tracking-widest">// Awaiting algorithmic execution pulse...</p>
        </div>
      )}
    </section>
  );
};
