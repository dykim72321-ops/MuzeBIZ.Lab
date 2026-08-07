import { useMemo } from 'react';
import clsx from 'clsx';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PaperHistory, PortfolioHistoryPoint } from '../../types/dashboard';

interface RiskAnalyticsPanelProps {
  history: PaperHistory[];
  portfolioHistory?: PortfolioHistoryPoint[];
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

export const RiskAnalyticsPanel = ({ history, portfolioHistory }: RiskAnalyticsPanelProps) => {
  const metrics = useMemo(() => {
    if ((!history || history.length === 0) && (!portfolioHistory || portfolioHistory.length === 0)) return null;

    // 1. Largest Losing Trade (최대 단일 손실률)
    //    TS는 브로커 스탑이 아니라 1분봉 폴링 임계값이라 갭다운 시 명목 상한(-5%)을 초과 체결될 수 있다.
    //    이 지표가 그 방어선이 실제로 지켜졌는지를 보여주는 유일한 화면상 신호이므로 유지한다.
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
      largestLoss,
      cdd,
      mdd,
      avgWin: avgWin * 100,
      avgLoss: avgLoss * 100
    };
  }, [history, portfolioHistory]);

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
      // 값 문자열이 가장 길어 2칸 그리드에서 홀로 남는 자리를 전폭으로 채운다
      wide: true,
      ...getCardStyles(metrics ? (metrics.avgWin > Math.abs(metrics.avgLoss) ? 'good' : 'bad') : 'neutral'),
    },
  ];

  return (
    <div className="sfdc-card flex flex-col">
      <div className="sfdc-card-header">
        <h2 className="text-sm font-black text-black">Risk Analytics</h2>
        <ShieldCheck className="w-4 h-4 text-blue-700" />
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        {cards.map(card => (
          <div key={card.label} className={clsx("relative rounded-md overflow-hidden border", card.borderColor, 'wide' in card && card.wide && "col-span-2")}>
            {/* 1. 배경 애니메이션 레이어 (투명도 조절로 깜빡임 구현, 글씨에는 영향 없음) */}
            <div className={clsx("absolute inset-0", card.bgAnimClass)}></div>
            
            {/* 2. 글씨 레이어 (z-index 10으로 위로 올림) */}
            <div className="relative z-10 p-2.5">
              <span className="text-[9px] font-black text-slate-800 uppercase tracking-widest block mb-0.5">{card.label}</span>
              <div className="flex items-end justify-between mt-1">
                <span className="text-[10px] font-bold text-slate-500 leading-none">{card.koLabel}</span>
                <span className={clsx('text-sm font-black font-mono leading-none', card.color)}>{card.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
