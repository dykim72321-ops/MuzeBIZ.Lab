import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, ArrowUpWideNarrow, ArrowDownWideNarrow, 
  ArrowUpRight, Zap 
} from 'lucide-react';
import { TargetStopDisplay } from './TargetStopDisplay';
import clsx from 'clsx';
import type { Stock } from '../../types';

interface ScannerAssetListProps {
  viewMode: 'table' | 'grid';
  stocks: Stock[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: 'dna' | 'price' | 'change') => void;
  onDeepDive: (stock: Stock) => void;
}

export const ScannerAssetList = ({ 
  viewMode, 
  stocks, 
  sortBy, 
  sortOrder, 
  onSort, 
  onDeepDive 
}: ScannerAssetListProps) => {
  return (
    <>
      <div className="flex items-center gap-4 border-b border-blue-800 pb-4 mb-8">
        <div className="w-8 h-8 bg-indigo-600/10 rounded-lg border border-indigo-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-indigo-400" />
        </div>
        <h2 className="text-[11px] font-black text-white tracking-[0.3em] uppercase">
          ALL ASSETS MONITORING TERMINAL
        </h2>
      </div>

      {viewMode === 'table' ? (
        <div className="bg-[#0b101a]/60 backdrop-blur-xl rounded-[2rem] border border-blue-800 shadow-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-separate border-spacing-0">
              <thead className="bg-[#0f172a]/80 text-blue-500 uppercase text-[10px] font-black tracking-[0.2em] border-b border-blue-800">
                <tr>
                  <th className="px-8 py-6 font-black">Asset Identification</th>
                  <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => onSort('price')}>
                    Market Value {sortBy === 'price' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-6">Targets & Stops (ATR)</th>
                  <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => onSort('change')}>
                    24h Delta {sortBy === 'change' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => onSort('dna')}>
                    DNA Signal {sortBy === 'dna' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-6 text-right">Terminal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800 font-medium">
                {stocks.map(stock => (
                  <tr
                    key={stock.id}
                    className="hover:bg-indigo-500/5 transition-all group cursor-pointer"
                    onClick={() => onDeepDive(stock)}
                  >
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-xl bg-blue-900 border border-blue-800 flex items-center justify-center font-black text-sm text-indigo-400 group-hover:bg-indigo-600/20 transition-all">
                          {stock.ticker[0]}
                        </div>
                        <div>
                          <div className="font-black text-2xl text-white tracking-tighter group-hover:text-indigo-400 transition-colors uppercase leading-none mb-1">{stock.ticker}</div>
                          <div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{stock.sector}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="font-mono text-white text-xl font-black tracking-tighter tabular-nums">${stock.price.toFixed(2)}</div>
                    </td>
                    <td className="px-8 py-7">
                      <TargetStopDisplay stock={stock} />
                    </td>
                    <td className="px-8 py-7">
                      <div className={clsx(
                        "flex items-center gap-2 text-sm font-black font-mono px-3 py-1.5 rounded-lg w-fit border",
                        stock.changePercent >= 0 
                           ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                           : "text-rose-400 bg-rose-500/5 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                      )}>
                        {stock.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-5">
                        <div className="flex-1 h-2 w-32 bg-blue-900 rounded-full overflow-hidden border border-blue-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stock.dnaScore}%` }}
                            transition={{ duration: 1.5, ease: "circOut" }}
                            className={clsx(
                              "h-full rounded-full transition-all duration-1000",
                              stock.dnaScore >= 70 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" :
                                stock.dnaScore >= 40 ? "bg-indigo-500" : "bg-rose-500"
                            )}
                          />
                        </div>
                        <span className="font-black text-xl text-white font-mono tracking-tighter">{stock.dnaScore}</span>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <button className="p-4 bg-blue-900/50 text-blue-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all border border-blue-800 hover:border-indigo-500/50 hover:text-indigo-400 shadow-2xl">
                        <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {stocks.map(stock => (
            <div
              key={stock.id}
              className="p-6 bg-[#0b101a]/80 backdrop-blur-xl border border-blue-800 group-hover:border-indigo-500/50 transition-all group cursor-pointer rounded-[2rem] shadow-2xl relative overflow-hidden"
              onClick={() => onDeepDive(stock)}
            >
              {/* Card Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-blue-900 border border-blue-800 flex items-center justify-center font-black text-lg text-indigo-400 group-hover:bg-indigo-600/20 transition-all duration-300 shadow-2xl">
                  {stock.ticker[0]}
                </div>
                <div className={clsx(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg transition-all border font-mono",
                  stock.changePercent >= 0 
                     ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                     : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                )}>
                  {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                </div>
              </div>

              <div className="mb-10 relative z-10">
                <h3 className="text-4xl font-black text-white tracking-tighter group-hover:text-indigo-400 transition-colors uppercase">{stock.ticker}</h3>
                <p className="text-[10px] text-blue-500 uppercase font-black tracking-[0.3em] mt-2 truncate">{stock.name}</p>
              </div>

              <div className="flex items-end justify-between border-t border-blue-800 pb-6 pt-8 mb-6 relative z-10">
                <div>
                  <p className="text-[10px] text-blue-600 uppercase font-black tracking-widest mb-2">Asset Value</p>
                  <p className="text-3xl font-mono font-black text-white tracking-tighter tabular-nums">${stock.price.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-blue-600 uppercase font-black tracking-widest mb-2">DNA Power</p>
                  <div className="flex items-center gap-3 justify-end leading-none">
                    <Zap className={clsx("w-5 h-5 fill-current", stock.dnaScore >= 70 ? "text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "text-blue-600")} />
                    <p className="text-3xl font-mono text-white font-black tracking-tighter leading-none">{stock.dnaScore}</p>
                  </div>
                </div>
              </div>

              <TargetStopDisplay stock={stock} />
            </div>
          ))}
        </div>
      )}
    </>
  );
};
