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
  // 실측 데이터 확장 필드
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
        <div className="overflow-hidden dark-glass-panel border border-white/5 rounded-[2rem] p-6 shadow-2xl">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 bg-slate-800 rounded" />
                <div className="h-3 w-32 bg-slate-900 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-16 bg-slate-900 rounded-[1rem] border border-slate-800" />
              <div className="h-16 bg-slate-900 rounded-[1rem] border border-slate-800" />
            </div>
            <div className="h-24 bg-slate-900 rounded-[1.5rem] border border-slate-800" />
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
      // 실측 데이터 전달
      dayHigh: stock?.currentHigh || 0,
      volume: stock?.volume || 0,
      changePercent: stock?.changePercent || 0,
      history: stock?.history?.map(h => ({ price: h.price, date: h.date })) || [],
      buyPrice: item.buyPrice || 0,
      targetPrice: targetPrice,
      stopPrice: stopPrice,
      formulaVerdict: analysisCache?.matchReasoning || "",
      // 실측 기술적 지표 전달
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
      className="cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-[2.2rem] transition-all duration-500 hover:-translate-y-1"
    >
      <div className="overflow-hidden dark-glass-panel border border-white/5 hover:border-indigo-500/40 hover:shadow-2xl transition-all duration-500 rounded-[2rem] relative h-full">
        {/* Card Background Glow */}
        <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        
        <div className={viewMode === 'grid' ? "p-6" : "p-5 flex items-center justify-between"}>
          {viewMode === 'grid' ? (
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-2xl text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    {item.ticker[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-3xl font-black text-white group-hover:text-indigo-400 transition-colors tracking-tighter uppercase leading-none font-mono">{item.ticker}</h3>
                      {isTrailing && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-550/10 text-amber-400 text-[10px] font-black rounded-lg border border-amber-500/20 uppercase tracking-widest font-mono">
                          <Activity className="w-2.5 h-2.5" /> Trailing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">감시 작동 중</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div 
                    className={clsx(
                      "px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border transition-all duration-500 font-mono",
                      action === 'HOLD' ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
                        : action === 'REJECT' ? "bg-amber-500/15 text-amber-400 border-amber-500/25" 
                        : action === 'TIME_STOP' ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
                        : "bg-rose-500/15 text-rose-450 border-rose-500/25"
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
                    className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition-all border border-transparent hover:border-rose-500/25 active:scale-90 cursor-pointer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#101828]/60 p-4 rounded-[1.2rem] border border-white/10 shadow-inner group-hover:bg-[#111c35]/40 transition-colors" title="AI 계측 지표 효율 지수">
                  <p className="text-sm font-bold text-slate-300 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    알파 효율 (Alpha) <HelpCircle className="w-3.5 h-3.5 opacity-75 text-indigo-400" />
                  </p>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-4xl font-black text-white font-mono tracking-tighter tabular-nums leading-none">{dnaScore}</span>
                    <span className="text-xs font-bold text-indigo-400 tracking-widest font-mono">DNA</span>
                  </div>
                </div>
                <div className="bg-[#101828]/60 p-4 rounded-[1.2rem] border border-white/10 shadow-inner group-hover:bg-[#111c35]/40 transition-colors" title="진입가 대비 현재 수익률">
                  <p className="text-sm font-bold text-slate-300 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    오빗 수익률 (Yield) <TrendingUp className="w-3.5 h-3.5 opacity-75 text-indigo-400" />
                  </p>
                  <div className={clsx(
                    "font-mono text-4xl font-black tracking-tighter tabular-nums leading-none",
                    isProfit ? "text-emerald-400" : isLoss ? "text-rose-400" : "text-slate-400"
                  )}>
                    <span>{isProfit ? '+' : ''}{currentReturnPct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#101828]/60 p-4 rounded-[1.2rem] border border-white/10 shadow-inner group-hover:bg-[#111c35]/40 transition-colors">
                  <p className="text-sm font-bold text-slate-300 uppercase mb-2 flex items-center gap-1.5 tracking-widest">
                    현재가 (Current) <Activity className="w-3.5 h-3.5 opacity-75 text-indigo-400" />
                  </p>
                  <div className="flex flex-col">
                    <span className="text-4xl font-black text-white font-mono tracking-tighter tabular-nums leading-none">${currentPrice.toFixed(2)}</span>
                    <span className={clsx(
                      "text-xs font-bold font-mono mt-1",
                      stock.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}% (24h)
                    </span>
                  </div>
                </div>

                <div className="bg-[#101828]/60 p-1 rounded-[1.2rem] border border-white/10 shadow-inner group-hover:bg-[#111c35]/40 transition-colors relative overflow-hidden h-20">
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
                          stroke="#334155" 
                          strokeDasharray="4 4" 
                          strokeWidth={1} 
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div title="목표 청산 기준 가격">
                  <p className="text-sm font-bold text-slate-300 uppercase mb-1 tracking-widest flex items-center gap-2">목표가 (Target) <Zap className="w-2.5 h-2.5 text-indigo-400" /></p>
                  <p className="text-3xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums leading-none">${targetPrice.toFixed(2)}</p>
                </div>
                <div className="text-right" title="최대 리스크 허용 손절선">
                  <p className="text-sm font-bold text-slate-300 uppercase mb-1 tracking-widest">손절선 (Protection)</p>
                  <p className="text-3xl font-black text-rose-400 font-mono tracking-tighter tabular-nums leading-none">${stopPrice.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/10 shadow-inner">
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
                
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>보유 기간: <span className="text-slate-200 font-mono tracking-normal font-bold">{daysHeld}일</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>효율(ER): <span className="text-slate-200 font-mono tracking-normal font-bold">{(efficiencyRatio * 100).toFixed(0)}%</span></span>
                  </div>
                  <div className="text-indigo-400">
                    켈리 비중: <span className="font-mono tracking-normal text-slate-200 font-bold">{kellyWeight.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-8 relative z-10">
               <div className="flex items-center gap-5 min-w-[280px]">
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-2xl text-indigo-400 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                   {item.ticker[0]}
                 </div>
                 <div>
                   <div className="flex items-center gap-3">
                     <h3 className="text-3xl font-black text-white group-hover:text-indigo-400 transition-colors tracking-tighter uppercase leading-none font-mono">{item.ticker}</h3>
                     {isTrailing && <Activity className="w-4 h-4 text-amber-400 animate-pulse" />}
                   </div>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-1.5 leading-none">감시 작동 중</p>
                 </div>
               </div>

                <div className="flex-1 grid grid-cols-5 gap-8 items-center">
                   <div className="col-span-1">
                     <p className="text-sm font-bold text-slate-350 uppercase mb-2 tracking-[0.2em] whitespace-nowrap">알파 에너지 (DNA)</p>
                     <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-white/10 shadow-inner">
                           <div className={clsx("h-full rounded-full transition-all duration-700", dnaScore >= 70 ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${dnaScore}%` }} />
                        </div>
                        <span className="text-2xl font-black text-white font-mono tracking-tighter">{dnaScore}</span>
                     </div>
                   </div>

                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-350 uppercase mb-2 tracking-[0.2em]">효율 (Efficiency)</p>
                      <p className="text-2xl font-black text-slate-200 font-mono tracking-tighter">{(efficiencyRatio * 100).toFixed(1)}%</p>
                    </div>
  
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-350 uppercase mb-2 tracking-[0.2em]">현재 변동률 (24h)</p>
                      <p className={clsx(
                        "text-2xl font-black font-mono tracking-tighter flex items-center justify-center gap-2",
                        stock.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </p>
                    </div>
  
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-350 uppercase mb-2 tracking-[0.2em]">오빗 수익률 (Yield)</p>
                      <div className={clsx(
                        "text-4xl font-black font-mono tracking-tighter leading-none mb-1",
                        isProfit ? "text-emerald-400" : isLoss ? "text-rose-450" : "text-slate-400"
                      )}>
                        {isProfit ? '+' : ''}{currentReturnPct.toFixed(2)}%
                      </div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter leading-none mt-1">진입가: ${buyPrice.toFixed(2)}</p>
                    </div>

                    <div className="flex items-center justify-end gap-5">
                      <div 
                         className={clsx(
                           "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border font-mono",
                           action === 'HOLD' ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
                             : action === 'REJECT' ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                             : action === 'TIME_STOP' ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
                             : "bg-rose-500/15 text-rose-450 border-rose-500/25"
                         )}
                       >
                         {action}
                       </div>

                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.ticker);
                        }}
                        className="p-3.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition-all border border-transparent hover:border-rose-500/25 active:scale-95 group-hover:opacity-100 opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-5.5 h-5.5" />
                      </button>
                      
                      <div className="p-3.5 bg-white/5 border border-white/10 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all rounded-xl shadow-sm">
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
