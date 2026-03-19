import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchDiscoveries, fetchBacktestData, type DiscoveryItem } from '../../services/pythonApiService';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Link } from 'react-router-dom';
import { Zap, TrendingUp, ArrowUpDown, Loader2, List, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { AddToWatchlistBtn } from '../ui/AddToWatchlistBtn';

import { AnalysisResultCard } from '../ui/AnalysisResultCard';

interface DailyDiscoveriesProps {
  limit?: number;
  className?: string;
}

type SortMode = 'updated_at' | 'performance';

export const DailyDiscoveries: React.FC<DailyDiscoveriesProps> = ({
  limit = 10,
  className
}) => {
  const [sortMode, setSortMode] = useState<SortMode>('performance');

  const { data: discoveries, isLoading, error } = useQuery({
    queryKey: ['discoveries', limit, sortMode],
    queryFn: () => fetchDiscoveries(limit, sortMode),
    staleTime: 5 * 60 * 1000, // 5분
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className={clsx("p-6", className)}>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-white uppercase sm:tracking-tight">최적의 투자 기회 탐색 중...</h3>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  if (error || !discoveries || discoveries.length === 0) {
    return (
      <Card className={clsx("p-6", className)}>
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <span>현재 분석된 고효율 종목이 없습니다. 새로운 스캔을 시작해 주세요.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={clsx("p-6 shadow-2xl border-slate-800 bg-slate-900/40", className)}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">AI 정밀 분석 결과 (Top Picks)</h3>
          <Badge variant="neutral" className="bg-white/5 text-slate-500 border-white/5 font-mono tracking-tighter px-2">
            {discoveries.length} GEMS FOUND
          </Badge>
        </div>
      </div>

      <div className="mb-10">
        <TopPickHero item={discoveries[0]} />
      </div>

      <div className="flex items-center justify-between mb-6 mt-10 pt-8 border-t border-white/5">
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <List className="w-4 h-4" />
          전체 발굴 리스트
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortMode(sortMode === 'updated_at' ? 'performance' : 'updated_at')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black transition-all shadow-sm uppercase tracking-widest border",
              sortMode === 'performance'
                ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                : "bg-white/5 text-slate-500 hover:text-white border-white/5"
            )}
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortMode === 'performance' ? 'BEST ROI' : 'NEWEST'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {discoveries.map((item, index) => (
          <DiscoveryCard key={item.id} item={item} rank={index + 1} />
        ))}
      </div>
    </Card>
  );
};

const TopPickHero: React.FC<{ item: DiscoveryItem }> = ({ item }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <Badge variant="primary" className="bg-indigo-600 text-white border-none shadow-lg shadow-indigo-600/30 py-1.5 px-3 text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          MASTER ALGORITHM'S PICK
        </Badge>
        {item.backtest_return !== null && (
          <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 ml-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Confirmed ROI: {item.backtest_return.toFixed(1)}%
          </div>
        )}
      </div>

      <AnalysisResultCard
        ticker={item.ticker}
        dnaScore={item.dna_score}
        popProbability={item.pop_probability ?? 0}
        riskLevel={item.risk_level ?? 'Medium'}
        bullPoints={item.bull_case || []}
        bearPoints={item.bear_case || []}
        matchedLegend={item.matched_legend_ticker ? {
          ticker: item.matched_legend_ticker,
          similarity: item.legend_similarity || 0
        } : { ticker: 'N/A', similarity: 0 }}
        aiSummary={item.ai_summary}
        price={item.price}
        className="shadow-2xl shadow-indigo-500/10"
      />
    </div>
  );
};

const DiscoveryCard: React.FC<{ item: DiscoveryItem; rank: number }> = ({ item, rank }) => {
  const [backtestResult, setBacktestResult] = useState<number | null>(null);

  const changeValue = parseFloat(item.change.replace('%', ''));
  const isPositive = changeValue >= 0;

  const backtestMutation = useMutation({
    mutationFn: () => fetchBacktestData(item.ticker, '1y'),
    onSuccess: (data) => {
      if (data && data.total_return_pct !== undefined) {
        setBacktestResult(data.total_return_pct);
      }
    },
  });

  const handleBacktest = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    backtestMutation.mutate();
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group relative overflow-hidden">
      {/* Rank Badge */}
      <div className={clsx(
        "flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-black flex-shrink-0 font-mono border",
        rank === 1 && "bg-amber-500/10 text-amber-500 border-amber-500/30",
        rank === 2 && "bg-slate-400/10 text-slate-400 border-slate-400/30",
        rank === 3 && "bg-amber-700/10 text-amber-700 border-amber-700/30",
        rank > 3 && "bg-slate-800/10 text-slate-500 border-white/5"
      )}>
        #{rank}
      </div>

      {/* Stock Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            to={`/analysis/${item.ticker}`}
            className="font-bold text-white hover:text-indigo-400 transition-colors font-mono text-sm tracking-tight"
          >
            {item.ticker}
          </Link>
          <span className="text-[10px] text-slate-500 uppercase tracking-tighter truncate font-medium opacity-60 group-hover:opacity-100">{item.sector}</span>
        </div>
        <p className="text-[11px] text-slate-500 truncate opacity-70 italic font-medium">
          {item.ai_summary?.split('\n')[0] || 'AI Analysis in progress...'}
        </p>
      </div>

      {/* Inline Actions */}
      <div className="flex items-center gap-2">
        {/* One-Click Backtest Button */}
        <button
          onClick={handleBacktest}
          disabled={backtestMutation.isPending}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all flex-shrink-0 uppercase tracking-wider",
            backtestMutation.isPending
              ? "bg-slate-700 text-slate-400 cursor-wait"
              : backtestResult !== null
                ? backtestResult >= 0
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30"
                : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-white/5"
          )}
        >
          {backtestMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : backtestResult !== null ? (
            <>
              <TrendingUp className="w-3 h-3" />
              {backtestResult >= 0 ? '+' : ''}{backtestResult.toFixed(0)}%
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 opacity-50 group-hover:opacity-100" />
              BACKTEST
            </>
          )}
        </button>

        {/* Math Badge from DB */}
        {item.backtest_return !== null && (
          <div className={clsx(
            "flex flex-col items-center justify-center px-1.5 py-1 rounded-lg flex-shrink-0 min-w-[45px] border",
            item.backtest_return >= 10 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              item.backtest_return >= 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                "bg-rose-500/10 text-rose-400 border-rose-500/20"
          )}>
            <span className="text-[7px] uppercase font-black tracking-tighter opacity-50">MATH</span>
            <span className="text-[11px] font-mono font-bold leading-none">
              {item.backtest_return >= 0 ? '+' : ''}{item.backtest_return.toFixed(0)}%
            </span>
          </div>
        )}

        {/* DNA/Price Area */}
        <div className="flex flex-col items-end min-w-[70px]">
          <div className="text-sm font-black font-mono text-white leading-tight">${item.price.toFixed(2)}</div>
          <div className={clsx(
            "text-[10px] font-bold font-mono",
            isPositive ? "text-emerald-400" : "text-rose-400"
          )}>
            {isPositive ? '+' : ''}{item.change}
          </div>
        </div>

        {/* Add to Watchlist Button */}
        <AddToWatchlistBtn
          ticker={item.ticker}
          dnaScore={item.dna_score}
          variant="icon"
          className="bg-slate-800/50 border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/10"
        />
      </div>
    </div>
  );
};
