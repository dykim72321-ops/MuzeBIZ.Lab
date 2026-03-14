import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Rocket, Server, ShieldCheck, 
  Crosshair, Loader2, CheckCircle, BarChart3
} from 'lucide-react';
import clsx from 'clsx';
import { usePulseSocket } from '../hooks/usePulseSocket';
import { QuantSignalCard } from '../components/ui/QuantSignalCard';
import { BacktestChart } from '../components/ui/BacktestChart';

export const Dashboard = () => {
  // 1. WebSocket을 통한 v4 펄스 엔진 실시간 데이터 수신
  const { pulseMap, isConnected, lastUpdatedTicker } = usePulseSocket('ws://127.0.0.1:8000/ws/pulse');
  
  // 전체 종목 맵 중 BUY 시그널만 필터링
  const buyTickers = Object.keys(pulseMap).filter(
    (t) => pulseMap[t].signal === 'BUY'
  );
  const allTickers = Object.keys(pulseMap);

  // 2. 하이브리드 수동 탐색(Hunting) 상태 관리
  const [isHunting, setIsHunting] = useState(false);
  const [huntStatus, setHuntStatus] = useState<'success' | 'error' | null>(null);

  const handleTriggerHunt = async () => {
    setIsHunting(true);
    setHuntStatus(null);
    try {
      const adminKey = import.meta.env.VITE_ADMIN_SECRET_KEY || "your_dev_secret_key";
      const response = await fetch('/py-api/api/hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      });
      if (!response.ok) throw new Error("API Error");
      setHuntStatus('success');
      setTimeout(() => setHuntStatus(null), 3000);
    } catch (error) {
      console.error("Hunting Error:", error);
      setHuntStatus('error');
      setTimeout(() => setHuntStatus(null), 3000);
    } finally {
      setIsHunting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-700 bg-slate-50 min-h-screen">
      
      {/* 1. Dashboard Header & Status Control */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">작전 지휘소</h1>
            <div className="px-3 py-1 bg-blue-50 border border-blue-100 rounded-full flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0176d3]">PULSE ENGINE v4</span>
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">실시간 시장 감시 및 AI 퀀트 발굴 시스템 <span className="text-slate-300 ml-2">| Command Center</span></p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-4">
          {huntStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-tight text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-100">
              <CheckCircle className="w-4 h-4" /> 탐색기 가동됨
            </span>
          )}
          <button
            onClick={handleTriggerHunt}
            disabled={isHunting}
            className={clsx(
              "flex items-center gap-2 px-6 py-3 rounded-md font-black text-sm transition-all shadow-md active:scale-95",
              isHunting 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                : 'bg-[#0176d3] hover:bg-[#014486] text-white shadow-blue-100'
            )}
          >
            {isHunting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {isHunting ? '딥 헌팅 진행 중...' : '하이브리드 헌팅 트리거'}
          </button>
        </div>
      </header>

      {/* 2. Quick Stats Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-100">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">시스템 방어력 (MDD)</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tabular-nums">-2.95%</span>
              <span className="text-xs font-bold text-emerald-600">vs MKT -29.1%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">소하이 5년 백테스트 기준</p>
          </div>
        </div>

        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-100">
            <Crosshair className="w-7 h-7 text-purple-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">엔진 승률 (Win Rate)</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tabular-nums">68.7%</span>
              <span className="text-xs font-bold text-purple-600">PF: 1.14x</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">소하이 5년 백테스트 기준</p>
          </div>
        </div>

        <div className="sfdc-card p-6 flex items-center gap-5">
          <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-100">
            <Activity className="w-7 h-7 text-[#0176d3]" />
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

      {/* 3. Live Signal Feed */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-4">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            AI 포착 종목 및 백테스트 검증
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center h-2 w-32 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#0176d3] w-2/3 shadow-sm"></div>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence Index 67%</span>
          </div>
        </div>

        {buyTickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Server className="w-8 h-8 opacity-30" />
            </div>
            {allTickers.length > 0 ? (
              <>
                <p className="font-bold text-slate-900">현재 BUY 시그널 없음</p>
                <p className="text-sm mt-1 px-3 py-1 bg-slate-100 rounded-md font-black uppercase tracking-tighter text-slate-500">
                  {allTickers.length} TICKERS OBSERVED
                </p>
                <p className="text-xs mt-3 text-slate-400 font-medium">
                  v4 엔진이 RSI &lt; 45 + MACD 기울기 개선 진입 조건을 스캔 중입니다
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
              const cardData = {
                dna_score: rawData.ai_metadata?.dna_score || 50,
                bull_case: rawData.ai_metadata?.bull_case || "데이터 분석 중...",
                bear_case: rawData.ai_metadata?.bear_case || "데이터 분석 중...",
                reasoning_ko: rawData.ai_metadata?.reasoning_ko || rawData.ai_report,
                tags: rawData.ai_metadata?.tags || [ticker, rawData.signal]
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
                        RSI: {rawData.rsi || '-'}
                      </span>
                    </div>
                  </div>
                  
                  {/* 시그널 렌더링 카드 */}
                  <QuantSignalCard data={cardData} />
                  
                  {/* v4 엔진이 적용된 백테스트 차트 */}
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