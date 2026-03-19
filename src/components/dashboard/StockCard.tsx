import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Eye, Sparkles } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { AddToWatchlistBtn } from '../ui/AddToWatchlistBtn';
import type { Stock } from '../../types';
import clsx from 'clsx';

interface StockCardProps {
  stock: Stock;
  action?: 'buy' | 'watch' | 'avoid' | 'TIME_STOP' | 'EXIT' | 'HOLD' | string;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
  rank?: number;         // 추천 순위
  topReason?: string;    // Bull case 요약
  className?: string;
}

export const StockCard: React.FC<StockCardProps> = ({ 
  stock, 
  action, 
  confidence, 
  reason,
  rank,
  topReason,
  className 
}) => {
  const getActionStyles = (a?: string) => {
    switch (a) {
      case 'buy': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'watch': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      case 'avoid': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'TIME_STOP': return 'text-amber-500 bg-amber-500/10 border-amber-500/20 animate-pulse';
      case 'EXIT': return 'text-rose-500 bg-rose-500/10 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getActionIcon = (a?: string) => {
    switch (a) {
      case 'buy': return <TrendingUp className="w-4 h-4" />;
      case 'watch': return <Eye className="w-4 h-4" />;
      case 'avoid': return <span className="text-sm">⚠️</span>;
      case 'TIME_STOP': return <span className="text-sm">⏱️</span>;
      case 'EXIT': return <span className="text-sm">🛑</span>;
      default: return null;
    }
  };

  const translateAction = (a?: string) => {
    if (!a) return '';
    const map: Record<string, string> = { 
      buy: '매수', watch: '관찰', avoid: '회피',
      'TIME_STOP': '기간 종료', 'EXIT': '비중 축소(EXIT)', 'HOLD': '유지'
    };
    return map[a] || a;
  };

  return (
    <Card className={clsx("p-4 hover:border-slate-700 transition-colors group relative overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {/* 순위 배지 - 인라인 */}
            {rank && (
              <div className={clsx(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shadow-lg flex-shrink-0",
                rank === 1 && "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
                rank === 2 && "bg-gradient-to-br from-slate-400 to-slate-500 text-white",
                rank === 3 && "bg-gradient-to-br from-amber-700 to-amber-800 text-white",
                rank > 3 && "bg-slate-700 text-slate-300"
              )}>
                #{rank}
              </div>
            )}
            <Link 
              to={`/analysis/${stock.ticker}`}
              className="text-lg font-bold text-white hover:text-indigo-400 transition-colors font-mono tracking-tight"
            >
              {stock.ticker}
            </Link>
            <span className="text-xs text-slate-500 truncate max-w-[120px]">{stock.name}</span>
            {confidence && (
              <Badge 
                variant={confidence === 'high' ? 'success' : confidence === 'medium' ? 'primary' : 'neutral'}
              >
                {confidence === 'high' && '🔥 HIGH'}
                {confidence === 'medium' && '⭐ MEDIUM'}
                {confidence === 'low' && '💡 SPECULATIVE'}
              </Badge>
            )}
          </div>
          
          {reason && (
            <p className="text-sm text-slate-400 mb-3 line-clamp-2 leading-relaxed italic">"{reason}"</p>
          )}
          
          {/* Bull Case 미리보기 */}
          {topReason && topReason !== reason && (
            <div className="mt-3 mb-3 p-3 bg-indigo-950/30 border-l-2 border-indigo-500 rounded">
              <p className="text-xs text-slate-300 italic">
                💡 {topReason}
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 text-[11px] font-mono mt-4">
            <div className="flex flex-col">
              <span className="text-slate-500 uppercase tracking-tighter mb-0.5">Price</span> 
              <span className="text-slate-200 font-bold">${stock.price.toFixed(2)}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-500 uppercase tracking-tighter mb-0.5">Change</span>
              <span className={clsx("font-bold", stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-slate-500 uppercase tracking-tighter mb-0.5">DNA Score</span> 
              <span className="text-indigo-400 font-bold">{stock.dnaScore}</span>
            </div>

            {stock.relevantMetrics.targetPrice && stock.relevantMetrics.targetPrice > 0 && (
              <div className="flex flex-col">
                <span className="text-slate-500 uppercase tracking-tighter mb-0.5">Target</span> 
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 font-bold">${stock.relevantMetrics.targetPrice.toFixed(2)}</span>
                  {stock.relevantMetrics.upsidePotential !== undefined && (
                    <span className={clsx(
                      "text-[9px] font-bold px-1 rounded",
                      stock.relevantMetrics.upsidePotential > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {stock.relevantMetrics.upsidePotential > 0 ? '+' : ''}{stock.relevantMetrics.upsidePotential.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0 z-10 relative">
          {action && action !== 'HOLD' && (
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider',
              getActionStyles(action)
            )}>
              {getActionIcon(action)}
              <span>{translateAction(action)}</span>
            </div>
          )}
          
          <AddToWatchlistBtn ticker={stock.ticker} dnaScore={stock.dnaScore} variant="icon" />
        </div>
      </div>
      
      {/* Visual Accent */}
      {stock.dnaScore > 80 && (
        <div className="absolute top-0 right-0 p-1">
          <Sparkles className="w-3 h-3 text-amber-500/50" />
        </div>
      )}
    </Card>
  );
};
