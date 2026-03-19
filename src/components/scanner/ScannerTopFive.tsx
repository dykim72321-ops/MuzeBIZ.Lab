import { motion } from 'framer-motion';
import { TrendingUp, Zap } from 'lucide-react';
import { Card } from '../ui/Card';
import clsx from 'clsx';
import type { Stock } from '../../types';

interface ScannerTopFiveProps {
  stocks: Stock[];
  onDeepDive: (stock: Stock) => void;
}

export const ScannerTopFive = ({ stocks, onDeepDive }: ScannerTopFiveProps) => {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="p-2 bg-amber-500 rounded-lg shadow-sm">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
          TOP 5 QUANT HOT ITEMS — 핵심 추천 종목
        </h2>
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
            <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-slate-900 border-2 border-white text-white flex items-center justify-center font-black text-xs z-20 shadow-lg group-hover:bg-[#0176d3] transition-colors">
              {index + 1}
            </div>
            <Card className="p-5 bg-white border border-slate-200 group-hover:border-[#0176d3] transition-all duration-300 shadow-sm group-hover:shadow-xl rounded-2xl overflow-hidden h-full flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-sm text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-all">
                  {stock.ticker[0]}
                </div>
                <div className={clsx(
                  "text-[10px] font-black font-mono",
                  stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                </div>
              </div>
              <div className="mb-4">
                <h3 className="text-xl font-black text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</h3>
                <p className="text-[9px] text-slate-400 uppercase font-black truncate">{stock.name}</p>
              </div>
              <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-400">$ {stock.price.toFixed(2)}</span>
                <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  <Zap className="w-3 h-3 text-[#0176d3] fill-current" />
                  <span className="text-[10px] font-black text-[#0176d3] font-mono">{stock.dnaScore}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
