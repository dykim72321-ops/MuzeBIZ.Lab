import { useMarketEngine } from '../hooks/useMarketEngine';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { BacktestChart } from '../components/ui/BacktestChart';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';
import { MarketCommandHeader } from '../components/layout/MarketCommandHeader';
import { processSignal } from '../utils/signalProcessor';

// ─────────────────────────────────────────────────────────
// NORMAL 강도 전용 미니 카드 (축약형 정보 표시)
// ─────────────────────────────────────────────────────────
const NormalSignalMiniCard = ({ rawData }: { rawData: any }) => {
  const signalIcon = rawData.signal === 'BUY'
    ? <TrendingUp className="w-4 h-4 text-emerald-600" />
    : rawData.signal === 'SELL'
    ? <TrendingDown className="w-4 h-4 text-rose-600" />
    : <Minus className="w-4 h-4 text-slate-400" />;

  const signalColor = rawData.signal === 'BUY' ? 'text-emerald-600' : rawData.signal === 'SELL' ? 'text-rose-600' : 'text-slate-500';

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-1 h-10 bg-slate-200 rounded-full group-hover:bg-blue-400 transition-colors" />
        <div>
          <span className="text-lg font-black text-slate-900 tracking-tight">{rawData.ticker}</span>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase tracking-tighter">
            SYNC: {new Date(rawData.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* RSI */}
        <div className="text-right">
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em]">RSI Matrix</p>
          <p className="font-mono font-black text-base text-slate-700">{rawData.rsi?.toFixed(1) ?? '—'}</p>
        </div>
        {/* Signal */}
        <div className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-black shadow-sm',
          rawData.signal === 'BUY' ? 'bg-emerald-50 border-emerald-100' :
          rawData.signal === 'SELL' ? 'bg-rose-50 border-rose-100' :
          'bg-slate-50 border-slate-200'
        )}>
          {signalIcon}
          <span className={clsx('uppercase tracking-widest', signalColor)}>{rawData.signal}</span>
        </div>
        {/* NORMAL 뱃지 */}
        <span className="text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md tracking-[0.2em] uppercase">
          Standard
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// 메인 대시보드 컴포넌트 (Monitoring Orbit)
// ─────────────────────────────────────────────────────────
const PulseDashboard: React.FC = () => {
  const { pulseMap, isConnected, isHunting, huntStatus, triggerHunt } = useMarketEngine();

  // STRONG / NORMAL 분류
  const allTickers = Object.keys(pulseMap);
  const strongTickers = allTickers.filter(t => pulseMap[t].strength === 'STRONG');
  const normalTickers = allTickers.filter(t => pulseMap[t].strength === 'NORMAL');

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-10 animate-in fade-in duration-700 bg-slate-50 min-h-screen">

      {/* ─── 통합 헤더 (Market Monitoring Orbit) ────────────────── */}
      <MarketCommandHeader 
        title="Quant Pulse"
        subtitle="실시간 퀀트 데이터 스트리밍 및 AI 시그널 터미널 | Terminal"
        isConnected={isConnected}
        isHunting={isHunting}
        huntStatus={huntStatus}
        onTriggerHunt={triggerHunt}
      />

      {/* ─── Empty state ────────────────────────────────────────── */}
      {allTickers.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[50vh] bg-white border-2 border-dashed border-slate-200 rounded-3xl gap-4 text-slate-400 shadow-inner">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-2">
            <TrendingUp className="w-8 h-8 opacity-20" />
          </div>
          <p className="font-black text-xl tracking-tight text-slate-900">백엔드 펄스 엔진 수신 대기 중</p>
          <p className="text-sm font-medium text-center">
            실시간 시장 데이터를 분석하고 있습니다.<br/>
            상단의 '하이브리드 헌팅 트리거'를 눌러 발굴을 가속화하세요.
          </p>
        </div>
      )}

      {/* ─── STRONG 시그널 (풀사이즈 QuantSignalCard) ──────────── */}
      {strongTickers.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-1.5 bg-[#0176d3] rounded-full shadow-sm" />
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                ⚡ STRONG SIGNALS — Intelligence Matrix
              </h2>
            </div>
            <span className="text-[10px] font-black text-white bg-[#0176d3] px-3 py-1 rounded-full shadow-md">
              {strongTickers.length} DETECTED
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-10">
            {strongTickers.map((ticker) => {
              const rawData = pulseMap[ticker];
              const displaySignal = processSignal(rawData);

              const cardData = {
                dna_score: displaySignal.dnaScore,
                bull_case: displaySignal.bullPoints.join(", "),
                bear_case: displaySignal.bearPoints.join(", "),
                reasoning_ko: displaySignal.reasoning,
                tags: displaySignal.tags,
              };

              return (
                <div key={ticker} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-1.5 h-8 bg-indigo-500 rounded-full" />
                      <div>
                        <h2 className="text-3xl font-black tracking-tighter text-slate-900">{ticker}</h2>
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-0.5">Verified Intelligence</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-black text-slate-300 uppercase tracking-tighter">
                      SYNC: {new Date(rawData.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <QuantSignalCard data={cardData} />
                  <div className="mt-8 pt-8 border-t border-slate-100 p-2 bg-slate-50/50 rounded-xl shadow-inner">
                    <BacktestChart ticker={ticker} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── NORMAL 시그널 (미니 카드 목록) ────────────────────── */}
      {normalTickers.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <div className="h-5 w-1 bg-slate-400 rounded-full" />
            <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">
              STANDARD MONITORING GRID
            </h2>
            <span className="text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              {normalTickers.length} TICKERS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {normalTickers.map((ticker) => (
              <NormalSignalMiniCard key={ticker} rawData={pulseMap[ticker]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PulseDashboard;
