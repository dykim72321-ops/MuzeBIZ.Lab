import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Clock, 
  Target, 
  ShieldAlert,
  Zap
} from 'lucide-react';
import { Card } from '../ui/Card';

interface QuantPortfolioProps {
  positions: any[];
  signals: any[];
  onStockClick?: (stock: any) => void;
}

export const QuantPortfolioSection: React.FC<QuantPortfolioProps> = ({ 
  positions, 
  signals,
  onStockClick 
}) => {
  const pendingSignals = signals.filter(s => s.status === 'PENDING');

  return (
    <div className="space-y-8">
      {/* 1. Active Positions Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            Active Quant Positions
          </h2>
          <span className="text-[10px] font-black text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded border border-indigo-100 uppercase tracking-widest">
            {positions.length} Live
          </span>
        </div>

        {positions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positions.map((pos) => {
              // Note: In real app, we'd fetch current price separately to calc PnL
              // For now we show entry and metadata
              return (
                <Card 
                  key={pos.ticker} 
                  className="p-5 bg-white border-slate-200 hover:border-indigo-500 transition-all cursor-pointer group"
                  onClick={() => onStockClick?.(pos)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">
                        {pos.ticker}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase">
                        <Clock className="w-3 h-3" />
                        Held {pos.days_held} Days
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-400 uppercase mb-1">Entry Price</div>
                      <div className="text-lg font-black text-slate-900 font-mono">${pos.entry_price.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                    <div>
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Trailing Stop (ATR)</div>
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3 text-rose-500" />
                        <span className="text-xs font-black text-slate-700 font-mono">
                           ${(pos.highest_high - (pos.initial_atr * 3.5)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Highest High</div>
                      <div className="text-xs font-black text-emerald-600 font-mono">${pos.highest_high.toFixed(2)}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 py-12 text-center">
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No Active Positions</p>
          </div>
        )}
      </section>

      {/* 2. Scanned Signals (Pending Entry) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
            Pending Entry Signals
          </h2>
          <span className="text-[10px] font-black text-amber-600 px-2 py-0.5 bg-amber-50 rounded border border-amber-100 uppercase tracking-widest">
            {pendingSignals.length} Scanned
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {pendingSignals.map((sig) => (
            <motion.div 
              key={sig.ticker}
              whileHover={{ scale: 1.02 }}
              className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden group cursor-pointer"
              onClick={() => onStockClick?.(sig)}
            >
              <div className="absolute top-0 right-0 p-2 opacity-10">
                <TrendingUp className="w-12 h-12 text-white" />
              </div>
              <div className="relative z-10">
                <span className="text-xl font-black text-white block uppercase mb-1 group-hover:text-amber-400 transition-colors">
                  {sig.ticker}
                </span>
                <div className="flex items-center gap-2">
                  <div className="px-1.5 py-0.5 bg-amber-500/20 rounded border border-amber-500/30">
                    <span className="text-[9px] font-black text-amber-400">DNA {sig.dna_score}</span>
                  </div>
                </div>
                <div className="mt-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                  Target: Open
                </div>
              </div>
            </motion.div>
          ))}
          {pendingSignals.length === 0 && (
            <div className="col-span-full py-8 text-center bg-slate-50 rounded-2xl border border-dotted border-slate-200">
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Awaiting Next Signal Scan</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
