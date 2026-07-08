import { useMemo } from 'react';
import clsx from 'clsx';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PaperHistory } from '../../types/dashboard';

interface RiskAnalyticsPanelProps {
  history: PaperHistory[];
  strategyStats: unknown;
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
      <div className="sfdc-card p-6 flex flex-col items-center justify-center min-h-[200px] gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-black text-blue-900">청산 이력 필요</p>
        <p className="text-xs text-blue-800 text-center">리스크 지표는 청산 이력이 있을 때 표시됩니다.</p>
      </div>
    );
  }

  const cards = [
    {
      label: 'Sharpe Ratio',
      value: metrics?.sharpe.toFixed(2) ?? '—',
      sub: metrics ? (metrics.sharpe > 1 ? '우수' : metrics.sharpe > 0 ? '보통' : '부정적') : '',
      color: metrics ? (metrics.sharpe > 1 ? 'text-emerald-700' : metrics.sharpe > 0 ? 'text-amber-600' : 'text-rose-700') : 'text-blue-900',
    },
    {
      label: 'VaR 95%',
      value: metrics ? `${metrics.var95.toFixed(2)}%` : '—',
      sub: '손실 상한 (95% 신뢰)',
      color: 'text-rose-700',
    },
    {
      label: 'Win/Loss Ratio',
      value: metrics?.winLossRatio.toFixed(2) ?? '—',
      sub: metrics ? (metrics.winLossRatio > 1 ? '수익>손실' : '손실>수익') : '',
      color: metrics ? (metrics.winLossRatio > 1 ? 'text-emerald-700' : 'text-rose-700') : 'text-blue-900',
    },
    {
      label: 'Max Drawdown',
      value: metrics ? `${metrics.mdd.toFixed(2)}%` : '—',
      sub: '최대 낙폭',
      color: 'text-rose-700',
    },
    {
      label: 'Calmar Ratio',
      value: metrics?.calmar.toFixed(2) ?? '—',
      sub: '수익 / MDD',
      color: metrics ? (metrics.calmar > 1 ? 'text-emerald-700' : 'text-amber-600') : 'text-blue-900',
    },
    {
      label: 'Avg Win / Loss',
      value: metrics ? `${metrics.avgWin.toFixed(1)}% / ${metrics.avgLoss.toFixed(1)}%` : '—',
      sub: '평균 익절 / 평균 손절',
      color: 'text-black',
    },
  ];

  return (
    <div className="sfdc-card flex flex-col">
      <div className="sfdc-card-header">
        <h2 className="text-sm font-black text-black">Risk Analytics</h2>
        <ShieldCheck className="w-4 h-4 text-blue-700" />
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-blue-50 border-2 border-blue-100 rounded-md p-3">
            <span className="text-[9px] font-black text-blue-950 uppercase tracking-widest block mb-1">{card.label}</span>
            <span className={clsx('text-base font-black font-mono block', card.color)}>{card.value}</span>
            {card.sub && <span className="text-[10px] font-black text-blue-800 block mt-0.5">{card.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
