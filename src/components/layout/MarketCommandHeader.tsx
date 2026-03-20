import React from 'react';
import { Activity, Rocket, Loader2, CheckCircle } from 'lucide-react';
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
    <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            {title === "Quant Pulse" && (
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Activity className="w-7 h-7 text-indigo-600 animate-pulse" />
              </div>
            )}
            {title}
          </h1>
          <div className="px-3 py-1 bg-blue-50 border border-blue-100 rounded-full flex items-center gap-2">
            <span className={clsx("w-2 h-2 rounded-full", isConnected ? 'bg-blue-500 animate-pulse' : 'bg-rose-500')} />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#0176d3]">{engineVersion}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
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
