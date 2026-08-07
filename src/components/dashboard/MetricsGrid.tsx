/**
 * MetricsGrid.tsx — Top-level KPI Metrics (Compact Lumina Trade Light Design)
 * High Contrast - No Gray
 */

import React from 'react';
import clsx from 'clsx';
import {
  BarChart3,
  Coins,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { PaperPosition } from '../../types/dashboard';

// ─── Compact Gauge ───────────────────────────────────────────────────────────
interface CompactGaugeProps {
  title: string;
  value: number;
  dialColor: string;
  subtitle?: string;
  /** 마우스오버 시 노출할 상세 설명. 미지정 시 subtitle을 그대로 사용 */
  tooltip?: string;
}

const CompactGauge = React.memo(function CompactGauge({
  title,
  value,
  dialColor,
  subtitle,
  tooltip,
}: CompactGaugeProps) {
  const pct = Math.min(value, 100);
  const strokeDashoffset = 100 - pct;

  return (
    <div className="flex flex-col items-center justify-center gap-1.5" title={tooltip ?? subtitle}>
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-200" strokeWidth="4" />
          <circle
            cx="18" cy="18" r="16" fill="none" stroke={dialColor} strokeWidth="4"
            strokeDasharray="100 100" strokeDashoffset={strokeDashoffset} strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-black text-slate-900 tabular-nums">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center min-w-0 w-full overflow-hidden text-center">
        <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight font-mono block truncate w-full" title={title}>
          {title}
        </span>
        {subtitle && (
          <span className="text-xs font-extrabold text-slate-500 block font-mono leading-tight truncate w-full" title={subtitle}>{subtitle}</span>
        )}
      </div>
    </div>
  );
});

// ─── Main Grid ───────────────────────────────────────────────────────────────
interface MetricsGridProps {
  displayedAccount: {
    total_assets: number;
    cash_available: number;
    today_pnl: number;
    today_pnl_pct: number;
  };
  totalPnl: number;
  displayedPositions: PaperPosition[];
  displayedWinRate: number;
  displayedTotalTrades: number;
  concentrationPct: number;
  investedCapital: number;
  hasTradeData: boolean;
}

export const MetricsGrid = React.memo(function MetricsGrid({
  displayedAccount,
  totalPnl,
  displayedPositions,
  displayedWinRate,
  displayedTotalTrades,
  concentrationPct,
  investedCapital,
  hasTradeData,
}: MetricsGridProps) {
  // 자산 변경 감지를 위한 상태 및 Ref
  const prevAssetsRef = React.useRef(displayedAccount.total_assets);
  const [assetFlash, setAssetFlash] = React.useState<'up' | 'down' | null>(null);

  React.useEffect(() => {
    // 0이거나 초기 로딩일 때는 애니메이션 무시
    if (prevAssetsRef.current !== 0 && displayedAccount.total_assets !== prevAssetsRef.current) {
      if (displayedAccount.total_assets > prevAssetsRef.current) {
        setAssetFlash('up');
      } else {
        setAssetFlash('down');
      }

      const timer = setTimeout(() => {
        setAssetFlash(null);
      }, 1000); // 1초 후 원래 색상으로 복귀

      prevAssetsRef.current = displayedAccount.total_assets;
      return () => clearTimeout(timer);
    }
    prevAssetsRef.current = displayedAccount.total_assets;
  }, [displayedAccount.total_assets]);

  const concIsWarn = concentrationPct >= 70;
  const concIsCaution = concentrationPct >= 50 && concentrationPct < 70;
  const concDialColor = concIsWarn ? '#e11d48' : concIsCaution ? '#d97706' : '#059669';

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 w-full">
      <div 
        className={clsx(
          "group border rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-colors duration-500 min-w-0 relative overflow-hidden",
          assetFlash === 'up' ? "bg-emerald-50 border-emerald-200" : assetFlash === 'down' ? "bg-rose-50 border-rose-200" : "bg-white border-slate-100 hover:border-slate-200"
        )}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-full -mr-8 -mt-8 pointer-events-none transition-transform group-hover:scale-110" />
        <div className="flex justify-between items-start mb-3 relative z-10">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
              Total Assets
            </span>
            <span 
              className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums tracking-tight truncate transition-colors duration-500" 
              title={`$${displayedAccount.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            >
              ${displayedAccount.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100/50 shadow-sm">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <div className="relative z-10 w-full">
          {/* Simple Sparkline */}
          <div className="h-4 w-full opacity-60 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 100 20" className="w-full h-full preserve-3d" preserveAspectRatio="none">
              <path d="M0,20 L10,15 L20,18 L30,12 L40,16 L50,8 L60,14 L70,5 L80,10 L90,2 L100,0" fill="none" stroke="#2563eb" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M0,20 L10,15 L20,18 L30,12 L40,16 L50,8 L60,14 L70,5 L80,10 L90,2 L100,0 L100,20 L0,20 Z" fill="url(#sparkline-gradient)" opacity="0.15" />
              <defs>
                <linearGradient id="sparkline-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* 2. Available Cash */}
      <div className="group bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-slate-200 transition-all min-w-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50/50 rounded-bl-full -mr-8 -mt-8 pointer-events-none transition-transform group-hover:scale-110" />
        <div className="flex justify-between items-start mb-3 relative z-10">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
              Avail Cash
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums tracking-tight truncate" title={`$${displayedAccount.cash_available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
              ${displayedAccount.cash_available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0 border border-cyan-100/50 shadow-sm">
            <Coins className="w-5 h-5 text-cyan-600" />
          </div>
        </div>
      </div>

      {/* 3. Current P&L */}
      <div className={clsx(
        "col-span-2 sm:col-span-1 xl:col-span-1 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all min-w-0 relative overflow-hidden group border",
        totalPnl >= 0 ? "bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 border-emerald-100/80" : "bg-gradient-to-br from-rose-50/80 to-rose-100/30 border-rose-100/80"
      )}>
        <div className={clsx("absolute top-0 right-0 w-32 h-32 rounded-bl-full -mr-8 -mt-8 pointer-events-none transition-transform group-hover:scale-110", totalPnl >= 0 ? "bg-emerald-200/20" : "bg-rose-200/20")} />
        
        <div className="flex justify-between items-start mb-3 relative z-10">
          <div className="flex flex-col gap-1">
            <span className={clsx("text-[10px] font-black uppercase tracking-widest font-mono", totalPnl >= 0 ? "text-emerald-700/80" : "text-rose-700/80")}>
              Current P&L
            </span>
            <span className={clsx("text-2xl sm:text-3xl font-black tabular-nums tracking-tight truncate", totalPnl >= 0 ? "text-emerald-900" : "text-rose-900")} title={`${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
              {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm", totalPnl >= 0 ? "bg-emerald-100/50 border-emerald-200/50" : "bg-rose-100/50 border-rose-200/50")}>
            {totalPnl >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-rose-600" />}
          </div>
        </div>
        <div className="relative z-10">
          <span className={clsx("text-[11px] font-bold block whitespace-nowrap", totalPnl >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {displayedPositions.length}개 보유 중
          </span>
        </div>
      </div>

      {/* 4. Mini Gauges (Win Rate & Concentration) */}
      <div className="col-span-2 sm:col-span-1 xl:col-span-1 bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:border-slate-200 transition-all min-w-0">
        <div className="flex-1 min-w-0 flex justify-center">
          <CompactGauge
            title="Win Rate"
            value={hasTradeData ? displayedWinRate : 0}
            dialColor="#2563eb"
            subtitle={hasTradeData ? `${displayedTotalTrades}건` : '거래 없음'}
            tooltip="Alpaca 실체결(closed-trades) FIFO 매칭 기준 — 성과 리포트 페이지의 승률(엔진 exit_reason 로그 기준)과는 산출 방식이 달라 수치가 다를 수 있습니다."
          />
        </div>
        <div className="w-[1px] h-10 bg-slate-100 mx-1 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex justify-center">
          <CompactGauge
            title="Concentr"
            value={concentrationPct}
            dialColor={concDialColor}
            subtitle={`$${investedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>
      </div>
    </div>
  );
});
