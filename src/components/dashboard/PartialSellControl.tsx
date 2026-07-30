import { useState } from 'react';

interface PartialSellControlProps {
  onSell: (percentage: number) => void;
}

/** 포지션 테이블/카드에서 임의 비중(1~100%)을 지정해 매도를 실행하는 인라인 컨트롤.
 * 100%를 입력하면 전량 매도(기존 "전량 정산" 버튼과 동일 동작)가 된다. */
export function PartialSellControl({ onSell }: PartialSellControlProps) {
  const [percentage, setPercentage] = useState(50);

  const clamp = (value: number) => Math.min(100, Math.max(1, Math.round(value) || 1));

  return (
    <div className="grid grid-cols-2 gap-1 w-full">
      <input
        type="number"
        min={1}
        max={100}
        value={percentage}
        onChange={(e) => setPercentage(clamp(Number(e.target.value)))}
        className="w-full text-[11px] font-mono font-bold text-center border border-slate-200 rounded px-1 py-1.5"
        aria-label="매도 비중(%)"
      />
      <button
        onClick={() => onSell(percentage)}
        className="btn-ghost-rose text-[11px] font-bold px-2 py-1.5 w-full"
      >
        매도
      </button>
    </div>
  );
}
