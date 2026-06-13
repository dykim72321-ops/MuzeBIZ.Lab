import { motion } from 'framer-motion';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Activity, Star } from 'lucide-react';
import { PennyQuantScoreBar } from './PennyQuantScoreBar';
import type { PennyScanResult } from '../../services/pennyService';

interface PennyStockCardProps {
  stock: PennyScanResult;
  onAddToWatchlist?: (ticker: string) => void;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export const PennyStockCard = ({ stock, onAddToWatchlist }: PennyStockCardProps) => {
  const isPositive = stock.change_pct >= 0;
  const isStrong = stock.strength === 'STRONG';
  const isBuy = stock.signal === 'BUY';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (stock.rank - 1) * 0.05 }}
      className={clsx(
        "relative bg-[#0b101a]/60 backdrop-blur-md border rounded-2xl p-5 transition-all duration-300 group hover:bg-[#0b101a]/80",
        stock.is_top
          ? "border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.08)]"
          : "border-slate-800/60 hover:border-slate-700/60"
      )}
    >
      {/* Top badge */}
      {stock.is_top && stock.rank <= 3 && (
        <div className="absolute -top-2.5 -right-2.5 w-8 h-8 bg-[#020617] border border-cyan-500/40 rounded-xl flex items-center justify-center text-sm shadow-[0_0_15px_rgba(34,211,238,0.3)]">
          {RANK_MEDALS[stock.rank - 1]}
        </div>
      )}

      {/* Row 1: Ticker + Price + Change */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm border",
            isBuy
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : stock.signal === 'SELL'
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-slate-800/60 border-slate-700/40 text-slate-400"
          )}>
            {stock.ticker.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-white tracking-tight">{stock.ticker}</span>
              {isStrong && (
                <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest animate-pulse">
                  STRONG
                </span>
              )}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 flex items-center gap-2">
              <span>Rank #{stock.rank}</span>
              {stock.is_watchlisted && (
                <span className="text-cyan-400 flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-cyan-400" /> Watchlisted
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-black text-white tabular-nums">${stock.price.toFixed(4)}</div>
          <div className={clsx(
            "text-xs font-black tabular-nums flex items-center justify-end gap-1",
            isPositive ? "text-emerald-400" : "text-rose-400"
          )}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Row 2: DNA Score Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">DNA Score</span>
          <span className={clsx(
            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
            stock.signal === 'BUY' ? "bg-emerald-500/10 text-emerald-400" :
            stock.signal === 'SELL' ? "bg-rose-500/10 text-rose-400" :
            "bg-slate-800 text-slate-400"
          )}>
            {stock.signal}
          </span>
        </div>
        <PennyQuantScoreBar score={stock.dna_score} size="md" />
      </div>

      {/* Row 3: Indicator Grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'RSI', value: stock.rsi.toFixed(1), ok: stock.rsi < 50 },
          { label: 'MACD', value: stock.macd_diff > 0 ? '+' + stock.macd_diff.toFixed(3) : stock.macd_diff.toFixed(3), ok: stock.macd_diff > 0 },
          { label: 'ADX', value: stock.adx.toFixed(1), ok: stock.adx > 20 },
          { label: 'RVOL', value: stock.rvol.toFixed(1) + 'x', ok: stock.rvol >= 3.0 },
        ].map((ind) => (
          <div key={ind.label} className="bg-[#020617]/60 rounded-lg p-2 border border-slate-800/40 text-center">
            <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">{ind.label}</div>
            <div className={clsx("text-[11px] font-black tabular-nums", ind.ok ? "text-emerald-400" : "text-slate-400")}>
              {ind.value}
            </div>
            <div className={clsx("w-1 h-1 rounded-full mx-auto mt-1", ind.ok ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-slate-700")} />
          </div>
        ))}
      </div>

      {/* Row 4: Volume + Action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <Activity className="w-3 h-3" />
          <span className="font-bold tabular-nums">{stock.volume.toLocaleString()} vol</span>
        </div>

        {onAddToWatchlist && !stock.is_watchlisted && (
          <button
            onClick={() => onAddToWatchlist(stock.ticker)}
            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[9px] font-black rounded-lg border border-cyan-500/20 transition-all uppercase tracking-widest"
          >
            + Watch
          </button>
        )}
      </div>
    </motion.div>
  );
};
