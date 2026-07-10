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

function getCardStyles(status: 'good' | 'bad' | 'neutral') {
  if (status === 'good') return {
    borderColor: 'border-emerald-200',
    bgAnimClass: 'bg-emerald-100/60 animate-[pulse_3s_ease-in-out_infinite]'
  };
  if (status === 'bad') return {
    borderColor: 'border-rose-200',
    bgAnimClass: 'bg-rose-100/60 animate-[pulse_3s_ease-in-out_infinite]'
  };
  return {
    borderColor: 'border-slate-200',
    bgAnimClass: 'bg-slate-50/80'
  };
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
      koLabel: '위험 대비 수익성',
      value: metrics?.sharpe.toFixed(2) ?? '—',
      color: metrics ? (metrics.sharpe > 1 ? 'text-emerald-700' : metrics.sharpe > 0 ? 'text-slate-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.sharpe > 1 ? 'good' : metrics.sharpe > 0 ? 'neutral' : 'bad') : 'neutral'),
    },
    {
      label: 'VaR 95%',
      koLabel: '최대 예상 손실',
      value: metrics ? `${metrics.var95.toFixed(2)}%` : '—',
      color: metrics ? (metrics.var95 > -5 ? 'text-emerald-700' : metrics.var95 <= -10 ? 'text-rose-700' : 'text-slate-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.var95 > -5 ? 'good' : metrics.var95 <= -10 ? 'bad' : 'neutral') : 'neutral'),
    },
    {
      label: 'Win/Loss Ratio',
      koLabel: '손익비',
      value: metrics?.winLossRatio.toFixed(2) ?? '—',
      color: metrics ? (metrics.winLossRatio > 1.2 ? 'text-emerald-700' : metrics.winLossRatio > 0.8 ? 'text-slate-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.winLossRatio > 1.2 ? 'good' : metrics.winLossRatio > 0.8 ? 'neutral' : 'bad') : 'neutral'),
    },
    {
      label: 'Max Drawdown',
      koLabel: '최대 낙폭',
      value: metrics ? `${metrics.mdd.toFixed(2)}%` : '—',
      color: metrics ? (metrics.mdd < 5 ? 'text-emerald-700' : metrics.mdd > 15 ? 'text-rose-700' : 'text-slate-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.mdd < 5 ? 'good' : metrics.mdd > 15 ? 'bad' : 'neutral') : 'neutral'),
    },
    {
      label: 'Calmar Ratio',
      koLabel: '회복 탄력성',
      value: metrics?.calmar.toFixed(2) ?? '—',
      color: metrics ? (metrics.calmar > 1 ? 'text-emerald-700' : metrics.calmar > 0 ? 'text-slate-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.calmar > 1 ? 'good' : metrics.calmar > 0 ? 'neutral' : 'bad') : 'neutral'),
    },
    {
      label: 'Avg Win / Loss',
      koLabel: '평균 수익/손실률',
      value: metrics ? `${metrics.avgWin.toFixed(1)}% / ${metrics.avgLoss.toFixed(1)}%` : '—',
      color: metrics ? (metrics.avgWin > Math.abs(metrics.avgLoss) ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.avgWin > Math.abs(metrics.avgLoss) ? 'good' : 'bad') : 'neutral'),
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
          <div key={card.label} className={clsx("relative rounded-md overflow-hidden border", card.borderColor)}>
            {/* 1. 배경 애니메이션 레이어 (투명도 조절로 깜빡임 구현, 글씨에는 영향 없음) */}
            <div className={clsx("absolute inset-0", card.bgAnimClass)}></div>
            
            {/* 2. 글씨 레이어 (z-index 10으로 위로 올림) */}
            <div className="relative z-10 p-3">
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest block">{card.label}</span>
              <span className="text-[11px] font-bold text-slate-500 block mb-1.5">{card.koLabel}</span>
              <span className={clsx('text-lg font-black font-mono block', card.color)}>{card.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
