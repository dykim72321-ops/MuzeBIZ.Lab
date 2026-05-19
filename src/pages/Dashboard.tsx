import { motion } from 'framer-motion';
import { Server, BarChart3, Rocket, TrendingUp, TrendingDown, Minus, Zap, Activity } from 'lucide-react';
import clsx from 'clsx';
import { useMarketEngine } from '../hooks/useMarketEngine';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { PortfolioStatus } from '../components/ui/PortfolioStatus';
import { CommandSettings } from '../components/dashboard/CommandSettings';
import { MarketCommandHeader } from '../components/layout/MarketCommandHeader';
import { processSignal } from '../utils/signalProcessor';
import { useStrategyStats } from '../hooks/useStrategyStats';
import { useState, useEffect, useMemo } from 'react';

// NORMAL 강도 전용 미니 카드 (PulseDashboard에서 흡수)
const NormalSignalMiniCard = ({ rawData }: { rawData: any }) => {
  const signalIcon =
    rawData.signal === 'BUY' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
    rawData.signal === 'SELL' ? <TrendingDown className="w-4 h-4 text-rose-600" /> :
    <Minus className="w-4 h-4 text-slate-400" />;

  const signalColor =
    rawData.signal === 'BUY' ? 'text-emerald-600' :
    rawData.signal === 'SELL' ? 'text-rose-600' :
    'text-slate-500';

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
        <div className="text-right">
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em]">RSI</p>
          <p className="font-mono font-black text-base text-slate-700">{rawData.rsi?.toFixed(1) ?? '—'}</p>
        </div>
        <div className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-black shadow-sm',
          rawData.signal === 'BUY' ? 'bg-emerald-50 border-emerald-100' :
          rawData.signal === 'SELL' ? 'bg-rose-50 border-rose-100' :
          'bg-slate-50 border-slate-200'
        )}>
          {signalIcon}
          <span className={clsx('uppercase tracking-widest', signalColor)}>{rawData.signal}</span>
        </div>
        <span className="text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md tracking-[0.2em] uppercase">
          Standard
        </span>
      </div>
    </div>
  );
};

type SignalTab = 'all' | 'strong' | 'normal';

export const Dashboard = () => {
  const { pulseMap, isConnected, lastUpdatedTicker, isHunting, huntStatus, triggerHunt } = useMarketEngine();
  const { data: stats, isLoading: statsLoading } = useStrategyStats();
  const [pulseStatus, setPulseStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SignalTab>('all');

  useEffect(() => {
    const loadPulseStatus = async () => {
      try {
        const res = await fetch('/py-api/api/pulse/status').then(r => r.json());
        setPulseStatus(res);
      } catch {
        console.warn("Failed to fetch pulse status");
      }
    };
    loadPulseStatus();
    const timer = setInterval(loadPulseStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  const allTickers = useMemo(() => Object.keys(pulseMap), [pulseMap]);
  const strongTickers = useMemo(() => allTickers.filter(t => pulseMap[t]?.strength === 'STRONG'), [allTickers, pulseMap]);
  const normalTickers = useMemo(() => allTickers.filter(t => pulseMap[t]?.strength === 'NORMAL'), [allTickers, pulseMap]);
  const buyTickers = useMemo(() => allTickers.filter(t => pulseMap[t]?.signal === 'BUY'), [allTickers, pulseMap]);

  const displayedStrong = activeTab === 'normal' ? [] : strongTickers;
  const displayedNormal = activeTab === 'strong' ? [] : normalTickers;
  const hasAnySignal = allTickers.length > 0;

  const tabs: { key: SignalTab; label: string; count: number }[] = [
    { key: 'all',    label: '전체',         count: allTickers.length },
    { key: 'strong', label: '⚡ STRONG',    count: strongTickers.length },
    { key: 'normal', label: 'STANDARD',     count: normalTickers.length },
  ];

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
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {statsLoading
                  ? <span className="text-sm font-bold text-blue-500 animate-pulse">DATA PROCESSING...</span>
                  : stats ? `${stats.mdd.toFixed(2)}%` : '-2.95%'}
              </span>
              {!statsLoading && <span className="text-xs font-bold text-emerald-600">vs MKT -29.1%</span>}
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
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {statsLoading
                  ? <span className="text-sm font-bold text-purple-500 animate-pulse">CALCULATING...</span>
                  : stats ? `${stats.win_rate.toFixed(1)}%` : '68.7%'}
              </span>
              {!statsLoading && (
                <span className="text-xs font-bold text-purple-600">
                  PF: {stats ? stats.profit_factor.toFixed(2) : '1.14'}x
                </span>
              )}
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
                {pulseStatus?.market_status === 'CLOSED' ? 'LAST SESSION' : 'BUY SIGNALS'}
                {allTickers.length > 0 && (
                  <span className="ml-1 text-slate-400">/ {allTickers.length} SCANNING</span>
                )}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium font-mono uppercase tracking-tighter">
              {pulseStatus?.market_status === 'CLOSED' ? '🌙 Market Closed (Snapshot View)' : '⚡ Live v4 Pulse Feed'}
            </p>
          </div>
        </div>
      </div>

      {/* 가상 포트폴리오 상태 */}
      <PortfolioStatus />

      {/* 시스템 관제 설정 */}
      <CommandSettings />

      {/* 3. 실시간 시그널 피드 + 강도 필터 탭 */}
      <div className="pt-4">
        {/* 헤더 + 탭 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            퀀트 엔진 포착 및 백테스트 검증
          </h2>

          {/* 강도 필터 탭 */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.key === 'strong' && <Zap className="w-3 h-3" />}
                {tab.key === 'normal' && <Activity className="w-3 h-3" />}
                {tab.label}
                <span className={clsx(
                  'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black',
                  activeTab === tab.key ? 'bg-[#0176d3] text-white' : 'bg-slate-200 text-slate-500'
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {!hasAnySignal && (
          <div className="flex flex-col items-center justify-center h-80 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 shadow-inner">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Server className="w-8 h-8 opacity-30" />
            </div>
            <p className="font-bold text-slate-900">수신된 펄스 시그널이 없습니다.</p>
            <p className="text-sm mt-1">상단의 '하이브리드 헌팅 트리거'를 눌러 시장 스캔을 시작하세요.</p>
          </div>
        )}

        {/* STRONG 시그널 섹션 */}
        {displayedStrong.length > 0 && (
          <section className="space-y-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="h-6 w-1.5 bg-[#0176d3] rounded-full" />
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                ⚡ STRONG SIGNALS
              </h3>
              <span className="text-[10px] font-black text-white bg-[#0176d3] px-2.5 py-0.5 rounded-full">
                {displayedStrong.length}
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
              {displayedStrong.map((ticker) => {
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
                      <span className="px-3 py-1.5 rounded-md text-sm font-black bg-slate-900 text-white shadow-lg">
                        RSI: {rawData.rsi?.toFixed(1) || '-'}
                      </span>
                    </div>
                    <QuantSignalCard data={cardData} />
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* NORMAL 시그널 섹션 */}
        {displayedNormal.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1 bg-slate-400 rounded-full" />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">
                STANDARD MONITORING GRID
              </h3>
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                {displayedNormal.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedNormal.map((ticker) => (
                <NormalSignalMiniCard key={ticker} rawData={pulseMap[ticker]} />
              ))}
            </div>
          </section>
        )}

        {/* 탭 선택 후 해당 데이터 없을 때 */}
        {hasAnySignal && displayedStrong.length === 0 && displayedNormal.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400">
            <p className="font-bold text-slate-600">현재 해당 강도의 시그널이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
