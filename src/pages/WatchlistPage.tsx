import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { getWatchlist, removeFromWatchlist, addToWatchlist, cleanupExitedItems, type WatchlistItem } from '../services/watchlistService';
import {
  fetchMultipleStocksOptimized
} from '../services/stockService';
import { supabase } from '../lib/supabase';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { WatchlistItemCard } from '../components/watchlist/WatchlistItemCard';
import { WatchlistHeader } from '../components/watchlist/WatchlistHeader';
import { WatchlistEmptyState } from '../components/watchlist/WatchlistEmptyState';
import type { Stock } from '../types';

// WATCHING 상태 종목의 DNA 자동 제거 임계값
const DNA_AUTO_REMOVE_THRESHOLD = 40;

export const WatchlistPage = () => {
  const navigate = useNavigate();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // DNA ≤ 40 자동 삭제 알림 (5초 표시 후 사라짐)
  const [autoRemovedTickers, setAutoRemovedTickers] = useState<string[]>([]);

  // Terminal Modal State
  const [terminalData, setTerminalData] = useState<any | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // unmount 후 state 업데이트 방지용 ref
  const isMountedRef = useRef(false);
  // cleanup에서 guard 타이머를 정리할 수 있도록 ref로 보관
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRemovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    // 20초 안에 완료되지 않으면 로딩 강제 종료 (Python 백엔드 네트워크 타임아웃 방어)
    if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
    guardTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setLoading(false);
      setIsRefreshing(false);
    }, 20000);

    try {
      const items = await getWatchlist();
      if (!isMountedRef.current) return;
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
        if (!isMountedRef.current) return;

        // WATCHING 종목 중 DNA ≤ 40인 항목 자동 삭제 (관심종목 누적 방지 + 로딩 단축)
        const weakTickers = enrichedStocks
          .filter(s => {
            const item = items.find(i => i.ticker === s.ticker);
            return item?.status === 'WATCHING' && typeof s.dnaScore === 'number' && s.dnaScore <= DNA_AUTO_REMOVE_THRESHOLD;
          })
          .map(s => s.ticker);

        if (weakTickers.length > 0) {
          await Promise.allSettled(weakTickers.map(t => removeFromWatchlist(t)));
          if (!isMountedRef.current) return;
          // 5초 알림 표시
          if (autoRemovedTimerRef.current) clearTimeout(autoRemovedTimerRef.current);
          setAutoRemovedTickers(weakTickers);
          autoRemovedTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setAutoRemovedTickers([]);
          }, 5000);
        }

        setWatchlistItems(prev => prev.filter(i => !weakTickers.includes(i.ticker)));
        setStocks(enrichedStocks.filter(s => !weakTickers.includes(s.ticker)));
      }
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    } finally {
      if (guardTimerRef.current) {
        clearTimeout(guardTimerRef.current);
        guardTimerRef.current = null;
      }
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    // EXITED 누적 행 즉시 DB 삭제 (백엔드 3일 주기 정리보다 빠른 프론트 선제 정리)
    cleanupExitedItems();
    loadData();

    const interval = setInterval(() => {
      loadData(true);
    }, 30000);

    // Realtime: EXITED 전환 즉시 제거
    const channel = supabase
      .channel('watchlist-orbit')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'watchlist' },
        (payload) => {
          const updated = payload.new as { ticker: string; status: string };
          if (updated.status === 'EXITED') {
            setWatchlistItems(prev => prev.filter(i => i.ticker !== updated.ticker));
            setStocks(prev => prev.filter(s => s.ticker !== updated.ticker));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'watchlist' },
        (payload) => {
          const deleted = payload.old as { ticker: string };
          if (deleted?.ticker) {
            setWatchlistItems(prev => prev.filter(i => i.ticker !== deleted.ticker));
            setStocks(prev => prev.filter(s => s.ticker !== deleted.ticker));
          }
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      if (guardTimerRef.current) {
        clearTimeout(guardTimerRef.current);
        guardTimerRef.current = null;
      }
      if (autoRemovedTimerRef.current) {
        clearTimeout(autoRemovedTimerRef.current);
        autoRemovedTimerRef.current = null;
      }
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
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
    <div className="min-h-screen bg-slate-50 text-slate-800 relative overflow-hidden pb-12 font-sans">
      {/* Decorative Grid Background Overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Global Refresh Indicator */}
      {isRefreshing && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xl animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-[0.2em] font-mono">오빗 감시 동기화 중...</span>
        </div>
      )}

      {/* DNA ≤ 40 자동 삭제 알림 */}
      {autoRemovedTickers.length > 0 && (
        <div className="fixed top-24 right-8 z-[100] flex items-center gap-3 bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-200 shadow-xl animate-in fade-in slide-in-from-top-4">
          <div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
          <span className="text-xs font-bold text-amber-700 font-mono">
            DNA ≤ 40 자동 제거: {autoRemovedTickers.join(', ')}
          </span>
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
              <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-500 animate-pulse" />
            </div>
            <p className="font-bold text-xs text-slate-500 tracking-[0.4em] uppercase animate-pulse">모니터링 오빗 시스템 초기화 중...</p>
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
          data={{
            ...terminalData,
            formulaVerdict: terminalData.formulaVerdict || "",
          }}
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
