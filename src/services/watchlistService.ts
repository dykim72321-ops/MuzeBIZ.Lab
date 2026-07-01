import { supabase } from '../lib/supabase';

export type WatchlistStatus = 'WATCHING' | 'HOLDING' | 'EXITED';

// timeout 시 빈 배열로 호출자 상태를 덮어쓰지 않도록 마지막 성공 결과를 보존
const watchlistStaleCache: Record<string, WatchlistItem[]> = {};

export interface WatchlistItem {
  ticker: string;
  addedAt: string;
  notes?: string;
  status: WatchlistStatus;
  buyPrice?: number;
  targetProfit?: number;
  stopLoss?: number;
  initialDnaScore?: number;
}

/**
 * Get all watchlist items from Supabase
 */
export async function getWatchlist(includeExited = false): Promise<WatchlistItem[]> {
  let query = supabase
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: false });

  if (!includeExited) {
    query = query.neq('status', 'EXITED');
  }

  // Supabase 프로젝트 pause 상태에서 무한 대기 방지 (10초 타임아웃)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Watchlist query timeout')), 10000)
  );

  const { data, error } = await Promise.race([query, timeoutPromise]).catch((err) => {
    console.error('Watchlist query timed out or failed:', err);
    return { data: null, error: err };
  });

  if (error || !data) {
    const isTimeout = error && String(error.message).includes('timeout');
    if (!isTimeout) {
      console.error('Error fetching watchlist:', error);
    }
    // timeout/오류 시 빈 배열 대신 stale cache 반환 — 호출자 상태 보존
    return watchlistStaleCache[String(includeExited)] ?? [];
  }

  const result = data.map((item: any) => ({
    ticker: item.ticker,
    addedAt: item.created_at,
    notes: item.notes,
    status: (item.status as WatchlistStatus) || 'WATCHING',
    buyPrice: item.buy_price ? Number(item.buy_price) : undefined,
    targetProfit: item.target_profit ? Number(item.target_profit) : undefined,
    stopLoss: item.stop_loss ? Number(item.stop_loss) : undefined,
    initialDnaScore: item.initial_dna_score ? Number(item.initial_dna_score) : undefined,
  }));

  watchlistStaleCache[String(includeExited)] = result;
  return result;
}

/**
 * Check if a stock is in the watchlist
 */
export async function isInWatchlist(ticker: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('ticker', ticker.toUpperCase());

  if (error) {
    console.error('Error checking watchlist:', error);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Add a stock to the watchlist
 */
export async function addToWatchlist(
  ticker: string, 
  notes?: string, 
  status: WatchlistStatus = 'WATCHING', 
  buyPrice?: number,
  targetProfit?: number,
  stopLoss?: number,
  initialDnaScore?: number
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const payload: any = {
      ticker: ticker.toUpperCase(),
      user_id: user?.id,
      notes,
      status,
  };
  
  if (buyPrice !== undefined && !isNaN(buyPrice)) payload.buy_price = buyPrice;
  if (targetProfit !== undefined && !isNaN(targetProfit)) payload.target_profit = targetProfit;
  if (stopLoss !== undefined && !isNaN(stopLoss)) payload.stop_loss = stopLoss;
  if (initialDnaScore !== undefined && !isNaN(initialDnaScore)) payload.initial_dna_score = initialDnaScore;

  const { error } = await supabase
    .from('watchlist')
    .upsert(payload);

  if (error) {
    // 🆕 Graceful Degradation: If 400 error (column missing/NaN), retry without initial_dna_score
    // 42P01: undefined_table, 42703: undefined_column, PGRST204: column not found
    const isSchemaError = error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('column');
    if (isSchemaError) {
      console.warn('Initial DNA Score column may be missing. Retrying without it...', error);
      const fallbackPayload = { ...payload };
      delete fallbackPayload.initial_dna_score;
      
      const { error: retryError } = await supabase
        .from('watchlist')
        .upsert(fallbackPayload);
      
      if (retryError) {
        console.error('Final attempt to add to watchlist failed:', retryError);
        throw retryError;
      }
    } else {
      console.error('Error adding to watchlist:', error);
      throw error;
    }
  }
}

/**
 * Update the status of a watchlist item
 */
export async function updateWatchlistStatus(
  ticker: string, 
  status: WatchlistStatus,
  buyPrice?: number,
  targetProfit?: number,
  stopLoss?: number
): Promise<void> {
  const payload: any = { status };
  if (buyPrice !== undefined) payload.buy_price = buyPrice;
  if (targetProfit !== undefined) payload.target_profit = targetProfit;
  if (stopLoss !== undefined) payload.stop_loss = stopLoss;

  const { error } = await supabase
    .from('watchlist')
    .update(payload)
    .eq('ticker', ticker.toUpperCase());

  if (error) {
    console.error('Error updating watchlist status:', error);
  }
}

/**
 * Remove a stock from the watchlist
 */
export async function removeFromWatchlist(ticker: string): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('ticker', ticker.toUpperCase());

  if (error) {
    console.error('Error removing from watchlist:', error);
  }
}

/**
 * Toggle a stock in/out of the watchlist
 */
export async function toggleWatchlist(
  ticker: string, 
  buyPrice?: number,
  targetProfit?: number,
  stopLoss?: number,
  initialDnaScore?: number
): Promise<boolean> {
  const inWatchlist = await isInWatchlist(ticker);
  if (inWatchlist) {
    await removeFromWatchlist(ticker);
    return false;
  } else {
    await addToWatchlist(ticker, undefined, 'WATCHING', buyPrice, targetProfit, stopLoss, initialDnaScore);
    return true;
  }
}

/**
 * Clear the entire watchlist
 */
export async function clearWatchlist(): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .neq('ticker', ''); // Delete all

  if (error) {
    console.error('Error clearing watchlist:', error);
  }
}

/**
 * EXITED 상태 항목을 DB에서 즉시 삭제 — 누적된 행이 쿼리 부하를 높이는 것을 방지
 */
export async function cleanupExitedItems(): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('status', 'EXITED');
  if (error) console.warn('[Watchlist] cleanupExitedItems failed:', error);
}

/**
 * Auto-cleanup old WATCHING items to maintain performance
 */
export async function cleanupOldWatchlistItems(days: number = 7): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('status', 'WATCHING')
    .lt('created_at', cutoffDate.toISOString());

  if (error) {
    console.error('Error cleaning up old watchlist items:', error);
  }
}

