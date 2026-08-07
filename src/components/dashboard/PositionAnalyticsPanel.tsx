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
import { computePositionHealth, riskGroupOf, RISK_GROUP_BOX_STYLE } from '../../utils/positionHealth';

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
      const tone = computePositionHealth(pos.current_price, pos.highest_price, pos.ts_threshold ?? (pos.current_price ?? 0), pos.entry_price).tone;
      return {
        ticker: pos.ticker,
        weight: Math.round(weight * 100) / 100,
        isPenny: pos.isPenny,
        tone,
      };
    }).sort((a, b) => b.weight - a.weight);
  }, [positions, totalEquity]);

  // 포지션별 위험도 요약 — Active Positions와 동일 기준(computePositionHealth)으로 "한눈에" 파악용
  const riskSummary = useMemo(() => {
    return positions.reduce(
      (acc, pos) => {
        const tone = computePositionHealth(pos.current_price, pos.highest_price, pos.ts_threshold ?? (pos.current_price ?? 0), pos.entry_price).tone;
        acc[riskGroupOf(tone)] += 1;
        return acc;
      },
      { safe: 0, watch: 0, danger: 0 }
    );
  }, [positions]);

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

      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 overflow-x-auto">
        <span className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap", riskSummary.danger > 0 ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-slate-100 text-slate-400")}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> 위험 {riskSummary.danger}
        </span>
        <span className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap", riskSummary.watch > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-slate-100 text-slate-400")}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 주의 {riskSummary.watch}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 안전 {riskSummary.safe}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-6">
        {/* 상단: 도넛 차트 & 범례 */}
        <div className="flex flex-col items-center gap-6 w-full">
          {/* 차트 영역 */}
          <div className="w-full h-48 relative flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={weightData}
                  dataKey="weight"
                  nameKey="ticker"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={3}
                  stroke="none"
                >
                  {weightData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#0f172a', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0).toFixed(2)}%`, String(name)]}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
            {/* 차트 중앙 텍스트 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">Positions</span>
              <span className="text-xl font-black text-slate-800">{positions.length}</span>
            </div>
          </div>

          {/* 범례 (Legend) - 2열로 배치하여 티커와 비중 텍스트가 잘리지 않도록 함 */}
          <div className="w-full grid grid-cols-2 gap-x-2 gap-y-2">
            {weightData.map((entry, index) => {
              const boxStyle = RISK_GROUP_BOX_STYLE[riskGroupOf(entry.tone)];
              return (
                <div key={entry.ticker} className={clsx("flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg border transition-colors min-w-0", boxStyle)}>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div className="w-2 h-2 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[11px] font-black text-slate-800 truncate" title={entry.ticker}>
                      {entry.ticker}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 font-mono shrink-0 ml-1">
                    {entry.weight}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단: P&L Summary */}
        <div className="flex flex-col gap-3">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3.5 shadow-sm border border-emerald-100 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-16 h-16 bg-emerald-200/30 rounded-bl-full -mr-4 -mt-4" />
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-1 opacity-80 whitespace-nowrap">수익 포지션</span>
            <div className="flex items-baseline justify-between gap-1 flex-wrap">
              <span className="text-lg sm:text-xl font-black text-emerald-900 font-mono whitespace-nowrap">{pnlSummary.profitCount}개</span>
              <span className="text-xs sm:text-sm font-black text-emerald-600 font-mono whitespace-nowrap">+{pnlSummary.totalProfit.toFixed(2)}$</span>
            </div>
          </div>
          
          <div className={clsx(
            'rounded-xl p-3.5 shadow-sm border relative overflow-hidden',
            pnlSummary.lossCount > 0 ? 'bg-gradient-to-br from-rose-50 to-rose-100/50 border-rose-100' : 'bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-100'
          )}>
            <div className={clsx("absolute right-0 top-0 w-16 h-16 rounded-bl-full -mr-4 -mt-4", pnlSummary.lossCount > 0 ? "bg-rose-200/30" : "bg-slate-200/30")} />
            <span className={clsx('text-[10px] font-black uppercase tracking-widest block mb-1 opacity-80 whitespace-nowrap', pnlSummary.lossCount > 0 ? 'text-rose-700' : 'text-slate-600')}>
              손실 포지션
            </span>
            <div className="flex items-baseline justify-between gap-1 flex-wrap">
              <span className={clsx('text-lg sm:text-xl font-black font-mono whitespace-nowrap', pnlSummary.lossCount > 0 ? 'text-rose-900' : 'text-slate-800')}>{pnlSummary.lossCount}개</span>
              <span className={clsx('text-xs sm:text-sm font-black font-mono whitespace-nowrap', pnlSummary.lossCount > 0 ? 'text-rose-600' : 'text-slate-500')}>
                {pnlSummary.totalLoss !== 0 ? `${pnlSummary.totalLoss.toFixed(2)}$` : '0.00$'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
