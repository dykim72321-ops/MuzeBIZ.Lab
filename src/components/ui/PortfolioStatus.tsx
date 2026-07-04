import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Activity, XCircle, AlertTriangle, History, DollarSign, CheckCircle2, Layers, BarChart3, Wallet, PieChart } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPaperAccount,
  fetchPaperPositions,
  fetchPaperHistory,
  sellPaperPosition,
} from '../../services/pythonApiService';

interface PaperPosition {
  id: string;
  ticker: string;
  status: string;
  entry_price: number;
  current_price: number;
  highest_price: number;
  ts_threshold: number;
  units: number;
  is_scaled_out: boolean;
  weight: number;
}

interface PaperTrade {
  id: string;
  ticker: string;
  type: string;
  filled_avg_price: number;
  pnl_pct: number;
  profit_amt: number;
  created_at: string;
}

interface PaperAccount {
  cash_available: number;
  total_assets: number;
  invested_capital?: number;
}

export const PortfolioStatus = () => {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [history, setHistory] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellingTicker, setSellingTicker] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, pos, hist] = await Promise.all([
        fetchPaperAccount(),
        fetchPaperPositions(),
        fetchPaperHistory(),
      ]);
      if (acc) setAccount(acc);
      setPositions(Array.isArray(pos) ? (pos as any[]) : []);
      setHistory(Array.isArray(hist) ? (hist as any[]) : []);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 30000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const handleSell = (pos: PaperPosition) => {
    const pnlPct = pos.current_price && pos.entry_price
      ? ((pos.current_price / pos.entry_price) - 1) * 100
      : 0;
    const isProfit = pnlPct >= 0;

    toast(`매도 확인 — ${pos.ticker}`, {
      description: `현재가: $${pos.current_price?.toFixed(2) ?? '-'} | 예상 손익: ${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%`,
      action: { label: '매도 실행', onClick: () => executeSell(pos.ticker) },
      cancel: { label: '취소', onClick: () => {} },
      icon: isProfit ? '🚀' : '⚠️',
    });
  };

  const executeSell = async (ticker: string) => {
    setSellingTicker(ticker);
    const toastId = toast.loading(`[${ticker}] 매도 처리 중...`);
    try {
      const result = await sellPaperPosition(ticker);
      toast.success(`[${ticker}] 매도 완료`, {
        description: `청산가: $${result.exit_price} | 수익률: ${result.pnl_pct > 0 ? '+' : ''}${result.pnl_pct}%`,
        id: toastId,
      });
      await fetchAll();
    } catch (err: any) {
      toast.error(`[${ticker}] 매도 실패`, {
        description: err.message || '백엔드 연결을 확인하세요.',
        id: toastId,
      });
    } finally {
      setSellingTicker(null);
    }
  };

  const totalInvested = positions.reduce(
    (sum, p) => sum + (p.current_price ?? p.entry_price) * p.units,
    0
  );
  const totalEquity = (account?.cash_available ?? 0) + totalInvested;
  const initialCapital = 100000;
  const unrealizedPnl = totalEquity - initialCapital;
  const unrealizedPnlPct = (unrealizedPnl / initialCapital) * 100;
  const marginUsage = totalEquity > 0 ? (totalInvested / totalEquity) * 100 : 0;

  const statCards = [
    {
      label: 'TOTAL EQUITY',
      value: `$${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      sub: unrealizedPnl >= 0
        ? `+${unrealizedPnlPct.toFixed(2)}% (+$${unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })})`
        : `${unrealizedPnlPct.toFixed(2)}% ($${unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })})`,
      subColor: unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
      icon: <Wallet className="w-4 h-4" />,
      iconBg: 'bg-blue-500/10 text-blue-400',
    },
    {
      label: 'ACTIVE POSITIONS',
      value: `${positions.length} Assets`,
      sub: positions.filter(p => p.is_scaled_out).length > 0
        ? `${positions.filter(p => p.is_scaled_out).length} Scale-Out`
        : 'All HOLD',
      subColor: 'text-blue-500',
      icon: <Layers className="w-4 h-4" />,
      iconBg: 'bg-indigo-500/10 text-indigo-400',
    },
    {
      label: 'UNREALIZED PNL',
      value: unrealizedPnl >= 0
        ? `+$${unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : `-$${Math.abs(unrealizedPnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      sub: 'vs $100K initial',
      subColor: 'text-blue-500',
      icon: <BarChart3 className="w-4 h-4" />,
      iconBg: unrealizedPnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400',
      valueColor: unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'MARGIN USAGE',
      value: `${marginUsage.toFixed(1)}%`,
      sub: marginUsage < 50 ? 'HEALTHY' : marginUsage < 80 ? 'MODERATE' : 'HIGH',
      subColor: marginUsage < 50 ? 'text-emerald-400' : marginUsage < 80 ? 'text-amber-400' : 'text-rose-400',
      icon: <PieChart className="w-4 h-4" />,
      iconBg: 'bg-cyan-500/10 text-cyan-400',
      showBar: true,
      barPct: marginUsage,
    },
  ];

  return (
    <div className="mt-8 glass-panel rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            Virtual Portfolio
            <span className="text-[10px] font-black tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
              Live Paper Trading
            </span>
          </h2>
          <p className="text-xs text-blue-400 mt-0.5">시스템 시그널 기반 자동 매매 (모의투자)</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-200 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 border border-white/10"
        >
          <Activity className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'LOADING...' : 'REFRESH'}
        </button>
      </div>

      {/* 4-Column Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/5">
        {statCards.map((card) => (
          <div key={card.label} className="glass-panel p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.12em]">{card.label}</p>
              <span className={`p-1.5 rounded-lg ${card.iconBg}`}>{card.icon}</span>
            </div>
            <p className={`text-xl font-black tabular-nums ${card.valueColor ?? 'text-white'}`}>
              {card.value}
            </p>
            {card.showBar ? (
              <>
                <div className="mt-2 w-full bg-white/10 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(card.barPct ?? 0, 100)}%` }}
                  />
                </div>
                <p className={`text-[10px] font-black mt-1.5 uppercase tracking-wider ${card.subColor}`}>{card.sub}</p>
              </>
            ) : (
              <div className={`mt-1.5 flex items-center text-[11px] font-bold ${card.subColor}`}>
                {card.label === 'TOTAL EQUITY' && unrealizedPnl >= 0 && (
                  <TrendingUp className="w-3 h-3 mr-1" />
                )}
                {card.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Positions & History Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
        {/* Active Positions */}
        <div className="p-6">
          <h3 className="text-[10px] font-black text-blue-500 tracking-[0.15em] mb-4 flex items-center gap-2 uppercase">
            <TrendingUp className="w-3.5 h-3.5" /> Active Positions ({positions.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center p-8 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          ) : positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/5 border-dashed text-blue-600">
              <CheckCircle2 className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">No Active Positions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => {
                const pnlPct = pos.current_price && pos.entry_price
                  ? ((pos.current_price / pos.entry_price) - 1) * 100
                  : 0;
                const isProfit = pnlPct >= 0;
                const isSelling = sellingTicker === pos.ticker;

                return (
                  <div
                    key={pos.ticker}
                    className="glass-panel-hover rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                          <span className="text-sm font-black text-blue-400">{pos.ticker.charAt(0)}</span>
                        </div>
                        <div>
                          <span className="text-base font-black text-white">{pos.ticker}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {pos.is_scaled_out && (
                              <span className="text-[9px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Scale-Out
                              </span>
                            )}
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                              pos.status === 'HOLD'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-white/5 text-blue-400 border-white/10'
                            }`}>
                              {pos.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSell(pos)}
                        disabled={isSelling}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSelling ? (
                          <Activity className="w-3 h-3 animate-spin" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {isSelling ? 'SELLING...' : '매도'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-0.5">Entry</p>
                        <p className="text-xs font-black text-blue-300 tabular-nums">${pos.entry_price?.toFixed(2)}</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-0.5">Current</p>
                        <p className="text-xs font-black text-white tabular-nums">${pos.current_price?.toFixed(2) ?? '-'}</p>
                      </div>
                      <div className={`rounded-lg p-2 border ${isProfit ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-0.5">PnL</p>
                        <p className={`text-xs font-black tabular-nums flex items-center justify-center gap-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5 text-[9px] font-bold text-blue-600 uppercase tracking-wider">
                      <AlertTriangle className="w-3 h-3 text-amber-500/60" />
                      TS: ${pos.ts_threshold?.toFixed(2)} · High: ${pos.highest_price?.toFixed(2)} · {pos.units?.toFixed(2)} shares
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Trade History */}
        <div className="p-6">
          <h3 className="text-[10px] font-black text-blue-500 tracking-[0.15em] mb-4 flex items-center gap-2 uppercase">
            <History className="w-3.5 h-3.5" /> Recent Trades
          </h3>

          {loading ? (
            <div className="flex items-center justify-center p-8 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/5 border-dashed text-blue-600">
              <DollarSign className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">No Trade History</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((trade) => {
                const isWin = trade.pnl_pct > 0;
                return (
                  <div
                    key={trade.id}
                    className="glass-panel-hover rounded-xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-8 rounded-full ${isWin ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <div>
                        <span className="text-sm font-black text-white">{trade.ticker}</span>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">
                          {trade.type || 'TRAILING STOP'}
                          {trade.profit_amt !== undefined && (
                            <span className={`ml-2 ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${trade.profit_amt?.toFixed(2)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-black tabular-nums ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? '+' : ''}{trade.pnl_pct?.toFixed(2)}%
                      </span>
                      <p className="text-[10px] font-bold text-blue-600 tabular-nums mt-0.5">
                        ${trade.filled_avg_price?.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
