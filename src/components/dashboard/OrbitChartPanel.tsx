import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import { X, ShieldAlert, Fingerprint, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { WatchlistItem } from '../../services/watchlistService';

interface OrbitChartPanelProps {
  item: WatchlistItem;
  currentDna: number;
  onClose: () => void;
}

interface ChartPoint {
  date: string;
  price: number;
  trailingStop: number;
  high: number;
  low: number;
}

// Chandelier Exit: highest_price_since_entry * (1 - trail%)
// 페니주(≤$1): 12% trail, 일반주(>$1): 8% trail
function calcChandelierExit(
  data: { price: number; high: number }[],
  entryPrice: number,
  isPenny: boolean
): number[] {
  const trail = isPenny ? 0.12 : 0.08;
  let highest = entryPrice;
  return data.map((d) => {
    highest = Math.max(highest, d.high || d.price);
    return parseFloat((highest * (1 - trail)).toFixed(4));
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const price = payload.find((p: any) => p.dataKey === 'price')?.value;
  const stop = payload.find((p: any) => p.dataKey === 'trailingStop')?.value;
  return (
    <div className="bg-[#0d1527]/90 border border-white/10 backdrop-blur-xl rounded-xl p-3 text-xs font-bold shadow-2xl text-white font-mono">
      <div className="text-slate-400 mb-1.5 tracking-widest">{label}</div>
      {price && <div className="text-slate-300">Price: <span className="text-indigo-400 font-semibold">${price.toFixed(2)}</span></div>}
      {stop && <div className="text-rose-400 mt-0.5 font-semibold">Stop: ${stop.toFixed(2)}</div>}
      {price && stop && (
        <div className={clsx('mt-1 uppercase tracking-widest font-black', price > stop ? 'text-emerald-450' : 'text-rose-450')}>
          {price > stop ? '▲ Above Stop' : '▼ SELL SIGNAL'}
        </div>
      )}
    </div>
  );
};

export const OrbitChartPanel = ({ item, currentDna, onClose }: OrbitChartPanelProps) => {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(false);
      try {
        // addedAt 날짜부터 오늘까지 일봉 데이터
        const addedTs = Math.floor(new Date(item.addedAt).getTime() / 1000);
        const nowTs = Math.floor(Date.now() / 1000);
        const url = `/yahoo-api/v8/finance/chart/${item.ticker}?period1=${addedTs}&period2=${nowTs}&interval=1d`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Yahoo API error');
        const json = await res.json();
        const result = json?.chart?.result?.[0];

        if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
          setError(true);
          return;
        }

        const { close, high, low } = result.indicators.quote[0];
        const timestamps: number[] = result.timestamp;
        const entryPrice = item.buyPrice || close[0] || 1;
        const isPenny = entryPrice <= 1.0; // CLAUDE.md 명세에 맞춰 ≤ 1.0 으로 판정

        const raw = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            price: close[i] ?? null,
            high: high[i] ?? close[i] ?? null,
            low: low[i] ?? close[i] ?? null,
          }))
          .filter((d) => d.price !== null) as { date: string; price: number; high: number; low: number }[];

        const stops = calcChandelierExit(raw, entryPrice, isPenny);

        setChartData(
          raw.map((d, i) => ({ ...d, trailingStop: stops[i] }))
        );
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [item.ticker, item.addedAt, item.buyPrice]);

  // DNA 일치률: 현재 DNA / 최초 DNA × 100
  const initialDna = item.initialDnaScore || 50;
  const dnaMatchRate = Math.min(150, Math.round((currentDna / initialDna) * 100));
  const dnaStatus =
    dnaMatchRate >= 100 ? 'ALPHA_HELD' :
    dnaMatchRate >= 75  ? 'WEAKENING' : 'SIGNAL_LOST';

  // 현재 매도 시그널 여부
  const latestPoint = chartData[chartData.length - 1];
  const isSellSignal = latestPoint && latestPoint.price < latestPoint.trailingStop;

  // 수익률
  const entryPrice = item.buyPrice || chartData[0]?.price;
  const currentPrice = latestPoint?.price;
  const pnlPct = entryPrice && currentPrice
    ? ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)
    : null;

  // Y축 도메인
  const yDomain = useMemo(() => {
    if (!chartData.length) return ['auto', 'auto'];
    const allValues = chartData.flatMap((d) => [d.price, d.trailingStop]);
    const min = Math.min(...allValues) * 0.97;
    const max = Math.max(...allValues) * 1.03;
    return [parseFloat(min.toFixed(2)), parseFloat(max.toFixed(2))];
  }, [chartData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="dark-glass-panel border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl mt-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-5 h-5 text-indigo-400 animate-pulse" />
          <div>
            <span className="text-base font-black text-white uppercase tracking-widest font-mono">{item.ticker}</span>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-0.5 font-mono">
              추적 시작: {new Date(item.addedAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stat Strip */}
      <div className="grid grid-cols-3 gap-0 border-b border-white/10 divide-x divide-white/10">
        {/* P&L */}
        <div className="px-5 py-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 font-mono">수익률 (진입 대비)</span>
          {pnlPct !== null ? (
            <div className={clsx('text-2xl font-black font-mono', parseFloat(pnlPct) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {parseFloat(pnlPct) >= 0 ? '+' : ''}{pnlPct}%
            </div>
          ) : (
            <div className="text-slate-400 text-sm font-bold font-mono">--</div>
          )}
        </div>
        {/* 매도 시그널 */}
        <div className="px-5 py-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 font-mono">Chandelier Exit</span>
          {loading ? (
            <div className="text-slate-400 text-sm font-bold font-mono">--</div>
          ) : isSellSignal ? (
            <div className="flex items-center gap-1.5 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-base font-black uppercase tracking-widest font-mono">SELL</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-base font-black uppercase tracking-widest font-mono">HOLD</span>
            </div>
          )}
        </div>
        {/* DNA 일치률 */}
        <div className="px-5 py-4 font-mono">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">DNA 일치률</span>
          <div className={clsx(
            'text-2xl font-black',
            dnaStatus === 'ALPHA_HELD' ? 'text-indigo-400' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-400' : 'text-rose-450'
          )}>
            {dnaMatchRate}%
          </div>
          <span className={clsx(
            'text-xs font-bold uppercase tracking-widest block mt-0.5',
            dnaStatus === 'ALPHA_HELD' ? 'text-indigo-400/80' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-400/80' : 'text-rose-450/80'
          )}>
            {dnaStatus === 'ALPHA_HELD' ? 'Alpha Maintained' :
             dnaStatus === 'WEAKENING'  ? 'Signal Weakening' : 'Signal Lost'}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        {loading ? (
          <div className="h-52 flex items-center justify-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] animate-pulse font-mono">
              차트 데이터 로딩 중...
            </div>
          </div>
        ) : error || chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] font-mono">
              데이터를 불러올 수 없습니다
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4 text-xs font-bold uppercase tracking-widest font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-indigo-500 rounded" />
                <span className="text-slate-400">Price</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-rose-500 rounded border-dashed" style={{ borderTop: '2px dashed' }} />
                <span className="text-slate-400">Chandelier Stop</span>
              </div>
              {entryPrice && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-slate-700 rounded" />
                  <span className="text-slate-450">Entry ${Number(entryPrice).toFixed(2)}</span>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                {entryPrice && (
                  <ReferenceLine
                    y={entryPrice}
                    stroke="#475569"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill={`url(#priceGrad-${item.ticker})`}
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366f1' }}
                />
                <Line
                  type="monotone"
                  dataKey="trailingStop"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                />
                <defs>
                  <linearGradient id={`priceGrad-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* DNA 일치률 바 */}
      <div className="px-6 pb-6 font-mono">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            DNA 일치률 ({initialDna} → {currentDna})
          </span>
          <span className={clsx(
            'text-xs font-bold',
            dnaStatus === 'ALPHA_HELD' ? 'text-indigo-400' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-400' : 'text-rose-450'
          )}>
            {dnaMatchRate}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(dnaMatchRate, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={clsx(
              'h-full rounded-full',
              dnaStatus === 'ALPHA_HELD' ? 'bg-indigo-500' :
              dnaStatus === 'WEAKENING'  ? 'bg-amber-450' :
              'bg-rose-450'
            )}
          />
        </div>
      </div>
    </motion.div>
  );
};
