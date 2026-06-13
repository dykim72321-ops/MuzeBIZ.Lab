import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { getWatchlist, removeFromWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { 
  fetchMultipleStocksOptimized
} from '../services/stockService';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { WatchlistItemCard } from '../components/watchlist/WatchlistItemCard';
import { WatchlistHeader } from '../components/watchlist/WatchlistHeader';
import { WatchlistEmptyState } from '../components/watchlist/WatchlistEmptyState';
import type { Stock } from '../types';

export const WatchlistPage = () => {
  const navigate = useNavigate();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // 🆕 Silent refresh state
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Terminal Modal State
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [addLoading, setAddLoading] = useState(false); // 🆕 Ticker adding state

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const items = await getWatchlist();
      setWatchlistItems(items);
      
      if (items.length > 0) {
        const tickers = items.map(i => i.ticker);
        const now = new Date();
        const earliestDate = items.reduce((earliest, item) => {
          const itemDate = new Date(item.addedAt);
          return itemDate < earliest ? itemDate : earliest;
        }, now);
        
        const diffDays = Math.ceil(Math.abs(now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) + 5;
        const historyRange = diffDays <= 5 ? '5d' : diffDays <= 30 ? '1mo' : diffDays <= 90 ? '3mo' : '1y';
        
        const enrichedStocks = await fetchMultipleStocksOptimized(tickers, historyRange);
        
        setStocks(enrichedStocks);
      }
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // 🆕 Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadData]);

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
      const inputElement = e.currentTarget;
      if (val) {
        setAddLoading(true);
        try {
          // 🆕 Step 1: Fetch current price first to use as buyPrice
          const { fetchStockQuote } = await import('../services/stockService');
          const stockData = await fetchStockQuote(val);
          
          const initialPrice = stockData?.price;
          const initialDna = stockData?.dnaScore;

          // 🆕 Step 2: Add with captured price
          await addToWatchlist(
            val, 
            undefined, 
            'WATCHING', 
            initialPrice, 
            undefined, 
            undefined, 
            initialDna
          );
          
          inputElement.value = '';
          loadData(true);
        } catch (err) {
          console.error('Failed to add ticker:', err);
          alert(`종목 추가 실패: ${val}. 유효한 티커인지 확인해 주세요.`);
        } finally {
          setAddLoading(false);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 relative overflow-hidden pb-12">
      {/* Terminal Grid Overlay */}
      <div className="absolute inset-0 opacity-[0.4] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Ambient Glows */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-500/5 blur-[120px] rounded-full translate-x-1/2 translate-y-1/2 pointer-events-none" />

      {/* 🆕 Global Refresh Indicator */}
      {isRefreshing && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-white/90 backdrop-blur-xl px-4 py-2.5 rounded-xl border border-slate-100 shadow-xl animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">오빗 감시 동기화 중...</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 relative z-10">
        <WatchlistHeader 
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-48 gap-8">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
              <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-400 animate-pulse" />
            </div>
            <p className="font-black text-[10px] text-slate-500 tracking-[0.4em] uppercase animate-pulse">모니터링 오빗 시스템 초기화 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={addLoading ? "opacity-50 pointer-events-none transition-opacity" : ""}>
            <WatchlistEmptyState 
              onAddTicker={handleAddTicker}
              onNavigateScanner={() => navigate('/scanner')}
            />
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
          }>
            <AnimatePresence>
              {filteredItems.map((item) => (
                <WatchlistItemCard 
                  key={item.ticker} 
                  item={item} 
                  stock={getStock(item.ticker)} 
                  viewMode={viewMode}
                  onRemove={handleRemove}
                  onDeepDive={(data) => setTerminalData(data)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {terminalData && (
        <StockTerminalModal 
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
          onAddToWatchlist={async () => {
            try {
              await addToWatchlist(
                terminalData.ticker, 
                undefined, 
                'WATCHING', 
                terminalData.price, 
                undefined, 
                undefined, 
                terminalData.dnaScore
              );
              loadData();
            } catch (err) {
              console.error('Failed to update/add to watchlist:', err);
            }
          }}
        />
      )}
    </div>
  );
};
