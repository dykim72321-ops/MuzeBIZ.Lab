import { useMemo } from 'react';
import clsx from 'clsx';
import { PieChart } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

interface PositionAnalyticsPanelProps {
  positions: any[];
  totalEquity: number;
}

export const PositionAnalyticsPanel = ({ positions, totalEquity }: PositionAnalyticsPanelProps) => {
  const weightData = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return positions.map(pos => {
      const value = (pos.current_price != null ? Number(pos.current_price) : Number(pos.entry_price)) * Number(pos.units);
      const weight = totalEquity > 0 ? (value / totalEquity) * 100 : 0;
      return {
        ticker: pos.ticker,
        weight: Math.round(weight * 100) / 100,
        isPenny: pos.isPenny,
      };
    }).sort((a, b) => b.weight - a.weight);
  }, [positions, totalEquity]);

  const pnlSummary = useMemo(() => {
    const profitPositions = positions.filter(p => (p.unrealized_pl ?? 0) >= 0);
    const lossPositions = positions.filter(p => (p.unrealized_pl ?? 0) < 0);
    const totalProfit = profitPositions.reduce((s, p) => s + (p.unrealized_pl ?? 0), 0);
    const totalLoss = lossPositions.reduce((s, p) => s + (p.unrealized_pl ?? 0), 0);
    return { profitCount: profitPositions.length, lossCount: lossPositions.length, totalProfit, totalLoss };
  }, [positions]);

  if (!positions || positions.length === 0) {
    return (
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-[200px] gap-3">
        <PieChart className="w-8 h-8 text-slate-300" />
        <p className="text-sm font-extrabold text-slate-600">보유 포지션 없음</p>
        <p className="text-xs text-slate-500 text-center">포지션이 생기면 비중 분석이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-widest block mb-0.5">Position Analytics</span>
          <h2 className="text-[15px] font-extrabold text-slate-900">포지션 비중 분석</h2>
        </div>
        <PieChart className="w-5 h-5 text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
      </div>

      {/* Weight Bar Chart */}
      <div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">포트폴리오 비중 (%)</span>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weightData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="ticker" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' }}
                formatter={(v: any) => [`${Number(v).toFixed(2)}%`, '비중']}
              />
              <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
                {weightData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isPenny ? '#06b6d4' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-cyan-500" />
            <span className="text-[10px] font-semibold text-slate-500">페니주식</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-indigo-500" />
            <span className="text-[10px] font-semibold text-slate-500">일반주식</span>
          </div>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest block mb-1">수익 포지션</span>
          <span className="text-base font-black text-emerald-700 font-mono block">{pnlSummary.profitCount}개</span>
          <span className="text-xs font-bold text-emerald-600 font-mono">+${pnlSummary.totalProfit.toFixed(2)}</span>
        </div>
        <div className={clsx(
          'border rounded-xl p-3',
          pnlSummary.lossCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
        )}>
          <span className={clsx('text-[9px] font-bold uppercase tracking-widest block mb-1', pnlSummary.lossCount > 0 ? 'text-rose-600' : 'text-slate-500')}>
            손실 포지션
          </span>
          <span className={clsx('text-base font-black font-mono block', pnlSummary.lossCount > 0 ? 'text-rose-700' : 'text-slate-500')}>{pnlSummary.lossCount}개</span>
          <span className={clsx('text-xs font-bold font-mono', pnlSummary.lossCount > 0 ? 'text-rose-600' : 'text-slate-400')}>
            {pnlSummary.totalLoss !== 0 ? `$${pnlSummary.totalLoss.toFixed(2)}` : '$0.00'}
          </span>
        </div>
      </div>
    </div>
  );
};
