/**
 * HeaderCommandBar.tsx — Dashboard Header with System Controls (Lumina Trade Light Design)
 * High Contrast - No Gray
 */

import React from 'react';
import clsx from 'clsx';
import {
  Zap,
  ShieldCheck,
  Activity,
  Lock,
  Unlock,
} from 'lucide-react';
import type { PennyScanStatusResponse } from '../../types/api';

export const DashboardTitle = React.memo(function DashboardTitle({
  isMarketOpen,
}: {
  isMarketOpen: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-3.5 bg-blue-700 rounded-full shadow-sm" />
        <span className="text-[10px] font-mono font-black text-blue-900 uppercase tracking-widest">
          Integrated Intelligence Dashboard
        </span>
      </div>
      <h1 className="text-[22px] font-black text-black flex items-center gap-2 tracking-tight">
        <Zap className="w-6 h-6 text-blue-700 stroke-[3]" />
        통합 지휘소
      </h1>
      <div className="flex items-center gap-2 mt-1">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            isMarketOpen
              ? 'bg-emerald-600 animate-pulse shadow-sm'
              : 'bg-blue-300',
          )}
        />
        <span className="text-[10px] font-mono font-bold text-blue-950 uppercase tracking-widest">
          US Market {isMarketOpen ? 'Open' : 'Closed'}
        </span>
      </div>
    </div>
  );
});

export const DashboardControls = React.memo(function DashboardControls({
  isArmed,
  pennyScanStatus,
  onToggleArm,
  onOpenSettings,
}: {
  isArmed: boolean;
  pennyScanStatus: PennyScanStatusResponse | null;
  onToggleArm: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      {/* System ARM Toggle */}
      <button
        onClick={onToggleArm}
        title={isArmed ? '클릭하면 자동매매를 비활성화합니다' : '클릭하면 자동매매를 활성화합니다'}
        className={clsx(
          'flex items-center justify-between rounded-md font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 overflow-hidden shadow-sm border w-full',
          isArmed ? 'border-red-600 bg-white' : 'border-emerald-600 bg-white',
        )}
      >
        <span
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2 font-black text-[11px] font-sans transition-colors',
            isArmed ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white',
          )}
        >
          {isArmed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          {isArmed ? 'ARMED' : 'SAFE'}
        </span>
        <span className="flex-1 text-center bg-blue-50 hover:bg-blue-100 px-3 py-2 text-[11px] text-blue-950 font-bold border-l border-blue-200 font-sans transition-colors">
          {isArmed ? 'Turn SAFE' : 'Turn ARM'}
        </span>
      </button>

      <div className="flex items-center gap-2">
        {/* Auto Quant Scan Status Badge */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-transparent border border-blue-200 rounded-md shadow-sm">
          <Activity className="w-4 h-4 text-blue-700 shrink-0" />
          <div className="leading-none">
            <span className="text-[9px] font-black text-blue-900 uppercase tracking-widest block font-mono">
              Auto Scan
            </span>
            <span className="text-[11px] text-black font-black block mt-0.5 font-sans">
              {pennyScanStatus?.last_scan_at
                ? new Date(pennyScanStatus.last_scan_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Waiting...'}
            </span>
          </div>
        </div>

        {/* Settings Panel Trigger */}
        <button
          onClick={onOpenSettings}
          title="퀀트 전략 파라미터 설정"
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 h-full bg-transparent hover:bg-blue-50 border border-blue-200 hover:border-blue-400 text-blue-950 hover:text-black rounded-md transition-all text-[11px] font-black uppercase tracking-wider cursor-pointer shadow-sm"
        >
          <ShieldCheck className="w-4 h-4 text-blue-700" />
          설정
        </button>
      </div>
    </div>
  );
});
