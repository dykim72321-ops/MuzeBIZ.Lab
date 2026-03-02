import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trash2, Activity, TrendingUp, TrendingDown, Search,
  LayoutGrid, List, Zap, ShieldCheck
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from '../services/watchlistService';
import { fetchMultipleStocks } from '../services/stockService';
import type { Stock } from '../types';

export const WatchlistPage = () => {
  const navigate = useNavigate();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await getWatchlist();
      setWatchlistItems(items);
      
      if (items.length > 0) {
        const tickers = items.map(i => i.ticker);
        const stockData = await fetchMultipleStocks(tickers);
        setStocks(stockData);
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
        <div className="text-center py-40 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Activity className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">관심 종목 리스트가 비어있습니다.</p>
          <button 
            onClick={() => navigate('/scanner')}
            className="mt-6 text-[#0176d3] font-bold hover:underline flex items-center gap-2 mx-auto text-sm"
          >
            새로운 기회 탐색하기 <TrendingUp className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className={viewMode === 'grid' 
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          : "space-y-3"
        }>
          <AnimatePresence>
            {filteredItems.map((item) => {
              const stock = getStock(item.ticker);
              const isPositive = stock && stock.changePercent >= 0;
              
              return (
                <motion.div
                  layout
                  key={item.ticker}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={viewMode === 'grid' ? "" : "w-full"}
                >
                  <Card className={`group relative overflow-hidden transition-all bg-white border border-slate-200 shadow-sm hover:border-[#0176d3]/40 hover:shadow-md ${
                    viewMode === 'grid' ? 'p-6' : 'p-4 flex items-center justify-between'
                  }`}>
                    {/* Background Glow (Subtle for Light Mode) */}
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity bg-gradient-to-br ${
                      isPositive ? 'from-emerald-500' : 'from-rose-500'
                    } to-transparent pointer-events-none`} />

                    <div className={`flex flex-1 ${viewMode === 'grid' ? 'flex-col' : 'items-center gap-6'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border ${
                            isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                          }`}>
                            {item.ticker[0]}
                          </div>
                          <div>
                            <h3 className="font-black text-xl text-slate-900 tracking-tighter">{item.ticker}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[100px]">
                              {stock?.name || 'Loading...'}
                            </p>
                          </div>
                        </div>
                        
                        {viewMode === 'grid' && (
                          <div className="flex items-center gap-2">
                            {stock?.dnaScore && (
                              <div className="flex items-center gap-1 bg-[#0176d3]/10 text-[#0176d3] px-2 py-1 rounded text-[10px] font-black tracking-widest border border-[#0176d3]/20">
                                <ShieldCheck className="w-3 h-3" />
                                {stock.dnaScore}% 정확도
                              </div>
                            )}
                            <button 
                              onClick={() => handleRemove(item.ticker)}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className={`flex items-end justify-between ${viewMode === 'grid' ? '' : 'flex-1'}`}>
                        <div>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Entry Price</p>
                          <p className="text-xl font-black text-slate-400 font-mono line-through opacity-70">
                            {item.entryPrice ? `$${item.entryPrice.toFixed(2)}` : 'N/A'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Current</p>
                          <p className={`text-2xl font-black font-mono ${isPositive ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'}`}>
                            {stock ? `$${stock.price.toFixed(2)}` : '---'}
                          </p>
                        </div>
                      </div>

                      {/* Performance Chart */}
                      {item.entryPrice && stock && viewMode === 'grid' && (
                        <div className="h-20 w-full mt-4 relative">
                          {(() => {
                            const returnPct = ((stock.price / item.entryPrice) - 1) * 100;
                            const isProfit = returnPct >= 0;
                            const color = isProfit ? '#10b981' : '#f43f5e';
                            
                            // Mocking intermediate points for visualization since we don't have full history
                            const data = [
                              { name: 'Entry', val: 0 },
                              { name: 'Mid1', val: returnPct * 0.3 },
                              { name: 'Mid2', val: returnPct * 0.7 },
                              { name: 'Current', val: returnPct }
                            ];

                            return (
                              <>
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={data}>
                                    <defs>
                                      <linearGradient id={`color-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
                                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" strokeDasharray="3 3" />
                                    <Area 
                                      type="monotone" 
                                      dataKey="val" 
                                      stroke={color} 
                                      strokeWidth={3}
                                      fillOpacity={1}
                                      fill={`url(#color-${item.ticker})`}
                                      isAnimationActive={true}
                                      animationDuration={1500}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                                <div className="absolute top-0 left-0 bg-white/80 px-2 py-1 rounded-md backdrop-blur-md border border-slate-200 shadow-sm flex items-center gap-1 text-[10px] font-black font-mono">
                                  {isProfit ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-rose-400" />}
                                  <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                                    {isProfit ? '+' : ''}{returnPct.toFixed(2)}%
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                      
                      {viewMode === 'list' && (
                        <div className="flex items-center gap-4 ml-8">
                           {stock?.dnaScore && (
                              <div className="flex items-center gap-1 bg-[#0176d3]/10 text-[#0176d3] px-2 py-1 rounded-md text-[10px] font-black tracking-widest border border-[#0176d3]/20 whitespace-nowrap">
                                <ShieldCheck className="w-3 h-3" />
                                {stock.dnaScore}% 정확도
                              </div>
                            )}
                           <button 
                            onClick={() => navigate(`/analysis/${item.ticker}`)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-xs font-bold text-slate-700 transition-all"
                          >
                            Analyze
                          </button>
                          <button 
                            onClick={() => handleRemove(item.ticker)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
