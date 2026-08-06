import { useState } from 'react';
import clsx from 'clsx';

interface PartialSellControlProps {
  onSell: (percentage: number) => void;
  isBreached?: boolean;
}

/** 포지션 테이블/카드에서 임의 비중(1~100%)을 지정해 매도를 실행하는 인라인 컨트롤.
 * 100%를 입력하면 전량 매도(기존 "전량 정산" 버튼과 동일 동작)가 된다. */
export function PartialSellControl({ onSell, isBreached = false }: PartialSellControlProps) {
  const [percentage, setPercentage] = useState(50);

  const clamp = (value: number) => Math.min(100, Math.max(1, Math.round(value) || 1));

  return (
    <div className="grid grid-cols-2 gap-1.5 w-full">
      <input
        type="number"
        min={1}
        max={100}
        value={percentage}
        onChange={(e) => setPercentage(clamp(Number(e.target.value)))}
        className="w-full min-w-0 text-[11px] font-mono font-bold text-center border border-slate-200 rounded px-1 py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="매도 비중(%)"
      />
      <button
        onClick={() => onSell(percentage)}
        className={clsx(
          "text-[11px] font-bold px-2 py-1.5 w-full min-w-0 text-center whitespace-nowrap transition-all",
          isBreached 
            ? "bg-rose-600 text-white hover:bg-rose-700 animate-[pulse_1.5s_ease-in-out_infinite] shadow-md border border-rose-700" 
            : "btn-ghost-rose"
        )}
      >
        {isBreached ? '긴급매도' : '매도'}
      </button>
    </div>
  );
}
