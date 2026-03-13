import { supabase } from '../lib/supabase';

export type WatchlistStatus = 'WATCHING' | 'HOLDING' | 'EXITED';

export interface WatchlistItem {
  ticker: string;
  addedAt: string;
  notes?: string;
  status: WatchlistStatus;
  buyPrice?: number;
  targetProfit?: number;
  stopLoss?: number;
}

/**
 * Get all watchlist items from Supabase
 */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching watchlist:', error);
    return [];
  }

  return data.map(item => ({
    ticker: item.ticker,
    addedAt: item.created_at,
    notes: item.notes,
    status: (item.status as WatchlistStatus) || 'WATCHING',
    buyPrice: item.buy_price ? Number(item.buy_price) : undefined,
    targetProfit: item.target_profit ? Number(item.target_profit) : undefined,
    stopLoss: item.stop_loss ? Number(item.stop_loss) : undefined,
  }));
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
  stopLoss?: number
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const payload: any = {
      ticker: ticker.toUpperCase(),
      user_id: user?.id,
      notes,
      status,
  };
  
  if (buyPrice !== undefined) payload.buy_price = buyPrice;
  if (targetProfit !== undefined) payload.target_profit = targetProfit;
  if (stopLoss !== undefined) payload.stop_loss = stopLoss;

  const { error } = await supabase
    .from('watchlist')
    .upsert(payload);

  if (error) {
    console.error('Error adding to watchlist:', error);
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
  stopLoss?: number
): Promise<boolean> {
  const inWatchlist = await isInWatchlist(ticker);
  if (inWatchlist) {
    await removeFromWatchlist(ticker);
    return false;
  } else {
    await addToWatchlist(ticker, undefined, 'WATCHING', buyPrice, targetProfit, stopLoss);
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
