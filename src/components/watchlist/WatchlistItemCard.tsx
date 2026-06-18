// WatchlistItemCard.tsx
import { Trash2, ShieldCheck, Activity, Zap, ArrowUpRight
} from 'lucide-react';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, ReferenceLine, YAxis } from 'recharts';
import { useDNACalculator } from '../../hooks/useDNACalculator';
import type { Stock } from '../../types';
import type { WatchlistItem } from '../../services/watchlistService';
import clsx from 'clsx';

interface DeepDiveData {
  ticker: string;
  dnaScore: number;
  price: number;
  change: string;
  efficiencyRatio: number;
  kellyWeight: number;
  bullPoints: string[];
  bearPoints: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  quantSummary: string;
  dayHigh?: number;
  volume?: number;
  changePercent?: number;
  history?: { price: number; date: string }[];
  buyPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  formulaVerdict?: string;
  rsi?: number;
  macdDiff?: number;
  adx?: number;
  rvol?: number;
}

interface WatchlistItemCardProps {
  item: WatchlistItem;
  stock?: Stock;
  viewMode: 'grid' | 'list';
  onRemove: (ticker: string) => void;
  onDeepDive: (data: DeepDiveData) => void;
}

export const WatchlistItemCard = ({ 
  item, 
  stock, 
  viewMode, 
  onRemove, 
  onDeepDive 
}: WatchlistItemCardProps) => {
  const dna = useDNACalculator({
    buyPrice: item.buyPrice || stock?.price || 0,
    currentPrice: stock?.price || 0,
    buyDate: item.addedAt,
    history: stock?.history || []
  });

  const { 
    dnaScore, 
    targetPrice, 
    stopPrice, 
    efficiencyRatio,
    kellyWeight,
    isTrailing,
    action,
    isLoading
  } = dna;

  const currentPrice = stock?.price || 0;
  const buyPrice = item.buyPrice || stock?.price || 0;
  
  const chartData = useMemo(() => {
    if (!stock?.history) return [];
    const data = stock.history.map(h => ({ value: h.price, date: h.date }));
    if (currentPrice > 0 && (data.length === 0 || currentPrice !== data[data.length - 1].value)) {
      data.push({ value: currentPrice, date: new Date().toISOString() });
    }
    return data;
  }, [stock?.history, currentPrice]);

  const currentReturnPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
  const isProfit = currentReturnPct > 0.01;
  const isLoss = currentReturnPct < -0.01;

  if (isLoading || !stock) {
    return (
      <div className="cursor-wait animate-pulse">
        <div className="border-b border-slate-100 py-12">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100" />
              <div className="space-y-2 flex-1">
                <div className="h-6 w-32 bg-slate-200" />
                <div className="h-3 w-24 bg-slate-100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="h-12 bg-slate-50" />
              <div className="h-12 bg-slate-50" />
            </div>
            <div className="h-24 bg-slate-50" />
          </div>
        </div>
      </div>
    );
  }

  const handleCardClick = () => {
    const analysisCache = stock?.stock_analysis_cache?.[0]?.analysis;
    const riskLevel: 'Low' | 'Medium' | 'High' = dnaScore >= 70 ? 'Low' : dnaScore >= 50 ? 'Medium' : 'High';
    
    onDeepDive({
      ticker: item.ticker,
      dnaScore,
      price: currentPrice,
      change: `${stock?.changePercent.toFixed(2)}%`,
      efficiencyRatio,
      kellyWeight,
      bullPoints: analysisCache?.bullCase || ["모멘텀 지표 분석 중"],
      bearPoints: analysisCache?.bearCase || ["리스크 요인 스캔 중"],
      riskLevel,
      quantSummary: analysisCache?.quantSummary || "",
      dayHigh: stock?.currentHigh || 0,
      volume: stock?.volume || 0,
      changePercent: stock?.changePercent || 0,
      history: stock?.history?.map(h => ({ price: h.price, date: h.date })) || [],
      buyPrice: item.buyPrice || 0,
      targetPrice: targetPrice,
      stopPrice: stopPrice,
      formulaVerdict: analysisCache?.matchReasoning || "",
      rsi: stock?.rsi,
      macdDiff: stock?.macdDiff,
      adx: stock?.adx,
      rvol: stock?.rvol,
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className="cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-slate-900 transition-all duration-500 h-full"
    >
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md hover:border-slate-350 transition-all duration-300 relative h-full flex flex-col justify-between">
        <div className={viewMode === 'grid' ? "" : "flex items-center justify-between w-full"}>
          {viewMode === 'grid' ? (
            <div className="space-y-8 relative z-10">
              {/* Header section */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-slate-600 transition-colors tracking-tight uppercase leading-none font-mono">{item.ticker}</h3>
                    {isTrailing && (
                      <span className="flex items-center gap-1 text-amber-500 text-[10px] font-bold uppercase tracking-widest font-mono">
                        <Activity className="w-3 h-3" /> Trailing
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                    <span className="text-[10px] font-mono font-extrabold text-slate-700 uppercase tracking-widest leading-none">Monitoring</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div 
                      className={clsx(
                        "text-[10px] font-bold uppercase tracking-widest font-mono",
                        action === 'HOLD' ? "text-emerald-500" 
                          : action === 'REJECT' ? "text-amber-500" 
                          : action === 'TIME_STOP' ? "text-orange-500"
                          : "text-rose-500"
                      )}
                      title={action === 'REJECT' ? (dna.rejectReason || 'R/R Violation') : ''}
                    >
                      {action}
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.ticker);
                    }}
                    className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">Alpha DNA</p>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight tabular-nums leading-none">{dnaScore}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">Yield</p>
                  <div className={clsx(
                    "font-mono text-2xl font-bold tracking-tight tabular-nums leading-none",
                    isProfit ? "text-emerald-500" : isLoss ? "text-rose-500" : "text-slate-900"
                  )}>
                    <span>{isProfit ? '+' : ''}{currentReturnPct.toFixed(1)}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">Current</p>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight tabular-nums leading-none">${currentPrice.toFixed(2)}</span>
                    <span className={clsx(
                      "text-xs font-medium font-mono mt-1",
                      stock.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                {/* Minimalist Chart Area */}
                <div className="h-16 relative w-full opacity-60 group-hover:opacity-100 transition-opacity">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`grad-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.05} />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#0f172a" 
                        fillOpacity={1} 
                        fill={`url(#grad-${item.ticker})`} 
                        strokeWidth={1.5} 
                        connectNulls
                        animationDuration={1500}
                      />
                      {buyPrice > 0 && (
                        <ReferenceLine 
                          y={buyPrice} 
                          stroke="#cbd5e1" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Targets */}
              <div className="grid grid-cols-2 gap-8 pt-6">
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest flex items-center gap-1">Target <Zap className="w-2.5 h-2.5 text-slate-500" /></p>
                  <p className="text-lg font-bold text-slate-900 font-mono tracking-tight tabular-nums leading-none">${targetPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest flex items-center gap-1">Protection <ShieldCheck className="w-2.5 h-2.5 text-slate-500" /></p>
                  <p className="text-lg font-bold text-slate-900 font-mono tracking-tight tabular-nums leading-none">${stopPrice.toFixed(2)}</p>
                </div>
              </div>

              {/* Minimal Progress Bar */}
              <div className="pt-2">
                <div className="w-full h-[2px] bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dnaScore}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="h-full bg-slate-900 transition-all duration-1000"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-12 relative z-10 py-2">
               <div className="min-w-[160px]">
                 <div className="flex items-baseline gap-3 mb-1">
                   <h3 className="text-xl font-bold text-slate-900 group-hover:text-slate-600 transition-colors tracking-tight uppercase leading-none font-mono">{item.ticker}</h3>
                   {isTrailing && <Activity className="w-3 h-3 text-amber-500 animate-pulse" />}
                 </div>
                 <p className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-widest leading-none">Monitoring</p>
               </div>

                <div className="flex-1 grid grid-cols-5 gap-8 items-center">
                   <div className="col-span-1">
                     <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest whitespace-nowrap">DNA</p>
                     <div className="flex items-baseline gap-3">
                        <span className="text-lg font-bold text-slate-900 font-mono tracking-tight">{dnaScore}</span>
                     </div>
                   </div>

                    <div>
                      <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">Efficiency</p>
                      <p className="text-lg font-bold text-slate-900 font-mono tracking-tight">{(efficiencyRatio * 100).toFixed(1)}%</p>
                    </div>
  
                    <div>
                      <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">24H</p>
                      <p className={clsx(
                        "text-lg font-bold font-mono tracking-tight",
                        stock.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                      </p>
                    </div>
  
                    <div>
                      <p className="text-[10px] font-mono font-bold text-slate-700 uppercase mb-1 tracking-widest">Yield</p>
                      <div className={clsx(
                        "text-lg font-bold font-mono tracking-tight leading-none mb-1",
                        isProfit ? "text-emerald-500" : isLoss ? "text-rose-500" : "text-slate-900"
                      )}>
                        {isProfit ? '+' : ''}{currentReturnPct.toFixed(1)}%
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-6">
                      <div 
                         className={clsx(
                           "text-[10px] font-bold uppercase tracking-widest font-mono text-right",
                           action === 'HOLD' ? "text-emerald-500" 
                             : action === 'REJECT' ? "text-amber-500"
                             : action === 'TIME_STOP' ? "text-orange-500"
                             : "text-rose-500"
                         )}
                       >
                         {action}
                       </div>

                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.ticker);
                        }}
                        className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      
                      <div className="text-slate-300 group-hover:text-slate-900 transition-colors">
                         <ArrowUpRight className="w-6 h-6" />
                      </div>
                    </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
