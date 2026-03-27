import React from 'react';
import { Rocket, Loader2, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface MarketCommandHeaderProps {
  title: string;
  subtitle: string;
  isConnected: boolean;
  isHunting: boolean;
  huntStatus: 'success' | 'error' | null;
  onTriggerHunt: () => void;
  engineVersion?: string;
}

/**
 * MarketCommandHeader
 * 퀀트 대시보드 및 펄스 터미널 통합 헤더 컴포넌트
 */
export const MarketCommandHeader: React.FC<MarketCommandHeaderProps> = ({
  title,
  subtitle,
  isConnected,
  isHunting,
  huntStatus,
  onTriggerHunt,
  engineVersion = "PULSE ENGINE v4"
}) => {
  return (
    <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white/60 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            {title === "통합 지휘 통제실" && (
              <div className="relative">
                <div className={clsx(
                  "w-4 h-4 rounded-full",
                  isConnected ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]'
                )} />
                <div className={clsx(
                  "absolute inset-0 w-4 h-4 rounded-full animate-ping opacity-75",
                  isConnected ? 'bg-emerald-400' : 'bg-rose-400'
                )} />
              </div>
            )}
            {title}
          </h1>
          <div className="px-3 py-1 bg-white/40 border border-white/20 rounded-full flex items-center gap-2 backdrop-blur-sm">
            <span className={clsx("w-2 h-2 rounded-full", isConnected ? 'bg-emerald-500' : 'bg-rose-500')} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{engineVersion}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 font-semibold tracking-tight">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        {huntStatus === 'success' && (
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-tight text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-100">
            <CheckCircle className="w-4 h-4" /> 탐색기 가동됨
          </span>
        )}
        <button
          onClick={onTriggerHunt}
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
  );
};
