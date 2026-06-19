import { useMemo } from 'react';
import clsx from 'clsx';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface RiskAnalyticsPanelProps {
  history: any[];
  strategyStats: any;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export const RiskAnalyticsPanel = ({ history }: RiskAnalyticsPanelProps) => {
  const metrics = useMemo(() => {
    if (!history || history.length === 0) return null;

    const returns = history.map(h => Number(h.pnl_pct || 0) / 100);
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const std = stddev(returns);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95 = percentile(sortedReturns, 5) * 100;

    const posReturns = returns.filter(r => r > 0);
    const negReturns = returns.filter(r => r < 0);
    const avgWin = posReturns.length > 0 ? posReturns.reduce((s, v) => s + v, 0) / posReturns.length : 0;
    const avgLoss = negReturns.length > 0 ? negReturns.reduce((s, v) => s + v, 0) / negReturns.length : 0;
    const winLossRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : (avgWin > 0 ? 99 : 0);

    // Max drawdown from equity curve
    const sorted = [...history].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    );
    let equity = 10000;
    let peak = equity;
    let maxDD = 0;
    for (const item of sorted) {
      equity += Number(item.profit_amt ?? 0);
      if (equity > peak) peak = equity;
      const dd = (equity - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
    const mdd = Math.abs(maxDD) * 100;

    const totalReturn = (returns.reduce((s, v) => s + v, 0)) * 100;
    const calmar = mdd > 0 ? totalReturn / mdd : 0;

    return { sharpe, var95, winLossRatio, mdd, calmar, avgWin: avgWin * 100, avgLoss: avgLoss * 100 };
  }, [history]);

  if (!history || history.length === 0) {
    return (
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-[200px] gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm font-extrabold text-slate-600">청산 이력 필요</p>
        <p className="text-xs text-slate-500 text-center">리스크 지표는 청산 이력이 있을 때 표시됩니다.</p>
      </div>
    );
  }

  const cards = [
    {
      label: 'Sharpe Ratio',
      value: metrics?.sharpe.toFixed(2) ?? '—',
      sub: metrics ? (metrics.sharpe > 1 ? '우수' : metrics.sharpe > 0 ? '보통' : '부정적') : '',
      color: metrics ? (metrics.sharpe > 1 ? 'text-emerald-600' : metrics.sharpe > 0 ? 'text-amber-500' : 'text-rose-600') : 'text-slate-600',
      border: metrics ? (metrics.sharpe > 1 ? 'border-emerald-200' : metrics.sharpe > 0 ? 'border-amber-200' : 'border-rose-200') : 'border-slate-200',
    },
    {
      label: 'VaR 95%',
      value: metrics ? `${metrics.var95.toFixed(2)}%` : '—',
      sub: '손실 상한 (95% 신뢰)',
      color: 'text-rose-600',
      border: 'border-rose-200',
    },
    {
      label: 'Win/Loss Ratio',
      value: metrics?.winLossRatio.toFixed(2) ?? '—',
      sub: metrics ? (metrics.winLossRatio > 1 ? '수익>손실' : '손실>수익') : '',
      color: metrics ? (metrics.winLossRatio > 1 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-600',
      border: metrics ? (metrics.winLossRatio > 1 ? 'border-emerald-200' : 'border-rose-200') : 'border-slate-200',
    },
    {
      label: 'Max Drawdown',
      value: metrics ? `${metrics.mdd.toFixed(2)}%` : '—',
      sub: '최대 낙폭',
      color: 'text-rose-600',
      border: 'border-rose-200',
    },
    {
      label: 'Calmar Ratio',
      value: metrics?.calmar.toFixed(2) ?? '—',
      sub: '수익 / MDD',
      color: metrics ? (metrics.calmar > 1 ? 'text-emerald-600' : 'text-amber-500') : 'text-slate-600',
      border: metrics ? (metrics.calmar > 1 ? 'border-emerald-200' : 'border-amber-200') : 'border-slate-200',
    },
    {
      label: 'Avg Win / Loss',
      value: metrics ? `${metrics.avgWin.toFixed(1)}% / ${metrics.avgLoss.toFixed(1)}%` : '—',
      sub: '평균 익절 / 평균 손절',
      color: 'text-slate-700',
      border: 'border-slate-200',
    },
  ];

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-widest block mb-0.5">Risk Analytics</span>
          <h2 className="text-[15px] font-extrabold text-slate-900">리스크 지표 분석</h2>
        </div>
        <ShieldCheck className="w-5 h-5 text-indigo-500 drop-shadow-[0_0_8px_rgba(79,70,229,0.4)]" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map(card => (
          <div key={card.label} className={clsx('border rounded-xl p-3', card.border)}>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{card.label}</span>
            <span className={clsx('text-base font-black font-mono block', card.color)}>{card.value}</span>
            {card.sub && <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">{card.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
