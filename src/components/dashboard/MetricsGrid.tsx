/**
 * MetricsGrid.tsx — Top-level KPI Metrics (5-column grid)
 *
 * Total Assets, Cash, P&L, Win Rate, Portfolio Concentration.
 * 각 카드가 독립적으로 memo되어 해당 데이터가 변하지 않으면 리렌더링되지 않음.
 */

import React from 'react';
import clsx from 'clsx';
import {
  BarChart3,
  Coins,
  Star,
  PieChart,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { PaperPosition } from '../../types/dashboard';

// ─── Sub-components ──────────────────────────────────────────────────────────

interface GaugeCardProps {
  title: string;
  value: number;
  maxValue?: number;
  icon: React.ReactNode;
  dialColor: string;
  label: string;
  footer: React.ReactNode;
}

const SpeedometerGauge = React.memo(function SpeedometerGauge({
  title,
  value,
  icon,
  dialColor,
  label,
  footer,
}: GaugeCardProps) {
  const pct = Math.min(value, 100);
  const angle = -180 + (pct / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const needleX = 50 + 30 * Math.cos(rad);
  const needleY = 50 + 30 * Math.sin(rad);

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col items-center justify-between min-h-[200px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
      <div className="w-full flex justify-between items-start mb-1 z-10">
        <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest block">
          {title}
        </span>
        {icon}
      </div>

      <div className="relative w-52 h-32 flex items-center justify-center overflow-hidden z-10">
        <svg className="w-full h-full transform translate-y-3" viewBox="0 0 100 55">
          <path
            d="M 15 50 A 35 35 0 0 1 85 50"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M 15 50 A 35 35 0 0 1 85 50"
            fill="none"
            stroke={dialColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="110"
            strokeDashoffset={110 - (110 * pct) / 100}
          />
          <line
            x1="50"
            y1="50"
            x2={needleX}
            y2={needleY}
            stroke={pct > 0 ? '#ef4444' : '#475569'}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="3.5" fill="#ffffff" stroke={dialColor} strokeWidth="1.5" />
        </svg>
        <div className="absolute bottom-1 text-center font-mono leading-none">
          <span className="text-2xl font-black text-slate-900">{pct.toFixed(1)}%</span>
          <span className="text-xs font-bold text-slate-800 block mt-0.5 font-sans">{label}</span>
        </div>
      </div>

      {footer}
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
  const concDialColor = concIsWarn ? '#ef4444' : concIsCaution ? '#f59e0b' : '#10b981';
  const concLabel = concIsWarn ? '위험 (≥70%)' : concIsCaution ? '주의 (≥50%)' : '안전';

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
        {/* 1. Total Assets */}
        <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
          <div className="flex justify-between items-start z-10">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">
                Total Assets
              </span>
              <span className="text-3xl font-black text-slate-900 leading-none tabular-nums block pt-1.5 font-mono">
                $
                {displayedAccount.total_assets.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                Alpaca 실계좌 Equity
              </span>
            </div>
            <div className="text-indigo-600 shrink-0 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)]">
              <BarChart3 className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-800 z-10">
            <span>SYS_STATUS: ONLINE</span>
            <span>LVL: OPTIMAL</span>
          </div>
        </div>

        {/* 2. Available Cash */}
        <div className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative">
          <div className="flex justify-between items-start z-10">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">
                Available Cash
              </span>
              <span className="text-3xl font-black text-slate-900 leading-none tabular-nums block pt-1.5 font-mono">
                $
                {displayedAccount.cash_available.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                Alpaca Buying Power
              </span>
            </div>
            <div className="text-amber-700 shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
              <Coins className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-800 font-mono z-10">
            <span>BUYING_POWER: 4.0X</span>
            <span>AVAIL_CAP</span>
          </div>
        </div>

        {/* 3. Current P&L */}
        <div
          className={clsx(
            'bg-white border rounded-2xl p-6 flex flex-col justify-between min-h-[160px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative',
            totalPnl >= 0 ? 'border-emerald-300' : 'border-rose-300',
          )}
        >
          <div className="flex justify-between items-start z-10">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest leading-none block">
                Current P&L
              </span>
              <span
                className={clsx(
                  'text-3xl font-black leading-none tabular-nums block pt-1.5 font-mono',
                  totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600',
                )}
              >
                {totalPnl >= 0 ? '+' : ''}$
                {totalPnl.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs font-semibold text-slate-800 leading-none block pt-2 font-sans">
                현재 보유 종목의 미실현 손익
              </span>
            </div>
            <div className={clsx('shrink-0', totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
              {totalPnl >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-800 font-mono z-10">
            <span>ACTIVE_TRADES: {displayedPositions.length}</span>
            <span>LIMIT_GUARD: SAFE</span>
          </div>
        </div>

        {/* 4. Win Rate */}
        <SpeedometerGauge
          title="Win Rate"
          value={hasTradeData ? displayedWinRate : 0}
          icon={<Star className="w-3.5 h-3.5 text-cyan-600" />}
          dialColor="#2563eb"
          label="WIN RATIO"
          footer={
            <p className="text-xs font-semibold text-slate-800 text-center leading-normal border-t border-slate-100 pt-2 w-full z-10 font-sans">
              {hasTradeData
                ? `총 ${displayedTotalTrades}건 실계좌 거래 기준 승률`
                : '거래 이력 없음'}
            </p>
          }
        />

        {/* 5. Portfolio Concentration */}
        <SpeedometerGauge
          title="Concentration"
          value={concentrationPct}
          icon={<PieChart className="w-3.5 h-3.5 text-cyan-600" />}
          dialColor={concDialColor}
          label={concLabel}
          footer={
            <div className="text-xs text-slate-800 text-center font-sans font-semibold leading-normal border-t border-slate-100 pt-2 w-full z-10 flex justify-between">
              <span>
                ${investedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} 투입
              </span>
              <span className="font-mono text-xs">LIMIT 80%</span>
            </div>
          }
        />
      </div>
    </div>
  );
});
