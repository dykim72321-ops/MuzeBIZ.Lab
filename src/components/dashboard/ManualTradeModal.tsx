import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  DollarSign, 
  TrendingUp, 
  Target
} from 'lucide-react';
import clsx from 'clsx';
import { executeManualOrder, fetchTechnicalAnalysis } from '../../services/pythonApiService';
import { toast } from 'sonner';

interface ManualTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTicker?: string;
  onSuccess?: () => void;
}

export const ManualTradeModal = ({ 
  isOpen, 
  onClose, 
  initialTicker = '', 
  onSuccess 
}: ManualTradeModalProps) => {
  const [ticker, setTicker] = useState(initialTicker);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (initialTicker) setTicker(initialTicker);
  }, [initialTicker]);

  useEffect(() => {
    if (ticker && ticker.length >= 1) {
      const fetchPrice = async () => {
        setIsFetchingPrice(true);
        try {
          const data = await fetchTechnicalAnalysis(ticker.toUpperCase(), '1d');
          if (data && data.current_price) {
            setCurrentPrice(data.current_price);
            if (orderType === 'LIMIT' && limitPrice === 0) {
              setLimitPrice(data.current_price);
            }
          }
        } catch (e) {
          console.warn('Failed to fetch price for', ticker);
        } finally {
          setIsFetchingPrice(false);
        }
      };
      
      const timer = setTimeout(fetchPrice, 800);
      return () => clearTimeout(timer);
    } else {
      setCurrentPrice(null);
    }
  }, [ticker, orderType]); // Added orderType to dependencies if needed, though not strictly necessary for price fetch

  const estimatedTotal = currentPrice ? (currentPrice * quantity) : (orderType === 'LIMIT' ? limitPrice * quantity : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker) {
      toast.error('티커를 입력하세요');
      return;
    }
    if (quantity <= 0) {
      toast.error('수량을 입력하세요');
      return;
    }
    if (orderType === 'LIMIT' && limitPrice <= 0) {
      toast.error('지정가를 입력하세요');
      return;
    }

    setLoading(true);
    const toastId = toast.loading(`[${side}] ${ticker.toUpperCase()} 주문 전송 중...`);

    try {
      const result = await executeManualOrder({
        ticker: ticker.toUpperCase(),
        side: side.toLowerCase() as 'buy' | 'sell',
        quantity: quantity,
        type: orderType.toLowerCase() as 'market' | 'limit',
        price: orderType === 'LIMIT' ? limitPrice : undefined
      });

      if (result.status === 'success') {
        setIsSuccess(true);
        toast.success('주문 성공', {
          description: `${ticker.toUpperCase()} ${quantity}주 ${side} 주문이 접수되었습니다.`,
          id: toastId
        });
        onSuccess?.();
        setTimeout(() => {
          onClose();
          setIsSuccess(false);
        }, 2500);
      } else {
        throw new Error(result.error || '주문 처리 중 오류가 발생했습니다.');
      }
    } catch (error) {
      toast.error('주문 실패', {
        description: error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.',
        id: toastId
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-blue-950/60 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-blue-900 border border-blue-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
        >
          {/* Decorative Gradient */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500" />
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <Target className="w-6 h-6 text-indigo-500" />
                  Manual Tactical Order
                </h2>
                <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest mt-1">Direct Execution Node v4.1</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-blue-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 flex flex-col items-center justify-center text-center space-y-4"
                  >
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                      <ShieldCheck className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">ORDER SECURED</h3>
                      <p className="text-xs text-blue-400 mt-1 uppercase tracking-widest font-bold">전술적 주문이 시장에 전송되었습니다.</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {/* Side Selection */}
                    <div className="grid grid-cols-2 gap-4 p-1.5 bg-black/60 rounded-2xl border border-white/5 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setSide('BUY')}
                        className={clsx(
                          "py-3.5 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group",
                          side === 'BUY' 
                            ? "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]" 
                            : "text-blue-500 hover:text-blue-300 hover:bg-white/5"
                        )}
                      >
                        {side === 'BUY' && <motion.div layoutId="neon-buy" className="absolute inset-0 bg-emerald-400/20 blur-xl px-4" />}
                        <span className="relative z-10 flex items-center justify-center gap-2">
                           <TrendingUp className="w-3.5 h-3.5" />
                           Buy / Long
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSide('SELL')}
                        className={clsx(
                          "py-3.5 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group",
                          side === 'SELL' 
                            ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]" 
                            : "text-blue-500 hover:text-blue-300 hover:bg-white/5"
                        )}
                      >
                         {side === 'SELL' && <motion.div layoutId="neon-sell" className="absolute inset-0 bg-rose-400/20 blur-xl" />}
                        <span className="relative z-10 flex items-center justify-center gap-2">
                           <Target className="w-3.5 h-3.5 rotate-45" />
                           Sell / Short
                        </span>
                      </button>
                    </div>

                    {/* Ticker Input */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-end px-1">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Symbol Ticker</label>
                        {currentPrice && (
                          <span className="text-[10px] font-black text-emerald-500/80 animate-pulse">LIVE MARKET FEED ACTIVE</span>
                        )}
                      </div>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Zap className={clsx("w-4 h-4 transition-colors", ticker ? "text-indigo-400" : "text-blue-600")} />
                        </div>
                        <input
                          type="text"
                          value={ticker}
                          onChange={(e) => setTicker(e.target.value.toUpperCase())}
                          placeholder="e.g. NVDA, AAPL"
                          className={clsx(
                            "w-full bg-black/40 border rounded-2xl py-4.5 pl-12 pr-4 text-white font-black placeholder:text-blue-700 focus:ring-0 transition-all text-xl tracking-tight shadow-inner",
                            ticker ? "border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.05)] bg-indigo-500/5" : "border-blue-800"
                          )}
                        />
                        {isFetchingPrice && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                          </div>
                        )}
                        {currentPrice && !isFetchingPrice && (
                          <motion.div 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 backdrop-blur-sm"
                          >
                            ${currentPrice.toLocaleString()}
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Order Settings Grid */}
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Order Type</label>
                        <div className="relative">
                          <select
                            value={orderType}
                            onChange={(e) => setOrderType(e.target.value as any)}
                            className="w-full bg-black/40 border border-blue-800 rounded-2xl py-4 px-5 text-white font-black focus:border-indigo-500/50 focus:ring-0 transition-all text-sm appearance-none shadow-inner"
                          >
                            <option value="MARKET">Market Execution</option>
                            <option value="LIMIT">Limit Order</option>
                          </select>
                          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none rotate-90" />
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Quantity (Units)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="w-full bg-black/40 border border-blue-800 rounded-2xl py-4 px-5 text-white font-black focus:border-indigo-500/50 focus:ring-0 transition-all text-sm shadow-inner"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Limit Price Input */}
                    {orderType === 'LIMIT' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, scale: 0.95 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.95 }}
                        className="space-y-2.5"
                      >
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Limit Price (USD)</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <DollarSign className="w-4 h-4 text-emerald-500/50" />
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full bg-black/40 border border-emerald-500/20 rounded-2xl py-4.5 pl-12 pr-4 text-white font-black focus:border-emerald-500/50 focus:ring-0 transition-all text-sm shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Transaction Intelligence */}
                    <div className="space-y-3">
                      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 flex gap-4 backdrop-blur-xl">
                        <ShieldCheck className="w-6 h-6 text-indigo-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-[10px] text-blue-400 leading-relaxed font-bold">
                              본 주문은 <span className="text-indigo-400">Standard Risk Protocol</span>을 따릅니다. 
                              시장가 주문 시 슬리피지가 발생할 수 있습니다.
                          </p>
                        </div>
                        {estimatedTotal > 0 && (
                          <div className="text-right shrink-0">
                            <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">Est. Total Cost</p>
                            <p className={clsx(
                              "text-base font-black tracking-tighter",
                              side === 'BUY' ? "text-emerald-500" : "text-rose-500"
                            )}>
                              ${estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className={clsx(
                        "w-full py-5 rounded-[1.25rem] font-black text-sm uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all active:scale-[0.97] shadow-2xl relative overflow-hidden group",
                        side === 'BUY' 
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20" 
                          : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20",
                        loading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          Execute {side} Protocol
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </div>

          {/* Footer Detail */}
          <div className="bg-black/40 p-4 border-t border-blue-800 flex justify-between items-center px-8">
            <span className="text-[9px] font-black text-blue-600 uppercase">Engine Status: Hybrid Active</span>
            <div className="flex gap-4">
              <span className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1">
                <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                Slippage Opt. ON
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
