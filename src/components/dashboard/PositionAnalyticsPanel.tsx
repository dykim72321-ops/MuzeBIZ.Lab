import { useMemo } from 'react';
import clsx from 'clsx';
import { PieChart } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Tooltip,
  Cell,
} from 'recharts';
import type { PaperPosition } from '../../types/dashboard';

interface PositionAnalyticsPanelProps {
  positions: PaperPosition[];
  totalEquity: number;
}
const COLORS = [
  '#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', 
  '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#0284c7', '#38bdf8', '#7dd3fc'
];

export const PositionAnalyticsPanel = ({ positions, totalEquity }: PositionAnalyticsPanelProps) => {
  const weightData = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return positions.map(pos => {
      const value = (pos.current_price != null ? Number(pos.current_price) : Number(pos.entry_price)) * Math.abs(Number(pos.units));
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
      <div className="sfdc-card p-6 flex flex-col items-center justify-center min-h-[200px] gap-3">
        <PieChart className="w-8 h-8 text-blue-300" />
        <p className="text-sm font-black text-blue-900">보유 포지션 없음</p>
        <p className="text-xs text-blue-800 text-center">포지션이 생기면 비중 분석이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="sfdc-card flex flex-col">
      <div className="sfdc-card-header">
        <h2 className="text-sm font-black text-black">Position Analytics</h2>
        <PieChart className="w-4 h-4 text-cyan-600" />
      </div>

      <div className="p-4 space-y-4">
        {/* Weight Bar Chart */}
        <div>
          <span className="text-[10px] font-black text-blue-950 uppercase tracking-widest block mb-2">포트폴리오 비중 (%)</span>
          <div className="h-44 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={weightData}
                  dataKey="weight"
                  nameKey="ticker"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  stroke="none"
                >
                  {weightData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '2px solid #bfdbfe', borderRadius: '4px', fontSize: '11px', color: '#000000', fontWeight: 'bold' }}
                  formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0).toFixed(2)}%`, String(name)]}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Scrollable Legend */}
          <div className="grid grid-cols-3 gap-x-2 gap-y-2 mt-4 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
            {weightData.map((entry, index) => (
              <div key={entry.ticker} className="flex items-center gap-1.5 overflow-hidden">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-[10px] font-bold text-blue-950 truncate" title={`${entry.ticker} (${entry.weight}%)`}>
                  {entry.ticker} <span className="text-blue-700">{entry.weight}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* P&L Summary */}
        <div className="pt-3 border-t-2 border-blue-100 grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-md p-3">
            <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest block mb-1">수익 포지션</span>
            <span className="text-base font-black text-emerald-800 font-mono block">{pnlSummary.profitCount}개</span>
            <span className="text-xs font-black text-emerald-700 font-mono">+${pnlSummary.totalProfit.toFixed(2)}</span>
          </div>
          <div className={clsx(
            'border-2 rounded-md p-3',
            pnlSummary.lossCount > 0 ? 'bg-rose-50 border-rose-300' : 'bg-blue-50 border-blue-200'
          )}>
            <span className={clsx('text-[9px] font-black uppercase tracking-widest block mb-1', pnlSummary.lossCount > 0 ? 'text-rose-800' : 'text-blue-950')}>
              손실 포지션
            </span>
            <span className={clsx('text-base font-black font-mono block', pnlSummary.lossCount > 0 ? 'text-rose-800' : 'text-blue-950')}>{pnlSummary.lossCount}개</span>
            <span className={clsx('text-xs font-black font-mono', pnlSummary.lossCount > 0 ? 'text-rose-700' : 'text-blue-900')}>
              {pnlSummary.totalLoss !== 0 ? `$${pnlSummary.totalLoss.toFixed(2)}` : '$0.00'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
