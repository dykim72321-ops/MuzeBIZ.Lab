import { motion } from 'framer-motion';
import clsx from 'clsx';

interface TensionGaugeProps {
  score: number;
}

export function TensionGauge({ score }: TensionGaugeProps) {
  const normalized = Math.max(0, Math.min(100, ((score - 70) / 30) * 100));
  const isHot = normalized >= 66;

  let gradient = 'from-blue-500 to-cyan-400';
  let glow = 'rgba(6,182,212,0.4)';

  if (isHot) {
    gradient = 'from-rose-500 to-rose-400';
    glow = 'rgba(244,63,94,0.6)';
  } else if (normalized >= 33) {
    gradient = 'from-amber-500 to-amber-400';
    glow = 'rgba(245,158,11,0.4)';
  }

  return (
    <div className="w-full h-1 bg-slate-200/60 rounded-full relative">
      <motion.div
        initial={{ width: 0 }}
        animate={{ 
          width: `${normalized}%`,
          boxShadow: isHot 
            ? [`0px 0px 4px ${glow}`, `0px 0px 14px ${glow}`, `0px 0px 4px ${glow}`]
            : `0px 0px 6px ${glow}`
        }}
        transition={{ 
          width: { duration: 1, ease: 'easeOut' },
          boxShadow: isHot ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : { duration: 1 }
        }}
        className={clsx("absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r", gradient)}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-slate-100" />
      </motion.div>
    </div>
  );
}
