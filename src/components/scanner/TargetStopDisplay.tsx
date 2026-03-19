import { useDNACalculator } from '../../hooks/useDNACalculator';
import type { Stock } from '../../types';

export const TargetStopDisplay = ({ stock }: { stock: Stock }) => {
  const { targetPrice, stopPrice } = useDNACalculator({
    buyPrice: stock.price,
    currentPrice: stock.price,
    buyDate: new Date().toISOString()
  });

  return (
    <div className="flex flex-col gap-1 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/80 min-w-[120px]">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-500 font-bold uppercase tracking-wider">🎯 Target</span>
        <span className="text-emerald-600 font-black">${targetPrice.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono mt-1">
       <span className="text-slate-500 font-bold uppercase tracking-wider">🛡️ Stop</span>
       <span className="text-rose-600 font-black">${stopPrice.toFixed(2)}</span>
      </div>
    </div>
  );
};
