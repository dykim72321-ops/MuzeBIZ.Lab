import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, ArrowUpWideNarrow, ArrowDownWideNarrow, 
  ArrowUpRight, Zap 
} from 'lucide-react';
import { Card } from '../ui/Card';
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
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-6">
        <div className="h-5 w-1 bg-slate-400 rounded-full" />
        <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">
          ALL ASSETS MONITORING
        </h2>
      </div>

      {viewMode === 'table' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-200">
                <tr>
                  <th className="px-8 py-5">Asset Identification</th>
                  <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => onSort('price')}>
                    Market Value {sortBy === 'price' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-5 text-left">Targets & Stops (ATR)</th>
                  <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => onSort('change')}>
                    24h Delta {sortBy === 'change' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => onSort('dna')}>
                    DNA Signal {sortBy === 'dna' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                  </th>
                  <th className="px-8 py-5 text-right">Terminal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stocks.map(stock => (
                  <tr
                    key={stock.id}
                    className="hover:bg-slate-50/80 transition-all group cursor-pointer"
                    onClick={() => onDeepDive(stock)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-black text-xs text-[#0176d3] border border-slate-200 group-hover:bg-white group-hover:shadow-sm transition-all">
                          {stock.ticker[0]}
                        </div>
                        <div>
                          <div className="font-black text-xl text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</div>
                          <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{stock.sector}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-mono text-slate-800 text-lg font-black">${stock.price.toFixed(2)}</div>
                    </td>
                    <td className="px-8 py-6">
                      <TargetStopDisplay stock={stock} />
                    </td>
                    <td className="px-8 py-6">
                      <div className={clsx(
                        "flex items-center gap-1.5 text-sm font-black font-mono",
                        stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {stock.changePercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 w-24 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stock.dnaScore}%` }}
                            transition={{ duration: 1, ease: "circOut" }}
                            className={clsx(
                              "h-full rounded-full transition-all duration-700",
                              stock.dnaScore >= 70 ? "bg-[#0176d3]" :
                                stock.dnaScore >= 40 ? "bg-indigo-400" : "bg-rose-400"
                            )}
                          />
                        </div>
                        <span className="font-black text-lg text-slate-800 font-mono">{stock.dnaScore}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button className="p-3 bg-white text-slate-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all active:scale-90 border border-slate-200 hover:border-[#0176d3] hover:text-[#0176d3] shadow-sm">
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
            <Card
              key={stock.id}
              className="p-6 bg-white border border-slate-200 hover:border-[#0176d3]/40 transition-all group cursor-pointer group rounded-2xl shadow-sm hover:shadow-xl"
              onClick={() => onDeepDive(stock)}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-lg text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-all duration-300">
                  {stock.ticker[0]}
                </div>
                <div className={clsx(
                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm transition-all",
                  stock.changePercent >= 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                )}>
                  {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</h3>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em] mt-1">{stock.name}</p>
              </div>

              <div className="flex items-end justify-between border-t border-slate-50 pt-6 mb-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Asset Value</p>
                  <p className="text-2xl font-mono font-black text-slate-900 tabular-nums">${stock.price.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">DNA Power</p>
                  <div className="flex items-center gap-2 justify-end">
                    <Zap className={clsx("w-4 h-4 fill-current", stock.dnaScore >= 70 ? "text-[#0176d3]" : "text-amber-500")} />
                    <p className="text-2xl font-mono text-slate-900 font-black">{stock.dnaScore}</p>
                  </div>
                </div>
              </div>

              <TargetStopDisplay stock={stock} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
};
