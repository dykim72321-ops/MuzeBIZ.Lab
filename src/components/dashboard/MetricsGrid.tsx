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
}

const CompactGauge = React.memo(function CompactGauge({
  title,
  value,
  dialColor,
  subtitle,
}: CompactGaugeProps) {
  const pct = Math.min(value, 100);
  const strokeDashoffset = 100 - pct;

  return (
    <div className="flex items-center gap-2" title={subtitle}>
      <div className="relative w-8 h-8 flex-shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" className="stroke-blue-100" strokeWidth="3.5" />
          <circle
            cx="18" cy="18" r="16" fill="none" stroke={dialColor} strokeWidth="3.5"
            strokeDasharray="100 100" strokeDashoffset={strokeDashoffset} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[9px] font-black text-black tabular-nums">{Math.round(pct)}</span>
        </div>
      </div>
      <div>
        <span className="text-[9px] font-black text-blue-900 uppercase tracking-widest block font-mono">
          {title}
        </span>
        {subtitle && (
          <span className="text-[8px] font-bold text-blue-700 block font-mono">{subtitle}</span>
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
  const concIsWarn = concentrationPct >= 70;
  const concIsCaution = concentrationPct >= 50 && concentrationPct < 70;
  const concDialColor = concIsWarn ? '#e11d48' : concIsCaution ? '#d97706' : '#059669';

  return (
    <div className="flex flex-wrap xl:flex-nowrap gap-3 w-full">
      {/* 1. Total Assets */}
      <div className="flex-1 bg-white border-2 border-blue-200 rounded-md p-3 flex flex-col justify-between shadow-sm min-w-[160px]">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-black text-blue-950 uppercase tracking-widest block font-mono whitespace-nowrap">
            Total Assets
          </span>
          <BarChart3 className="w-3.5 h-3.5 text-blue-700 shrink-0 ml-2" />
        </div>
        <div className="overflow-hidden">
          <span className="text-xl font-black text-black tabular-nums block truncate" title={`$${displayedAccount.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
            ${displayedAccount.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {/* Simple Sparkline */}
          <div className="mt-1 h-3 w-full opacity-60">
            <svg viewBox="0 0 100 20" className="w-full h-full preserve-3d" preserveAspectRatio="none">
              <path d="M0,20 L10,15 L20,18 L30,12 L40,16 L50,8 L60,14 L70,5 L80,10 L90,2 L100,0" fill="none" stroke="#1d4ed8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d="M0,20 L10,15 L20,18 L30,12 L40,16 L50,8 L60,14 L70,5 L80,10 L90,2 L100,0 L100,20 L0,20 Z" fill="url(#sparkline-gradient)" opacity="0.2" />
              <defs>
                <linearGradient id="sparkline-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* 2. Available Cash */}
      <div className="flex-1 bg-white border-2 border-blue-200 rounded-md p-3 flex flex-col justify-between shadow-sm min-w-[160px]">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-black text-blue-950 uppercase tracking-widest block font-mono whitespace-nowrap">
            Avail Cash
          </span>
          <Coins className="w-3.5 h-3.5 text-cyan-700 shrink-0 ml-2" />
        </div>
        <div className="overflow-hidden">
          <span className="text-xl font-black text-black tabular-nums block truncate" title={`$${displayedAccount.cash_available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
            ${displayedAccount.cash_available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* 3. Current P&L */}
      <div className={clsx("flex-1 border-2 rounded-md p-3 flex flex-col justify-between shadow-sm min-w-[160px]", totalPnl >= 0 ? "bg-emerald-50 border-emerald-300" : "bg-rose-50 border-rose-300")}>
        <div className="flex justify-between items-center mb-1">
          <span className={clsx("text-[10px] font-black uppercase tracking-widest block font-mono whitespace-nowrap", totalPnl >= 0 ? "text-emerald-800" : "text-rose-800")}>
            Current P&L
          </span>
          {totalPnl >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-700 shrink-0 ml-2" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-700 shrink-0 ml-2" />}
        </div>
        <div className="overflow-hidden">
          <span className={clsx("text-xl font-black tabular-nums block truncate", totalPnl >= 0 ? "text-emerald-800" : "text-rose-800")} title={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={clsx("text-[9px] font-bold block mt-0.5 whitespace-nowrap", totalPnl >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {displayedPositions.length}개 보유
          </span>
        </div>
      </div>

      {/* 4. Mini Gauges (Win Rate & Concentration) */}
      <div className="flex-1 bg-white border-2 border-blue-200 rounded-md p-3 flex items-center justify-around shadow-sm min-w-[200px]">
        <CompactGauge
          title="Win Rate"
          value={hasTradeData ? displayedWinRate : 0}
          dialColor="#1d4ed8"
          subtitle={hasTradeData ? `${displayedTotalTrades}건 기준` : '거래 없음'}
        />
        <div className="w-[2px] h-8 bg-blue-100" />
        <CompactGauge
          title="Concentr"
          value={concentrationPct}
          dialColor={concDialColor}
          subtitle={`$${investedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} 투입`}
        />
      </div>
    </div>
  );
});
