import React, { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '../../services/watchlistService';
import clsx from 'clsx';

interface AddToWatchlistBtnProps {
  ticker: string;
  dnaScore?: number;
  variant?: 'icon' | 'full';
  className?: string;
  onStatusChange?: (isAdded: boolean) => void;
}

export const AddToWatchlistBtn: React.FC<AddToWatchlistBtnProps> = ({ 
  ticker, 
  dnaScore,
  variant = 'full', 
  className,
  onStatusChange 
}) => {
  const [inWatchlist, setInWatchlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const watched = await isInWatchlist(ticker);
        setInWatchlist(watched);
      } catch (err) {
        console.error('Error checking watchlist status:', err);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, [ticker]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setActing(true);
    try {
      if (inWatchlist) {
        await removeFromWatchlist(ticker);
        setInWatchlist(false);
        onStatusChange?.(false);
      } else {
        await addToWatchlist(ticker, undefined, 'WATCHING', undefined, undefined, undefined, dnaScore);
        setInWatchlist(true);
        onStatusChange?.(true);
      }
    } catch (err) {
      console.error('Watchlist action failed:', err);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="w-8 h-8 rounded-lg bg-slate-800 animate-pulse" />;
  }

  return (
    <button
      onClick={handleToggle}
      disabled={acting}
      className={clsx(
        'group flex items-center justify-center gap-2 rounded-lg transition-all',
        variant === 'icon' ? 'p-2' : 'px-4 py-2 font-medium text-sm',
        inWatchlist 
          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
          : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500',
        className
      )}
    >
      {acting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Star 
          className={clsx(
            'w-4 h-4 transition-transform group-active:scale-95',
            inWatchlist && 'fill-current'
          )} 
        />
      )}
      {variant === 'full' && (
        <span>{inWatchlist ? 'Watchlist' : 'Add Watchlist'}</span>
      )}
    </button>
  );
};
