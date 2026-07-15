import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PositionHealthBarProps {
  currentPrice: number | null;
  highestPrice: number;
  tsThreshold: number;
}

export function PositionHealthBar({ currentPrice, highestPrice, tsThreshold }: PositionHealthBarProps) {
  if (currentPrice === null) return null;

  const range = highestPrice - tsThreshold;
  const safeRange = range > 0 ? range : 0.0001; 
  const healthPct = Math.max(0, Math.min(100, ((currentPrice - tsThreshold) / safeRange) * 100));

  const isDanger = healthPct <= 30;

  // Premium colors
  let gradient = 'from-emerald-400 to-emerald-300';
  let glow = 'rgba(16,185,129,0.4)';
  
  if (isDanger) {
    gradient = 'from-rose-500 to-rose-400';
    glow = 'rgba(244,63,94,0.6)';
  } else if (healthPct <= 60) {
    gradient = 'from-amber-400 to-amber-300';
    glow = 'rgba(251,191,36,0.4)';
  }

  return (
    <div className="w-full flex flex-col gap-1.5 mt-1" title={`Health: ${healthPct.toFixed(1)}%`}>
      <div className="flex justify-between items-center text-[10px] font-mono font-black px-0.5">
        <span className={clsx("uppercase tracking-widest transition-colors duration-500", isDanger ? "text-rose-600" : "text-slate-500")}>
          {isDanger ? 'DANGER' : 'HEALTH'}
        </span>
        <span className={clsx("transition-colors duration-500", isDanger ? "text-rose-600" : "text-slate-700")}>
          {healthPct.toFixed(0)}%
        </span>
      </div>
      <div className="w-full h-1 bg-slate-200/60 rounded-full relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ 
            width: `${healthPct}%`,
            boxShadow: isDanger 
              ? [`0px 0px 4px ${glow}`, `0px 0px 14px ${glow}`, `0px 0px 4px ${glow}`]
              : `0px 0px 6px ${glow}`
          }}
          transition={{ 
            width: { duration: 0.8, ease: 'easeOut' },
            boxShadow: isDanger ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : { duration: 0.8 }
          }}
          className={clsx("absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r", gradient)}
        >
          {/* Indicator Dot */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-slate-100" />
        </motion.div>
      </div>
    </div>
  );
}
