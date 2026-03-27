import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Target, BarChart3 } from 'lucide-react';

interface PerformanceSummaryProps {
  stats: any;
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({ stats }) => {
  if (!stats) return null;

  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 rounded-3xl p-6 shadow-2xl border border-indigo-500/20 relative overflow-hidden group"
    >
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[50px] rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all duration-700" />
      
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
          <Award className="w-4 h-4 text-amber-400" />
          Mission Performance
        </h2>
        <BarChart3 className="w-4 h-4 text-slate-600" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Win Rate</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-white font-mono">{stats.win_rate || '---'}%</span>
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          </div>
        </div>
        
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Profit Factor</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-white font-mono">{stats.profit_factor || '---'}</span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Avg Return</span>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {stats.avg_return ? `+${stats.avg_return}%` : '---'}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Alpha Score</span>
          <div className="text-xl font-black text-indigo-400 font-mono">
            {stats.alpha_score || '---'}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-3 h-3 text-indigo-500" />
          <span className="text-[9px] font-black text-slate-500 uppercase">Strategy: Hybrid Momentum</span>
        </div>
        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          ACTIVE
        </span>
      </div>
    </motion.section>
  );
};
