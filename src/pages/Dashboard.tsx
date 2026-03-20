import { motion } from 'framer-motion';
import { Server, BarChart3, Rocket } from 'lucide-react';
import clsx from 'clsx';
import { useMarketEngine } from '../hooks/useMarketEngine';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { BacktestChart } from '../components/ui/BacktestChart';
import { MarketCommandHeader } from '../components/layout/MarketCommandHeader';
import { processSignal } from '../utils/signalProcessor';

/**
 * Dashboard (작전 지휘소)
 * - 실시간 퀀트 시그널 통합 모니터링
 * - 시스템 성능 지표 및 하이브리드 헌팅 제어
 */
export const Dashboard = () => {
  const { pulseMap, isConnected, lastUpdatedTicker, isHunting, huntStatus, triggerHunt } = useMarketEngine();
  
  // 전체 종목 맵 중 BUY 시그널만 필터링
  const buyTickers = Object.keys(pulseMap).filter(
    (t) => pulseMap[t].signal === 'BUY'
  );
  const allTickers = Object.keys(pulseMap);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 bg-slate-50 min-h-screen">
      
      {/* 1. 통합 헤더 */}
      <MarketCommandHeader 
        title="작전 지휘소"
        subtitle="실시간 시장 감시 및 AI 퀀트 발굴 시스템 | Command Center"
        isConnected={isConnected}
        isHunting={isHunting}
        huntStatus={huntStatus}
        onTriggerHunt={triggerHunt}
      />

      {/* 2. 핵심 지표 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-7 h-7 text-emerald-600 font-black flex items-center justify-center text-xs">MDD</div>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">시스템 방어력</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tabular-nums">-2.95%</span>
              <span className="text-xs font-bold text-emerald-600">vs MKT -29.1%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">퀀트 엔진 백테스트 기준</p>
          </div>
        </div>

        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-100">
            <div className="w-7 h-7 text-purple-600 font-black flex items-center justify-center text-xs">WIN</div>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">엔진 승률</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tabular-nums">68.7%</span>
              <span className="text-xs font-bold text-purple-600">PF: 1.14x</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">퀀트 엔진 백테스트 기준</p>
          </div>
        </div>

        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-100">
            <div className="w-7 h-7 text-[#0176d3] font-black flex items-center justify-center text-xs">LIVE</div>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">실시간 포착 종목</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tabular-nums">{buyTickers.length}</span>
              <span className="text-xs font-bold text-[#0176d3]">
                BUY SIGNALS
                {allTickers.length > 0 && (
                  <span className="ml-1 text-slate-400">/ {allTickers.length} SCANNING</span>
                )}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium font-mono uppercase tracking-tighter">Live v4 Pulse Feed</p>
          </div>
        </div>
      </div>

      {/* 3. 실시간 시그널 피드 */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-4">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            퀀트 엔진 포착 및 백테스트 검증
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center h-2 w-32 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#0176d3] w-2/3 shadow-sm"></div>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence Index 67%</span>
          </div>
        </div>

        {buyTickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 shadow-inner">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Server className="w-8 h-8 opacity-30" />
            </div>
            {allTickers.length > 0 ? (
              <>
                <p className="font-bold text-slate-900">현재 BUY 시그널 없음</p>
                <p className="text-sm mt-1 px-3 py-1 bg-slate-100 rounded-md font-black uppercase tracking-tighter text-slate-500">
                  {allTickers.length} TICKERS OBSERVED
                </p>
                <p className="text-xs mt-3 text-slate-400 font-medium text-center">
                  퀀트 엔진이 실시간으로 시장을 스캔하며<br/>최적의 진입 시점을 분석하고 있습니다.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-slate-900">수신된 펄스 시그널이 없습니다.</p>
                <p className="text-sm mt-1">상단의 '하이브리드 헌팅 트리거'를 눌러 시장 스캔을 시작하세요.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {buyTickers.map((ticker) => {
              const rawData = pulseMap[ticker];
              const displaySignal = processSignal(rawData);

              const cardData = {
                dna_score: displaySignal.dnaScore,
                bull_case: displaySignal.bullPoints.join(", "),
                bear_case: displaySignal.bearPoints.join(", "),
                reasoning_ko: displaySignal.reasoning,
                tags: displaySignal.tags
              };

              return (
                <motion.div 
                  key={ticker} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    "flex flex-col gap-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm transition-all hover:shadow-xl hover:border-blue-200",
                    lastUpdatedTicker === ticker && "ring-2 ring-blue-500 ring-offset-4 animate-pulse"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <Rocket className="w-6 h-6 text-[#0176d3]" />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black tracking-tighter text-slate-900">{ticker}</h3>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mt-0.5">Quantum Buy Signal</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1.5 rounded-md text-sm font-black bg-slate-900 text-white shadow-lg">
                        RSI: {rawData.rsi?.toFixed(1) || '-'}
                      </span>
                    </div>
                  </div>
                  
                  {/* 시그널 렌더링 카드 */}
                  <QuantSignalCard data={cardData} />
                  
                  {/* 백테스트 차트 */}
                  <div className="h-80 w-full mt-2 rounded-xl border border-slate-100 overflow-hidden bg-slate-50/50 p-4 shadow-inner">
                    <BacktestChart ticker={ticker} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}