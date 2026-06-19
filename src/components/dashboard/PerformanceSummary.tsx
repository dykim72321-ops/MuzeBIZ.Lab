import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Target, BarChart3, Fingerprint, Zap } from 'lucide-react';
import clsx from 'clsx';

interface PerformanceSummaryProps {
  stats: any;
}

const MetricCard = ({ label, value, colorClass, icon: Icon }: { label: string, value: string | number, colorClass: string, icon?: any }) => (
  <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl hover:bg-white hover:shadow-md transition-all group overflow-hidden relative">
    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
      {Icon && <Icon className="w-12 h-12 text-slate-400" />}
    </div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={clsx("text-2xl font-black font-mono tracking-tighter", colorClass)}>{value}</span>
      {label === "Win Rate" && <span className="text-[10px] text-slate-400 font-bold">%</span>}
    </div>
    <div className="mt-3 w-full h-1 bg-slate-200 rounded-full overflow-hidden">
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
      className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-center">
            <Award className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em]">
              Mission Briefing Summary
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Performance Metrics Synced</span>
            </div>
          </div>
        </div>
        <BarChart3 className="w-5 h-5 text-slate-400 hover:text-indigo-600 transition-colors cursor-help" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <MetricCard
          label="Win Rate"
          value={stats.win_rate != null ? stats.win_rate : '--'}
          colorClass="text-emerald-600"
          icon={TrendingUp}
        />
        <MetricCard
          label="Profit Factor"
          value={stats.profit_factor != null ? stats.profit_factor : '--'}
          colorClass="text-indigo-600"
          icon={Zap}
        />
        <MetricCard
          label="Avg Return"
          value={stats.avg_pnl != null ? `+${stats.avg_pnl}%` : '--'}
          colorClass="text-blue-600"
          icon={Target}
        />
        <MetricCard
          label="Max Drawdown"
          value={stats.mdd != null ? `${stats.mdd}%` : '--'}
          colorClass="text-rose-600"
          icon={Fingerprint}
        />
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-indigo-50 rounded-lg border border-indigo-200">
            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Squad: Alpha Prime</span>
          </div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Uptime: 142H</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active Node</span>
        </div>
      </div>
    </motion.section>
  );
};
