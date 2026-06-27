/**
 * HeaderCommandBar.tsx — Dashboard Header with System Controls
 *
 * ARM/SAFE 토글, Auto Quant Scan 상태, 설정 버튼 등 상단 컨트롤 영역.
 * React.memo로 감싸서 관련 상태가 변하지 않으면 리렌더링을 차단.
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

interface HeaderCommandBarProps {
  isMarketOpen: boolean;
  isArmed: boolean;
  pennyScanStatus: PennyScanStatusResponse | null;
  onToggleArm: () => void;
  onOpenSettings: () => void;
}

export const HeaderCommandBar = React.memo(function HeaderCommandBar({
  isMarketOpen,
  isArmed,
  pennyScanStatus,
  onToggleArm,
  onOpenSettings,
}: HeaderCommandBarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-6">
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-1.5 h-4 bg-slate-700 rounded-full shadow-[0_0_8px_rgba(71,85,105,0.4)]" />
          <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest">
            Integrated Intelligence Dashboard
          </span>
        </div>
        <h1 className="text-[25px] font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
          <Zap className="w-8 h-8 text-indigo-600 drop-shadow-[0_0_12px_rgba(79,70,229,0.6)] stroke-[2.5]" />
          통합 지휘소
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              isMarketOpen
                ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : 'bg-slate-400',
            )}
          />
          <span className="text-xs font-mono font-semibold text-slate-800 uppercase tracking-widest">
            US Market {isMarketOpen ? 'Open' : 'Closed'}
          </span>
          <span className="text-slate-300">|</span>
          <p className="text-[13px] font-semibold text-slate-800">
            실시간 시장 펄스 감시, 오늘의 알파 발굴, 그리고 실계좌 포트폴리오 현황 통합 관제
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {/* System ARM Toggle */}
        <button
          onClick={onToggleArm}
          title={isArmed ? '클릭하면 자동매매를 비활성화합니다' : '클릭하면 자동매매를 활성화합니다'}
          className={clsx(
            'flex items-center gap-0 border font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 overflow-hidden hover:shadow-md hover:scale-[1.01]',
            isArmed ? 'border-red-300' : 'border-emerald-300',
          )}
        >
          <span
            className={clsx(
              'flex items-center gap-2 px-4 py-3 font-extrabold text-[13px] font-sans',
              isArmed ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white',
            )}
          >
            {isArmed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {isArmed ? 'ARMED (자동매매)' : 'SAFE (관제모드)'}
          </span>
          <span className="bg-slate-100 hover:bg-slate-200 px-3 py-3 text-xs text-slate-800 font-extrabold border-l border-slate-200 font-sans">
            {isArmed ? 'SAFE로 전환' : 'ARM으로 전환'}
          </span>
        </button>

        {/* Auto Quant Scan Status Badge */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-indigo-300">
          <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <div className="leading-none">
            <span className="text-xs font-bold text-indigo-850 uppercase tracking-widest block font-mono">
              Auto Quant Scan
            </span>
            <span className="text-sm text-indigo-700 font-extrabold block mt-0.5 font-sans">
              {pennyScanStatus?.last_scan_at
                ? `최근: ${new Date(pennyScanStatus.last_scan_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : '서버 시작 후 30초 내 실행'}
            </span>
          </div>
        </div>

        {/* Settings Panel Trigger */}
        <button
          onClick={onOpenSettings}
          title="퀀트 전략 파라미터 설정"
          className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all text-xs font-extrabold uppercase tracking-wider cursor-pointer font-sans"
        >
          <ShieldCheck className="w-4 h-4 text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)] stroke-[2.5]" />
          설정
        </button>
      </div>
    </div>
  );
});
