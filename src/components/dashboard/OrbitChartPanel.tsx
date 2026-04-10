import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import { X, TrendingUp, TrendingDown, ShieldAlert, Fingerprint, AlertTriangle } from 'lucide-react';
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

// Chandelier Exit: highest_price_since_entry * (1 - trail%) — 간소화 버전
// 페니주: 12% trail, 일반주($5↑): 8% trail
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
    <div className="bg-[#0b1120] border border-slate-700/80 rounded-xl p-3 text-[10px] font-black shadow-xl">
      <div className="text-slate-400 mb-1.5 tracking-widest">{label}</div>
      {price && <div className="text-white">Price: <span className="text-cyan-400">${price.toFixed(2)}</span></div>}
      {stop && <div className="text-rose-400 mt-0.5">Stop: ${stop.toFixed(2)}</div>}
      {price && stop && (
        <div className={clsx('mt-1 uppercase tracking-widest', price > stop ? 'text-emerald-400' : 'text-rose-500')}>
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
        const isPenny = entryPrice < 5;

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
      className="bg-[#020617]/95 backdrop-blur-3xl border border-slate-700/60 rounded-[2rem] overflow-hidden shadow-[0_0_60px_rgba(34,211,238,0.06)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-5 h-5 text-cyan-400" />
          <div>
            <span className="text-base font-black text-white uppercase tracking-widest font-mono">{item.ticker}</span>
            <span className="block text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mt-0.5">
              추적 시작: {new Date(item.addedAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stat Strip */}
      <div className="grid grid-cols-3 gap-0 border-b border-slate-800/60 divide-x divide-slate-800/60">
        {/* P&L */}
        <div className="px-5 py-4">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">수익률 (진입 대비)</span>
          {pnlPct !== null ? (
            <div className={clsx('text-xl font-black font-mono', parseFloat(pnlPct) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {parseFloat(pnlPct) >= 0 ? '+' : ''}{pnlPct}%
            </div>
          ) : (
            <div className="text-slate-600 text-sm font-black">--</div>
          )}
        </div>
        {/* 매도 시그널 */}
        <div className="px-5 py-4">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Chandelier Exit</span>
          {loading ? (
            <div className="text-slate-600 text-sm font-black">--</div>
          ) : isSellSignal ? (
            <div className="flex items-center gap-1.5 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-black uppercase tracking-widest">SELL</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-sm font-black uppercase tracking-widest">HOLD</span>
            </div>
          )}
        </div>
        {/* DNA 일치률 */}
        <div className="px-5 py-4">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">DNA 일치률</span>
          <div className={clsx(
            'text-xl font-black font-mono',
            dnaStatus === 'ALPHA_HELD' ? 'text-cyan-400' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-400' : 'text-rose-400'
          )}>
            {dnaMatchRate}%
          </div>
          <span className={clsx(
            'text-[8px] font-black uppercase tracking-widest',
            dnaStatus === 'ALPHA_HELD' ? 'text-cyan-500/60' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-500/60' : 'text-rose-500/60'
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
            <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] animate-pulse">
              차트 데이터 로딩 중...
            </div>
          </div>
        ) : error || chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center">
            <div className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">
              데이터를 불러올 수 없습니다
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4 text-[9px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-cyan-400 rounded" />
                <span className="text-slate-500">Price</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-rose-500 rounded border-dashed" style={{ borderTop: '2px dashed' }} />
                <span className="text-slate-500">Chandelier Stop</span>
              </div>
              {entryPrice && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-slate-500 rounded" />
                  <span className="text-slate-500">Entry ${Number(entryPrice).toFixed(2)}</span>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#475569', fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 9, fill: '#475569', fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                {entryPrice && (
                  <ReferenceLine
                    y={entryPrice}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#22d3ee' }}
                />
                <Line
                  type="monotone"
                  dataKey="trailingStop"
                  stroke="#f43f5e"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                />
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* DNA 일치률 바 */}
      <div className="px-6 pb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            DNA 일치률 ({initialDna} → {currentDna})
          </span>
          <span className={clsx(
            'text-[10px] font-black',
            dnaStatus === 'ALPHA_HELD' ? 'text-cyan-400' :
            dnaStatus === 'WEAKENING'  ? 'text-amber-400' : 'text-rose-400'
          )}>
            {dnaMatchRate}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(dnaMatchRate, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={clsx(
              'h-full rounded-full',
              dnaStatus === 'ALPHA_HELD' ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' :
              dnaStatus === 'WEAKENING'  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
              'bg-rose-500'
            )}
          />
        </div>
      </div>
    </motion.div>
  );
};
