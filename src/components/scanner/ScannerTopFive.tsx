import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { Stock } from '../../types';
import { DNA_BUY } from '../../constants/dnaThresholds';

interface ScannerTopFiveProps {
  stocks: Stock[];
  onDeepDive: (stock: Stock) => void;
}

export const ScannerTopFive = ({ stocks, onDeepDive }: ScannerTopFiveProps) => {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4 border-b border-blue-800 pb-5">
        <div className="w-10 h-10 bg-indigo-600/20 rounded-xl border border-indigo-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)]">
          <TrendingUp className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
            TOP 5 QUANT HOT ITEMS
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-bold tracking-widest">REAL-TIME</span>
          </h2>
          <p className="text-[10px] text-blue-500 font-bold tracking-wider mt-1">최첨단 퀀트 알고리즘이 선별한 시장 주도주 TOP 5</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {stocks.slice(0, 5).map((stock, index) => (
          <motion.div
            key={stock.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onDeepDive(stock)}
            className="relative group cursor-pointer"
          >
            <div className="absolute -top-3 -left-3 w-8 h-8 rounded-xl bg-blue-900 border border-blue-700 text-indigo-400 flex items-center justify-center font-black text-xs z-20 shadow-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
              {index + 1}
            </div>
            
            <div className="p-5 bg-[#0b101a]/80 backdrop-blur-xl border border-blue-800 group-hover:border-indigo-500/50 transition-all duration-500 shadow-2xl rounded-[1.5rem] overflow-hidden h-full flex flex-col relative">
              {/* Card Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="flex justify-between items-start mb-5 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-blue-900 border border-blue-800 flex items-center justify-center font-black text-sm text-indigo-400 group-hover:bg-indigo-600/20 group-hover:border-indigo-500/40 transition-all">
                  {stock.ticker[0]}
                </div>
                <div className={clsx(
                  "text-[11px] font-black font-mono px-2 py-0.5 rounded-lg border",
                  stock.changePercent >= 0 
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
                    : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                )}>
                  {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                </div>
              </div>

              <div className="mb-6 relative z-10">
                <h3 className="text-2xl font-black text-white tracking-tighter group-hover:text-indigo-400 transition-colors">{stock.ticker}</h3>
                <p className="text-[10px] text-blue-500 uppercase font-black truncate tracking-wider mt-1">{stock.name}</p>
              </div>

              <div className="mt-auto space-y-4 relative z-10">
                <div className="flex justify-between items-end">
                   <div className="flex flex-col">
                      <span className="text-[9px] text-blue-600 font-bold uppercase tracking-widest">DNA Health</span>
                      <span className="text-lg font-black text-white font-mono leading-none">{stock.dnaScore}</span>
                   </div>
                   <span className="font-mono text-xs font-bold text-blue-500">$ {stock.price.toFixed(2)}</span>
                </div>
                
                <div className="w-full h-1.5 bg-blue-900 rounded-full overflow-hidden border border-blue-800/50">
                   <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-1000 ease-out",
                        stock.dnaScore >= DNA_BUY ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : stock.dnaScore >= 50 ? "bg-amber-500" : "bg-rose-500"
                      )} 
                      style={{ width: `${stock.dnaScore}%` }} 
                   />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
