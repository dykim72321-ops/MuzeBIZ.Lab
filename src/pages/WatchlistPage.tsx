import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getWatchlist, removeFromWatchlist, addToWatchlist, type WatchlistItem } from '../services/watchlistService';
import { 
  fetchMultipleStocksOptimized,
  fetchStockHistory
} from '../services/stockService';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { WatchlistItemCard } from '../components/watchlist/WatchlistItemCard';
import { WatchlistHeader } from '../components/watchlist/WatchlistHeader';
import { WatchlistEmptyState } from '../components/watchlist/WatchlistEmptyState';
import type { Stock, HistoricalDataPoint } from '../types';

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
        const now = new Date();
        const earliestDate = items.reduce((earliest, item) => {
          const itemDate = new Date(item.addedAt);
          return itemDate < earliest ? itemDate : earliest;
        }, now);
        
        const diffDays = Math.ceil(Math.abs(now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) + 5;
        const historyRange = diffDays <= 5 ? '5d' : diffDays <= 30 ? '1mo' : diffDays <= 90 ? '3mo' : '1y';
        
        const [enrichedStocks, iwmHistory] = await Promise.all([
          fetchMultipleStocksOptimized(tickers, historyRange),
          fetchStockHistory('IWM', 'D', diffDays).catch(() => [])
        ]);
        
        setStocks(enrichedStocks);
        setBenchmarkHistory(iwmHistory || []);
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
        try {
          await addToWatchlist(val, undefined, 'WATCHING', undefined, undefined, undefined);
          e.currentTarget.value = '';
          loadData();
        } catch (err) {
          console.error('Failed to add ticker:', err);
          alert(`종목 추가 실패: ${val}. 데이터베이스 컬럼(initial_dna_score)이 없거나 네트워크 오류일 수 있습니다.`);
        }
      }
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">
      <WatchlistHeader 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-70">
          <div className="w-12 h-12 border-2 border-[#0176d3]/20 border-t-[#0176d3] rounded-full animate-spin" />
          <p className="font-mono text-xs text-slate-500 tracking-widest">SYNCHRONIZING ORBIT...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <WatchlistEmptyState 
          onAddTicker={handleAddTicker}
          onNavigateScanner={() => navigate('/scanner')}
        />
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
                benchmarkHistory={benchmarkHistory}
                viewMode={viewMode}
                onRemove={handleRemove}
                onDeepDive={(data) => setTerminalData(data)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

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
