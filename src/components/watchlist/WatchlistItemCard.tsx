// WatchlistItemCard.tsx
import { 
  Trash2, ShieldCheck, Activity, HelpCircle, Zap, TrendingUp, Calendar, ArrowUpRight
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
    daysHeld,
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
        <div className="overflow-hidden bg-white border border-slate-200/60 rounded-[2rem] p-6 shadow-md">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/60" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-3 w-32 bg-slate-100 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-16 bg-slate-100 rounded-[1rem] border border-slate-200/60" />
              <div className="h-16 bg-slate-100 rounded-[1rem] border border-slate-200/60" />
            </div>
            <div className="h-24 bg-slate-100 rounded-[1.5rem] border border-slate-200/60" />
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
      quantSummary: analysisCache?.quantSummary || "해당 종목에 대한 시스템 분석 데이터가 존재하지 않습니다.",
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
      className="cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-[2.2rem] transition-all duration-500 hover:-translate-y-1"
    >
      <div className="overflow-hidden bg-white border border-slate-200/60 hover:border-indigo-400/40 hover:shadow-xl transition-all duration-500 shadow-md rounded-[2rem] relative h-full">
        {/* Card Background Glow */}
        <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        
        <div className={viewMode === 'grid' ? "p-6" : "p-5 flex items-center justify-between"}>
          {viewMode === 'grid' ? (
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    {item.ticker[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tighter uppercase leading-none">{item.ticker}</h3>
                      {isTrailing && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-black rounded-lg border border-amber-200 uppercase tracking-widest">
                          <Activity className="w-2.5 h-2.5" /> Trailing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">감시 작동 중</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div 
                    className={clsx(
                      "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all duration-500",
                      action === 'HOLD' ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : action === 'REJECT' ? "bg-amber-50 text-amber-700 border-amber-200" 
                        : action === 'TIME_STOP' ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    )}
                    title={action === 'REJECT' ? (dna.rejectReason || 'R/R Violation') : ''}
                  >
                    {action}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.ticker);
                    }}
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 active:scale-90"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50/60 p-4 rounded-[1.2rem] border border-slate-100 shadow-inner group-hover:bg-slate-50 transition-colors" title="AI 계측 지표 효율 지수">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    알파 효율 (Alpha) <HelpCircle className="w-3 h-3 opacity-50 text-indigo-500" />
                  </p>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-3xl font-black text-slate-800 font-mono tracking-tighter tabular-nums leading-none">{dnaScore}</span>
                    <span className="text-[10px] font-bold text-indigo-600 tracking-widest">DNA</span>
                  </div>
                </div>
                <div className="bg-slate-50/60 p-4 rounded-[1.2rem] border border-slate-100 shadow-inner group-hover:bg-slate-50 transition-colors" title="진입가 대비 현재 수익률">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    오빗 수익률 (Yield) <TrendingUp className="w-3 h-3 opacity-50 text-indigo-500" />
                  </p>
                  <div className={clsx(
                    "font-mono text-3xl font-black tracking-tighter tabular-nums leading-none",
                    isProfit ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-500"
                  )}>
                    <span>{isProfit ? '+' : ''}{currentReturnPct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50/60 p-4 rounded-[1.2rem] border border-slate-100 shadow-inner group-hover:bg-slate-50 transition-colors">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    현재가 (Current) <Activity className="w-3 h-3 opacity-50 text-indigo-500" />
                  </p>
                  <div className="flex flex-col">
                    <span className="text-2xl font-black text-slate-800 font-mono tracking-tighter tabular-nums leading-none">${currentPrice.toFixed(2)}</span>
                    <span className={clsx(
                      "text-[10px] font-bold font-mono mt-1",
                      stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}% (24h)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50/60 p-1 rounded-[1.2rem] border border-slate-100 shadow-inner group-hover:bg-slate-50 transition-colors relative overflow-hidden h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`grad-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isProfit ? "#10b981" : isLoss ? "#f43f5e" : "#6366f1"} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={isProfit ? "#10b981" : isLoss ? "#f43f5e" : "#6366f1"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={isProfit ? "#10b981" : isLoss ? "#f43f5e" : "#6366f1"} 
                        fillOpacity={1} 
                        fill={`url(#grad-${item.ticker})`} 
                        strokeWidth={2.5} 
                        connectNulls
                        animationDuration={1500}
                      />
                      {buyPrice > 0 && (
                        <ReferenceLine 
                          y={buyPrice} 
                          stroke="#cbd5e1" 
                          strokeDasharray="4 4" 
                          strokeWidth={1} 
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div title="목표 청산 기준 가격">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest flex items-center gap-2">목표가 (Target) <Zap className="w-2.5 h-2.5 text-indigo-500" /></p>
                  <p className="text-xl font-black text-emerald-600 font-mono tracking-tighter tabular-nums leading-none">${targetPrice.toFixed(2)}</p>
                </div>
                <div className="text-right" title="최대 리스크 허용 손절선">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">손절선 (Protection)</p>
                  <p className="text-xl font-black text-rose-600 font-mono tracking-tighter tabular-nums leading-none">${stopPrice.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dnaScore}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className={clsx(
                      "h-full rounded-full transition-all duration-1000",
                      dnaScore >= 70 ? "bg-emerald-500" :
                      dnaScore >= 40 ? "bg-indigo-500" : "bg-rose-500"
                    )}
                  />
                </div>
                
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>보유 기간: <span className="text-slate-700 font-mono tracking-normal font-semibold">{daysHeld}일</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>효율(ER): <span className="text-slate-700 font-mono tracking-normal font-semibold">{(efficiencyRatio * 100).toFixed(0)}%</span></span>
                  </div>
                  <div className="text-indigo-600">
                    켈리 비중: <span className="font-mono tracking-normal text-slate-700 font-semibold">{kellyWeight.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-8 relative z-10">
               <div className="flex items-center gap-5 min-w-[280px]">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-2xl text-indigo-600 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                   {item.ticker[0]}
                 </div>
                 <div>
                   <div className="flex items-center gap-3">
                     <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tighter uppercase leading-none">{item.ticker}</h3>
                     {isTrailing && <Activity className="w-4 h-4 text-amber-600 animate-pulse" />}
                   </div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1.5 leading-none">감시 작동 중</p>
                 </div>
               </div>

               <div className="flex-1 grid grid-cols-5 gap-8 items-center">
                  <div className="col-span-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em] whitespace-nowrap">알파 에너지 (DNA)</p>
                    <div className="flex items-center gap-4">
                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 shadow-inner">
                         <div className={clsx("h-full rounded-full transition-all duration-700", dnaScore >= 70 ? "bg-emerald-505 bg-emerald-500" : "bg-indigo-500")} style={{ width: `${dnaScore}%` }} />
                       </div>
                       <span className="text-lg font-bold text-slate-800 font-mono tracking-tighter">{dnaScore}</span>
                    </div>
                  </div>

                   <div className="text-center">
                     <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em]">효율 (Efficiency)</p>
                     <p className="text-lg font-bold text-slate-700 font-mono tracking-tighter">{(efficiencyRatio * 100).toFixed(1)}%</p>
                   </div>
  
                   <div className="text-center">
                     <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em]">현재 변동률 (24h)</p>
                     <p className={clsx(
                       "text-lg font-bold font-mono tracking-tighter flex items-center justify-center gap-2",
                       stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                     )}>
                       {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                     </p>
                   </div>
  
                   <div className="text-center">
                     <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em]">오빗 수익률 (Yield)</p>
                     <div className={clsx(
                       "text-2xl font-black font-mono tracking-tighter leading-none mb-1",
                       isProfit ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-500"
                     )}>
                       {isProfit ? '+' : ''}{currentReturnPct.toFixed(2)}%
                     </div>
                     <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter leading-none mt-1">진입가: ${buyPrice.toFixed(2)}</p>
                   </div>

                   <div className="flex items-center justify-end gap-5">
                     <div 
                        className={clsx(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                          action === 'HOLD' ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : action === 'REJECT' ? "bg-amber-50 text-amber-700 border-amber-200"
                            : action === 'TIME_STOP' ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        )}
                      >
                        {action}
                      </div>

                      <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onRemove(item.ticker);
                       }}
                       className="p-3.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 active:scale-95 group-hover:opacity-100 opacity-40"
                     >
                       <Trash2 className="w-5.5 h-5.5" />
                     </button>
                     
                     <div className="p-3.5 bg-slate-50 border border-slate-200 text-slate-400 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all rounded-xl shadow-sm">
                        <ArrowUpRight className="w-5.5 h-5.5" />
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
