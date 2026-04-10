import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Target, BarChart3, Fingerprint, Zap } from 'lucide-react';
import clsx from 'clsx';

interface PerformanceSummaryProps {
  stats: any;
}

const MetricCard = ({ label, value, colorClass, icon: Icon }: { label: string, value: string | number, colorClass: string, icon?: any }) => (
  <div className="bg-[#020617]/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-3xl hover:bg-[#020617]/60 transition-all group overflow-hidden relative">
    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
      {Icon && <Icon className="w-12 h-12 text-white" />}
    </div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={clsx("text-2xl font-black font-mono tracking-tighter drop-shadow-sm", colorClass)}>{value}</span>
      {label === "Win Rate" && <span className="text-[10px] text-slate-600 font-bold">%</span>}
    </div>
    <div className="mt-3 w-full h-1 bg-slate-800/50 rounded-full overflow-hidden">
        <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: typeof value === 'number' ? `${value}%` : '65%' }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={clsx("h-full", colorClass.replace('text-', 'bg-'))} 
        />
    </div>
  </div>
);

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({ stats }) => {
  if (!stats) return null;

  return (
    <motion.section 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#020617]/90 backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-[0_0_80px_rgba(79,70,229,0.05)] border border-slate-800/50 relative overflow-hidden group"
    >
      {/* HUD Background Elements */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="absolute top-0 left-0 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl border border-amber-500/20 flex items-center justify-center shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]">
             <Award className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-[0.3em] flex items-center gap-2">
              Mission Briefing Summary
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Performance Metrics Synced</span>
            </div>
          </div>
        </div>
        <BarChart3 className="w-5 h-5 text-slate-700 hover:text-indigo-400 transition-colors cursor-help" />
      </div>

      <div className="grid grid-cols-2 gap-5 relative z-10">
        <MetricCard
            label="Win Rate"
            value={stats.win_rate != null ? stats.win_rate : '--'}
            colorClass="text-emerald-400"
            icon={TrendingUp}
        />
        <MetricCard
            label="Profit Factor"
            value={stats.profit_factor != null ? stats.profit_factor : '--'}
            colorClass="text-indigo-400"
            icon={Zap}
        />
        <MetricCard
            label="Avg Return"
            value={stats.avg_pnl != null ? `+${stats.avg_pnl}%` : '--'}
            colorClass="text-cyan-400"
            icon={Target}
        />
        <MetricCard
            label="Max Drawdown"
            value={stats.mdd != null ? `${stats.mdd}%` : '--'}
            colorClass="text-rose-400"
            icon={Fingerprint}
        />
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Squad: Alpha Prime</span>
          </div>
          <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Uptime: 142H</span>
        </div>
        <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                Active Node
            </span>
        </div>
      </div>
    </motion.section>
  );
};
