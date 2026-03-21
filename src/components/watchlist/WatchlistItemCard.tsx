// WatchlistItemCard.tsx
import { 
  Trash2, ShieldCheck, Activity, Clock, HelpCircle, Zap, TrendingUp
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { Card } from '../ui/Card';
import { useDNACalculator } from '../../hooks/useDNACalculator';
import type { Stock } from '../../types';
import type { WatchlistItem } from '../../services/watchlistService';
import clsx from 'clsx';

interface WatchlistItemCardProps {
  item: WatchlistItem;
  stock?: Stock;
  viewMode: 'grid' | 'list';
  onRemove: (ticker: string) => void;
  onDeepDive: (data: any) => void;
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
    timePenalty, 
    daysHeld,
    efficiencyRatio,
    kellyWeight,
    isTrailing,
    action,
    isLoading
  } = dna;

  const chartData = stock?.history?.map(h => ({ value: h.price, date: h.date })) || [];
  const currentPrice = stock?.price || 0;
  const buyPrice = item.buyPrice || stock?.price || 0;
  const currentReturnPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
  const isProfit = currentReturnPct >= 0;

  // 가격 데이터가 아직 로딩 중인 경우 스켈레톤 렌더링
  if (isLoading || !stock) {
    return (
      <div className="cursor-pointer">
        <Card className="overflow-hidden bg-white border-slate-200 rounded-2xl p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100" />
              <div className="space-y-1.5">
                <div className="h-4 w-16 bg-slate-100 rounded" />
                <div className="h-2.5 w-24 bg-slate-100 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-14 bg-slate-50 rounded-xl border border-slate-100" />
              <div className="h-14 bg-slate-50 rounded-xl border border-slate-100" />
            </div>
            <div className="h-16 bg-slate-50 rounded-lg" />
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
              <div className="h-8 bg-slate-50 rounded" />
              <div className="h-8 bg-slate-50 rounded" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        const riskLevel = dnaScore >= 70 ? 'Low' : dnaScore >= 50 ? 'Medium' : 'High';
        onDeepDive({
          ticker: item.ticker,
          dnaScore,
          price: currentPrice,
          change: `${stock?.changePercent.toFixed(2)}%`,
          efficiencyRatio,
          kellyWeight,
          // StockTerminalModal 필수 필드
          bullPoints: stock?.stock_analysis_cache?.[0]?.analysis?.bullCase || ["모멘텀 지표 분석 중"],
          bearPoints: stock?.stock_analysis_cache?.[0]?.analysis?.bearCase || ["리스크 요인 스캔 중"],
          riskLevel,
          quantSummary: stock?.stock_analysis_cache?.[0]?.analysis?.quantSummary || "해당 종목에 대한 시스템 분석 데이터가 존재하지 않습니다.",
        });
      }}
      className="cursor-pointer group"
    >
      <Card className="overflow-hidden bg-white border-slate-200 hover:border-[#0176d3]/40 transition-all hover:shadow-xl rounded-2xl">
        <div className={viewMode === 'grid' ? "p-5" : "p-4 flex items-center justify-between"}>
          {viewMode === 'grid' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-all">
                    {item.ticker[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900 group-hover:text-[#0176d3] transition-colors">{item.ticker}</h3>
                      {isTrailing && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[8px] font-black rounded border border-amber-100 uppercase tracking-tighter">
                          <Activity className="w-2 h-2" /> Trailing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">System Verified</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className={clsx(
                      "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                      action === 'HOLD' ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                        : action === 'REJECT' ? "bg-amber-50 text-amber-600 border-amber-200" 
                        : action === 'TIME_STOP' ? "bg-orange-50 text-orange-600 border-orange-200"
                        : "bg-rose-50 text-rose-600 border-rose-100"
                    )}
                    title={action === 'REJECT' ? (dna.rejectReason || 'R/R Ratio 미달 — 진입 회피 권고') : ''}
                  >
                    {action}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.ticker);
                    }}
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100" title="현재가의 종합적인 기술적/통계적 우위 점수">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                    System Score <HelpCircle className="w-2.5 h-2.5 opacity-50" />
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-slate-900 font-mono">{dnaScore}</span>
                    <span className="text-[10px] font-bold text-[#0176d3]">PTS</span>
                  </div>
                </div>
                <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100" title="진입가 대비 현재 수익률">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                    Return <TrendingUp className="w-2.5 h-2.5 opacity-50" />
                  </p>
                  <div className={isProfit ? "text-emerald-600" : "text-rose-600"}>
                    <span className="text-xl font-black font-mono">{isProfit ? '+' : ''}{currentReturnPct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="h-16 w-full -mx-5 px-5 group/chart relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white px-2 py-1 rounded text-[10px] font-mono border border-slate-700 shadow-xl">
                              ${Number(payload[0].value).toFixed(2)}
                            </div>
                          );
                        }
                        return null;
                      }}
                      cursor={{ stroke: '#0176d3', strokeWidth: 1, strokeDasharray: '3 3' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke={isProfit ? '#10b981' : '#f43f5e'} 
                      fill={isProfit ? '#10b98120' : '#f43f5e20'} 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
                <div title="목표가 (적정 익절 라인)">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5 flex items-center gap-1">Target <Zap className="w-2.5 h-2.5 opacity-50 text-amber-500 fill-amber-500" /></p>
                  <p className="text-xs font-black text-emerald-600 font-mono">${targetPrice.toFixed(2)}</p>
                </div>
                <div className="text-right" title="보호가 (최종 손절 또는 익절 보호 라인)">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Protection</p>
                  <p className="text-xs font-black text-rose-600 font-mono">${stopPrice.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50/50">
                <div title="추세 효율성 (ER): 1.0에 가까울수록 노이즈 없는 깔끔한 추세">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Efficiency</p>
                  <p className="text-[10px] font-black text-slate-700 font-mono">{(efficiencyRatio * 100).toFixed(0)}%</p>
                </div>
                <div className="text-right" title="시간 감가 페널티: 보유 기간이 길어질수록 점수 감점">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5 flex items-center justify-end gap-1"><Clock className="w-2.5 h-2.5 opacity-50" /> Decay</p>
                  <p className="text-[10px] font-black text-slate-500 font-mono">-{timePenalty} pts</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-indigo-50/50 bg-indigo-50/30 -mx-5 px-5 py-2">
                <div className="flex items-center gap-1.5" title="실제 보유 영업일 (주말 제외)">
                  <CalendarIcon className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase">Days Held</span>
                  <span className="text-[10px] font-black text-slate-700 font-mono">{daysHeld}d</span>
                </div>
                <div className="text-right" title="켈리 기준 적정 투자 비중 (Quarter-Kelly)">
                  <span className="text-[10px] font-black text-slate-400 uppercase mr-1.5">Kelly</span>
                  <span className="text-xs font-black text-[#0176d3] font-mono">{kellyWeight.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-6">
               <div className="flex items-center gap-4 min-w-[200px]">
                 <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-[#0176d3]">
                   {item.ticker[0]}
                 </div>
                 <div>
                   <div className="flex items-center gap-2">
                     <h3 className="text-lg font-black text-slate-900">{item.ticker}</h3>
                     {isTrailing && <Activity className="w-3 h-3 text-amber-500" />}
                   </div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Market Asset</p>
                 </div>
               </div>

               <div className="flex-1 flex items-center gap-8">
                  <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-tighter">System Power</p>
                    <div className="flex items-center gap-2">
                       <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                         <div className="h-full bg-[#0176d3] rounded-full" style={{ width: `${dnaScore}%` }} />
                       </div>
                       <span className="text-xs font-black text-slate-800 font-mono">{dnaScore}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-tighter">Efficiency</p>
                    <p className="text-xs font-black text-slate-700 font-mono">{(efficiencyRatio * 100).toFixed(1)}%</p>
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-tighter">P/L Performance</p>
                    <p className={clsx(
                      "text-xs font-black font-mono flex items-center gap-1",
                      isProfit ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {isProfit ? '+' : ''}{currentReturnPct.toFixed(2)}%
                    </p>
                  </div>

                   <div 
                    className={clsx(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase border",
                      action === 'HOLD' ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                        : action === 'REJECT' ? "bg-amber-50 text-amber-600 border-amber-200"
                        : action === 'TIME_STOP' ? "bg-orange-50 text-orange-600 border-orange-200"
                        : "bg-rose-50 text-rose-600 border-rose-100"
                    )}
                    title={action === 'REJECT' ? (dna.rejectReason || 'R/R Ratio 미달') : ''}
                  >
                    {action}
                  </div>

                  <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     onRemove(item.ticker);
                   }}
                   className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100"
                 >
                   <Trash2 className="w-4.5 h-4.5" />
                 </button>
               </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
