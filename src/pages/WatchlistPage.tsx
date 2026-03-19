import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trash2, Activity, TrendingUp, TrendingDown, Search,
  LayoutGrid, List, Zap, ShieldCheck, HelpCircle
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine, Tooltip as RechartsTooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import clsx from 'clsx';
import { getWatchlist, removeFromWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { 
  fetchMultipleStocksOptimized,
  fetchStockHistory
} from '../services/stockService';
import { useDNACalculator } from '../hooks/useDNACalculator';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import type { Stock, HistoricalDataPoint } from '../types';

const formatPrice = (price: number | undefined | null): string => {
  if (price === undefined || price === null) return '---';
  return price < 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`;
};

export const WatchlistPage = () => {
  const navigate = useNavigate();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [benchmarkHistory, setBenchmarkHistory] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Terminal Modal State
  const [terminalData, setTerminalData] = useState<any | null>(null);


  const loadData = async () => {
    setLoading(true);
    try {
      const items = await getWatchlist();
      setWatchlistItems(items);
      
      if (items.length > 0) {
        const tickers = items.map(i => i.ticker);
        
        // 🆕 Optimization: Calculate the required history range once
        // Find the earliest registration date
        const now = new Date();
        const earliestDate = items.reduce((earliest, item) => {
          const itemDate = new Date(item.addedAt);
          return itemDate < earliest ? itemDate : earliest;
        }, now);
        
        const diffDays = Math.ceil(Math.abs(now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) + 5;
        const historyRange = diffDays <= 5 ? '5d' : diffDays <= 30 ? '1mo' : diffDays <= 90 ? '3mo' : '1y';
        
        console.log(`[Watchlist] Fetching optimized data for ${tickers.length} tickers with range: ${historyRange}`);
        
        
        // 🚀 Parallel Optimized Fetch
        const [enrichedStocks, iwmHistory] = await Promise.all([
          fetchMultipleStocksOptimized(tickers, historyRange),
          fetchStockHistory('IWM', 'D', diffDays)
        ]);
        
        console.log('DEBUG: Enriched Stocks with History:', enrichedStocks.map(s => ({ t: s.ticker, hL: s.history?.length })));
        setStocks(enrichedStocks);
        setBenchmarkHistory(iwmHistory);
      }
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = watchlistItems.filter(item => 
    item.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStock = (ticker: string) => stocks.find(s => s.ticker === ticker);

  const handleRemove = async (ticker: string) => {
    await removeFromWatchlist(ticker);
    loadData();
  };

  const handleAddTicker = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value) {
      const val = e.currentTarget.value.trim().toUpperCase();
      if (val) {
        await addToWatchlist(val, undefined, 'WATCHING', undefined, undefined, undefined);
        e.currentTarget.value = '';
        loadData();
      }
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Tactical Watchlist</p>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">My Monitoring Orbit</h1>
          </div>
        </div>
          
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
            <input 
              type="text"
              placeholder="Ticker search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-md text-sm text-slate-900 focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3] outline-none w-48 transition-all bg-white shadow-sm"
            />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-md p-1 flex">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-70">
          <div className="w-12 h-12 border-2 border-[#0176d3]/20 border-t-[#0176d3] rounded-full animate-spin" />
          <p className="font-mono text-xs text-slate-500 tracking-widest">SYNCHRONIZING ORBIT...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-40 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm px-6">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
            <Activity className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-xl text-slate-900 font-black tracking-tight mb-2">My Monitoring Orbit is empty</p>
          <p className="text-sm font-medium text-slate-500 mb-8 max-w-sm mx-auto">
            시장의 흐름을 추적할 관심 종목이 아직 없습니다. 검색을 통해 직접 추가하거나 퀀트 스캐너에서 유망 종목을 찾아보세요.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="relative group w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
              <input 
                type="text" 
                placeholder="티커 직접 추가 (Enter)" 
                className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-[#0176d3] focus:ring-4 focus:ring-blue-100 outline-none w-full sm:w-64 transition-all shadow-sm"
                onKeyDown={handleAddTicker}
              />
            </div>
            <button 
              onClick={() => navigate('/scanner')}
              className="px-6 py-3 bg-[#0176d3] text-white font-black text-sm rounded-xl shadow-md hover:bg-[#014486] hover:shadow-lg transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Zap className="w-4 h-4 fill-current opacity-80" /> 퀀트 아이템 탐색
            </button>
          </div>
        </div>
      ) : (
        <div className={viewMode === 'grid' 
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          : "space-y-3"
        }>
          <AnimatePresence>
            {filteredItems.map((item) => (
              <WatchlistItemCard 
                key={item.ticker} 
                item={item} 
                stock={getStock(item.ticker)} 
                viewMode={viewMode}
                onRemove={handleRemove}
                benchmarkHistory={benchmarkHistory}
                onDeepDive={(data) => setTerminalData(data)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Terminal Modal Brushing */}
      {terminalData && (
        <StockTerminalModal 
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
        />
      )}
    </div>
  );
};

interface WatchlistItemCardProps {
  item: WatchlistItem;
  stock?: Stock;
  viewMode: 'grid' | 'list';
  onRemove: (ticker: string) => void;
  benchmarkHistory: HistoricalDataPoint[];
  onDeepDive: (data: any) => void;
}

const WatchlistItemCard = ({ item, stock, viewMode, onRemove, benchmarkHistory, onDeepDive }: WatchlistItemCardProps) => {
  // 🆕 DNA Calculator Integration
  const { 
    dnaScore, 
    targetPrice, 
    stopPrice, 
    timePenalty, 
    daysHeld,
    efficiencyRatio,
    kellyWeight,
    relativeStrength,
    isTrailing,
    action
  } = useDNACalculator({
    buyPrice: item.buyPrice || stock?.price || 0,
    currentPrice: stock?.price || 0,
    currentHigh: stock?.currentHigh || stock?.price || 0,
    atr5: stock?.relevantMetrics?.atr5,
    buyDate: item.addedAt,
    history: stock?.history,
    benchmarkHistory
  });

  if (!stock) return null;

  // 📈 Total Performance Metrics
  const referencePrice = item.buyPrice || stock.price;
  const currentReturnPct = ((stock.price / referencePrice) - 1) * 100;
  const isProfit = currentReturnPct >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={viewMode === 'grid' ? "" : "w-full"}
    >
      <Card 
        onClick={() => {
          if (stock) {
            const cache = (stock as any).stock_analysis_cache?.[0]?.analysis;
            let aiSummaryStr = cache?.aiSummary || "해당 자산에 대한 최신 시장 Narrative를 분석 중입니다...";
            
            onDeepDive({
              ticker: stock.ticker,
              dnaScore: dnaScore,
              popProbability: cache?.popProbability || 0,
              bullPoints: cache?.bullCase || ["No details"],
              bearPoints: cache?.bearCase || ["No details"],
              matchedLegend: cache?.matchedLegend || { ticker: 'None', similarity: 0 },
              riskLevel: cache?.riskLevel || 'Medium',
              aiSummary: aiSummaryStr,
              price: stock.price,
              change: `${stock.changePercent.toFixed(2)}%`,
              efficiencyRatio,
              kellyWeight,
              relativeStrength
            });
          }
        }}
        className={`group relative overflow-hidden transition-all bg-white border shadow-sm cursor-pointer hover:shadow-md ${
          action === 'EXIT' ? 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse hover:border-rose-400' :
          action === 'TIME_STOP' ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:border-amber-400' : 
          'border-slate-200 hover:border-[#0176d3]/40'
        } ${viewMode === 'grid' ? 'p-6' : 'p-4 flex items-center justify-between'}`}>
        {/* Background Glow */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity bg-gradient-to-br ${
          isProfit ? 'from-emerald-500' : 'from-rose-500'
        } to-transparent pointer-events-none`} />

        <div className={`flex flex-1 ${viewMode === 'grid' ? 'flex-col' : 'items-center gap-6'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border ${
                isProfit ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
              }`}>
                {item.ticker[0]}
              </div>
              <div>
                <h3 className="font-black text-xl text-slate-900 tracking-tighter">{item.ticker}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[100px]">
                  {stock.name}
                </p>
              </div>
            </div>
            
            {viewMode === 'grid' && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 bg-indigo-500/10 text-indigo-600 px-2 py-1 rounded text-[10px] font-black tracking-widest border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors group/score relative cursor-help">
                    <ShieldCheck className="w-3 h-3" />
                    {dnaScore}% TRADE HEALTH
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/score:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed font-normal normal-case tracking-normal">
                      <span className="text-indigo-400 font-bold">TRADE HEALTH:</span> 진입가 대비 현재 포지션의 진행 상태와 안정성을 나타내는 건강도 지표
                    </div>
                  </div>
                  {timePenalty > 0 && (
                    <div className="flex flex-col items-end group/penalty relative">
                      <span className="text-[8px] text-rose-400 font-bold mt-1 cursor-help underline decoration-rose-300/30 underline-offset-2">
                        -{timePenalty.toFixed(0)} pts Decay
                      </span>
                      {/* Tooltip for Opportunity Cost */}
                      <div className="absolute top-full right-0 mt-1 w-32 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/penalty:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed">
                        주말 포함 보유 기간에 따른 <br/>
                        <span className="text-amber-400">자본 기회비용</span>이 감점 반영되었습니다.
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.ticker);
                  }}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className={`flex flex-wrap items-end justify-between gap-y-4 ${viewMode === 'grid' ? '' : 'flex-1'}`}>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              <div>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5 flex items-center gap-1 group/entry relative cursor-help">
                  Entry
                  <HelpCircle className="w-2.5 h-2.5 opacity-50" />
                  <div className="absolute bottom-full left-0 mb-1 w-32 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/entry:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed normal-case tracking-normal font-normal">
                    종목을 감시 궤도에 추가했을 때의 기준 가격
                  </div>
                </p>
                <p className="text-sm font-black text-slate-700 font-mono">
                  {formatPrice(item.buyPrice)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5 flex items-center gap-1 group/target relative cursor-help">
                  DNA Target
                  <HelpCircle className="w-2.5 h-2.5 opacity-50" />
                  <div className="absolute bottom-full left-0 mb-1 w-32 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/target:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed normal-case tracking-normal font-normal">
                    AI 모델이 산출한 현실적인 1차 수익 실현 목표가
                  </div>
                </p>
                <p className="text-sm font-black text-[#0176d3] font-mono">
                  {formatPrice(targetPrice)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5 flex items-center gap-1 group/stop relative cursor-help">
                  DNA Stop
                  <HelpCircle className="w-2.5 h-2.5 opacity-50" />
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/stop:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed normal-case tracking-normal font-normal">
                    손실 제한 지지선. 가격 상승 시 고점에 비례해 자동으로 올라 수익을 실현하는 <span className="text-amber-400">트레일링 스탑</span>이 적용됩니다.
                  </div>
                </p>
                <p className="text-sm font-black text-rose-500 font-mono">
                  {formatPrice(stopPrice)}
                </p>
                {isTrailing && (
                  <p className="text-[7px] text-amber-500 font-bold uppercase mt-0.5 animate-pulse">
                    Trailing Active
                  </p>
                )}
              </div>
              {viewMode === 'grid' && (
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Held</p>
                  <p className="text-sm font-black text-slate-500 font-mono">
                    {daysHeld}d
                  </p>
                </div>
              )}
              {viewMode === 'grid' && (
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5 flex items-center gap-1 group/kelly relative cursor-help">
                    Kelly %
                    <HelpCircle className="w-2.5 h-2.5 opacity-50" />
                    <div className="absolute bottom-full left-0 mb-1 w-48 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/kelly:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed normal-case tracking-normal font-normal">
                      수익성(승률)과 손익비를 수학적으로 계산한 추천 투자 비중. 안정성을 위해 <span className="text-indigo-400">Quarter-Kelly</span>가 적용되었습니다.
                    </div>
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-sm font-black text-indigo-500 font-mono">
                      {kellyWeight}%
                    </p>
                    {action === 'TIME_STOP' && (
                      <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse whitespace-nowrap">
                        Time Stop
                      </span>
                    )}
                    {action === 'EXIT' && (
                      <span className="text-[8px] bg-rose-500/10 text-rose-500 px-1 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse whitespace-nowrap">
                        Exit
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Current</p>
              <p className={`text-2xl font-black font-mono ${isProfit ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'}`}>
                {formatPrice(stock.price)}
              </p>
            </div>
          </div>

          {/* Performance Chart & Metrics Area */}
          {viewMode === 'grid' && (
            <div className="mt-4 space-y-3">
              <div className="h-20 w-full relative group/chart">
                {(() => {
                  const hasHistory = stock.history && stock.history.length > 0;
                  const sortedHistory = hasHistory && stock.history ? [...stock.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : [];
                  
                  const itemAddedDate = new Date(item.addedAt);
                  itemAddedDate.setHours(0, 0, 0, 0);
                  
                  const relevantHistory = sortedHistory.filter(h => {
                      const hDate = new Date(h.date);
                      hDate.setHours(0, 0, 0, 0);
                      return hDate.getTime() >= itemAddedDate.getTime() - (24 * 60 * 60 * 1000);
                  });

                  const color = isProfit ? '#10b981' : '#f43f5e';
                  
                  if (relevantHistory.length < 2) {
                     return (
                       <div className="w-full h-full min-h-[80px] flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                             Chart Data Collecting...
                          </span>
                       </div>
                     );
                  }
                  
                  let chartData = relevantHistory.map(point => {
                    const ret = ((point.price / referencePrice) - 1) * 100;
                    return {
                      name: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                      val: ret,
                      price: point.price
                    };
                  });

                  return (
                    <div className="w-full h-full min-h-[80px]">
                      <ResponsiveContainer width="100%" height={80}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id={`color-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={color} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <YAxis domain={['dataMin', 'dataMax']} hide />
                          <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" strokeDasharray="3 3" />
                          <Area 
                            type="monotone" 
                            dataKey="val" 
                            stroke={color} 
                            strokeWidth={2}
                            fillOpacity={1}
                            fill={`url(#color-${item.ticker})`}
                            isAnimationActive={true}
                          />
                          <RechartsTooltip
                              content={({ active, payload }: any) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    const pColor = data.val >= 0 ? 'text-emerald-500' : 'text-rose-500';
                                    return (
                                        <div className="bg-white border border-slate-200 p-2 rounded shadow-xl text-[10px] font-mono z-50 pointer-events-none">
                                            <p className="font-bold text-slate-500 mb-0.5">{data.name}</p>
                                            <p className="font-black text-slate-900">{formatPrice(data.price)}</p>
                                            <p className={`font-bold ${pColor}`}>
                                                {data.val >= 0 ? '+' : ''}{data.val.toFixed(2)}%
                                            </p>
                                        </div>
                                    );
                                  }
                                  return null;
                              }}
                              cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>

              {/* Status Badges - Now Always Visible */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="bg-white/90 px-2 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1 text-[10px] font-black font-mono">
                  {isProfit ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-rose-500" />}
                  <span className={isProfit ? 'text-emerald-500' : 'text-rose-500'}>
                    {isProfit ? '+' : ''}{currentReturnPct.toFixed(2)}%
                  </span>
                  <span className="text-[8px] text-slate-400 ml-1 uppercase">ROI</span>
                </div>
                
                <div className="bg-white/90 px-2 py-1 rounded-md border border-amber-500/20 shadow-sm flex items-center gap-1 text-[10px] font-black font-mono group/dnapp relative cursor-help">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span className="text-slate-900">{item.initialDnaScore ? `${Math.round(item.initialDnaScore)}%` : 'MANUAL'}</span>
                  <span className="text-[8px] text-slate-400 ml-1 uppercase underline decoration-amber-500/30 underline-offset-2 tracking-tighter">DNA MATCH</span>
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/dnapp:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed font-normal normal-case tracking-normal hidden sm:block">
                    <span className="text-amber-400 font-bold">Initial DNA Match:</span> 관심목록에 최초 등록될 당시 스캐너가 측정한 퀀트 잠재력 점수 (Fixed)
                  </div>
                </div>

                <div className="bg-white/90 px-2 py-1 rounded-md border border-emerald-500/20 shadow-sm flex items-center gap-1 text-[10px] font-black font-mono group/er relative cursor-help">
                  <Activity className="w-3 h-3 text-emerald-500" />
                  <span className="text-slate-900">ER {efficiencyRatio}</span>
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 text-white text-[8px] p-2 rounded shadow-xl opacity-0 group-hover/er:opacity-100 transition-opacity z-50 pointer-events-none leading-relaxed font-normal normal-case tracking-normal">
                    <span className="text-emerald-400 font-bold">Efficiency Ratio:</span> 추세 순도. 1.0에 가까울수록 잡음 없이 깔끔하고 강력한 상승 추세임을 의미합니다.
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {viewMode === 'list' && (
            <div className="flex items-center gap-8 ml-auto">
               {/* Numerical Data Group */}
               <div className="hidden xl:flex items-center gap-6 border-r border-slate-100 pr-6">
                 <div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Entry</p>
                    <p className="text-sm font-black text-slate-700 font-mono">{formatPrice(item.buyPrice)}</p>
                 </div>
                 <div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Target</p>
                    <p className="text-sm font-black text-[#0176d3] font-mono">{formatPrice(targetPrice)}</p>
                 </div>
                 <div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Stop</p>
                    <p className="text-sm font-black text-rose-500 font-mono">{formatPrice(stopPrice)}</p>
                 </div>
               </div>

               {/* Score & Decay & Stats Group */}
               <div className="flex items-center gap-4 min-w-[320px] justify-end">
                  {/* DNA Match Badge (Fixed) */}
                  <div className="flex items-center gap-1 bg-amber-500/5 text-amber-600 px-2.5 py-1.5 rounded-lg border border-amber-500/10 text-[10px] font-bold">
                    <Zap className="w-3 h-3 fill-current" />
                    {item.initialDnaScore ? `${Math.round(item.initialDnaScore)}%` : 'MANUAL'} MATCH
                  </div>

                  {/* Trade Health Badge */}
                  <div className="flex flex-col items-end min-w-[100px]">
                    <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-600 px-2.5 py-1.5 rounded-lg text-[10px] font-black tracking-widest border border-indigo-500/20 whitespace-nowrap">
                       <ShieldCheck className="w-3 h-3" />
                       {dnaScore}% HEALTH
                     </div>
                     {timePenalty > 0 && (
                       <span className="text-[8px] text-rose-400 font-bold mt-1 opacity-80 flex items-center gap-1">
                         <TrendingDown className="w-2 h-2" /> {timePenalty.toFixed(0)}pt Decay
                       </span>
                     )}
                  </div>

                  {/* ROI Badge */}
                  <div className={clsx(
                    "flex flex-col items-end min-w-[80px] p-2 rounded-lg border",
                    isProfit ? "bg-emerald-50/50 border-emerald-100" : "bg-rose-50/50 border-rose-100"
                  )}>
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Total ROI</p>
                    <p className={`text-sm font-black font-mono flex items-center gap-1 ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {isProfit ? '+' : ''}{currentReturnPct.toFixed(2)}%
                    </p>
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
    </motion.div>
  );
};
