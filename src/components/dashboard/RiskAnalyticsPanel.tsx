import { useMemo } from 'react';
import clsx from 'clsx';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PaperHistory, PortfolioHistoryPoint } from '../../types/dashboard';

interface RiskAnalyticsPanelProps {
  history: PaperHistory[];
  portfolioHistory?: PortfolioHistoryPoint[];
  totalEquity: number;
  availableCash: number;
}

function getCardStyles(status: 'good' | 'bad' | 'neutral' | 'critical') {
  if (status === 'good') return {
    borderColor: 'border-emerald-200',
    bgAnimClass: 'bg-emerald-100/60 animate-[pulse_3s_ease-in-out_infinite]'
  };
  if (status === 'bad') return {
    borderColor: 'border-amber-300',
    bgAnimClass: 'bg-amber-100/60 animate-[pulse_2s_ease-in-out_infinite]'
  };
  if (status === 'critical') return {
    borderColor: 'border-rose-400',
    bgAnimClass: 'bg-rose-200/80 animate-[pulse_1s_ease-in-out_infinite]'
  };
  return {
    borderColor: 'border-slate-200',
    bgAnimClass: 'bg-slate-50/80'
  };
}

export const RiskAnalyticsPanel = ({ history, portfolioHistory, totalEquity, availableCash }: RiskAnalyticsPanelProps) => {
  const metrics = useMemo(() => {
    if ((!history || history.length === 0) && (!portfolioHistory || portfolioHistory.length === 0)) return null;

    // 1. Current Exposure (자본 노출도)
    const exposurePct = totalEquity > 0 ? ((totalEquity - availableCash) / totalEquity) * 100 : 0;

    // 2. Consecutive Losses (현재 연속 손실 횟수)
    // History is usually chronological or reverse-chronological. Let's sort to be sure (newest first).
    const sortedDesc = [...history].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    let consecutiveLosses = 0;
    for (const trade of sortedDesc) {
      if (Number(trade.profit_amt) < 0) {
        consecutiveLosses++;
      } else if (Number(trade.profit_amt) > 0) {
        break; // Stop at first win
      }
    }

    // 3. Recent 10 Hit Rate (최근 10회 승률)
    const recentTrades = sortedDesc.slice(0, 10);
    const recentWins = recentTrades.filter(t => Number(t.profit_amt) > 0).length;
    const recentHitRate = recentTrades.length > 0 ? (recentWins / recentTrades.length) * 100 : 0;

    // 4. Largest Losing Trade (최대 단일 손실률)
    const pnlPcts = history.map(h => Number(h.pnl_pct || 0));
    const largestLoss = pnlPcts.length > 0 ? Math.min(...pnlPcts, 0) : 0; // Negative number

    // 5. Avg Win / Avg Loss
    const tradeReturns = history.map(h => Number(h.pnl_pct || 0) / 100);
    const posReturns = tradeReturns.filter(r => r > 0);
    const negReturns = tradeReturns.filter(r => r < 0);
    const avgWin = posReturns.length > 0 ? posReturns.reduce((s, v) => s + v, 0) / posReturns.length : 0;
    const avgLoss = negReturns.length > 0 ? negReturns.reduce((s, v) => s + v, 0) / negReturns.length : 0;

    // 6. Current Drawdown & Max Drawdown
    let mdd = 0;
    let cdd = 0;
    if (portfolioHistory && portfolioHistory.length > 0) {
      let peak = portfolioHistory[0].equity;
      let maxDD = 0;
      for (const item of portfolioHistory) {
        if (item.equity > peak) peak = item.equity;
        const dd = peak > 0 ? (item.equity - peak) / peak : 0;
        if (dd < maxDD) maxDD = dd;
      }
      mdd = Math.abs(maxDD) * 100;
      
      const currentEquity = portfolioHistory[portfolioHistory.length - 1].equity;
      cdd = peak > 0 ? Math.abs((currentEquity - peak) / peak) * 100 : 0;
    } else {
      const sortedAsc = [...history].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
      let equity = 100000;
      let peak = equity;
      let maxDD = 0;
      for (const item of sortedAsc) {
        equity += Number(item.profit_amt ?? 0);
        if (equity > peak) peak = equity;
        const dd = (equity - peak) / peak;
        if (dd < maxDD) maxDD = dd;
      }
      mdd = Math.abs(maxDD) * 100;
      cdd = peak > 0 ? Math.abs((equity - peak) / peak) * 100 : 0;
    }

    return { 
      exposurePct, 
      consecutiveLosses, 
      recentHitRate, 
      largestLoss, 
      cdd,
      mdd,
      avgWin: avgWin * 100, 
      avgLoss: avgLoss * 100 
    };
  }, [history, portfolioHistory, totalEquity, availableCash]);

  if (!metrics) {
    return (
      <div className="sfdc-card p-6 flex flex-col items-center justify-center min-h-[200px] gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-black text-blue-900">데이터 부족</p>
        <p className="text-xs text-blue-800 text-center">실시간 리스크를 계산하기 위한 이력이 부족합니다.</p>
      </div>
    );
  }

  const cards = [
    {
      label: 'Current Drawdown',
      koLabel: '현재 낙폭',
      value: metrics ? `${metrics.cdd.toFixed(2)}%` : '—',
      color: metrics ? (metrics.cdd < 2 ? 'text-emerald-700' : metrics.cdd > 5 ? 'text-rose-700' : 'text-slate-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.cdd < 2 ? 'good' : metrics.cdd > 8 ? 'critical' : metrics.cdd > 4 ? 'bad' : 'neutral') : 'neutral'),
    },
    {
      label: 'Current Exposure',
      koLabel: '시장 노출도',
      value: metrics ? `${metrics.exposurePct.toFixed(1)}%` : '—',
      color: metrics ? (metrics.exposurePct < 80 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.exposurePct < 70 ? 'neutral' : metrics.exposurePct > 90 ? 'critical' : 'bad') : 'neutral'),
    },
    {
      label: 'Consecutive Loss',
      koLabel: '현재 연속 손실',
      value: metrics ? `${metrics.consecutiveLosses}연패` : '—',
      color: metrics ? (metrics.consecutiveLosses === 0 ? 'text-emerald-700' : metrics.consecutiveLosses >= 3 ? 'text-rose-700' : 'text-slate-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.consecutiveLosses === 0 ? 'good' : metrics.consecutiveLosses >= 4 ? 'critical' : metrics.consecutiveLosses >= 2 ? 'bad' : 'neutral') : 'neutral'),
    },
    {
      label: 'Recent Hit Rate',
      koLabel: '최근 10회 승률',
      value: metrics ? `${metrics.recentHitRate.toFixed(0)}%` : '—',
      color: metrics ? (metrics.recentHitRate >= 50 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.recentHitRate >= 50 ? 'good' : metrics.recentHitRate < 30 ? 'critical' : 'bad') : 'neutral'),
    },
    {
      label: 'Largest Loss',
      koLabel: '최대 단일 손실',
      value: metrics ? `${metrics.largestLoss.toFixed(2)}%` : '—',
      color: metrics ? (metrics.largestLoss > -5 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900',
      ...getCardStyles(metrics ? (metrics.largestLoss > -5 ? 'neutral' : metrics.largestLoss < -10 ? 'critical' : 'bad') : 'neutral'),
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
