import React from 'react';
import type { ComponentPart } from '../../types/muzepart';
import { 
  getBrandIcon, 
  getDistributorBadgeClass, 
  getStockClass, 
  getDistributorUrl,
  getRiskScoreClass,
  getRiskLabel
} from './MuzepartUI';

interface MuzepartResultCardProps {
  part: ComponentPart;
  handleLock: (part: ComponentPart) => void;
}

export const MuzepartResultCard: React.FC<MuzepartResultCardProps> = ({ 
  part, 
  handleLock 
}) => {
  return (
    <div className="sfdc-card p-5 hover:shadow-lg transition-all border-slate-200">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {getBrandIcon(part.manufacturer)}
          <div className="flex flex-col">
            <span className="font-bold text-slate-900">{part.mpn}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{part.manufacturer}</span>
          </div>
        </div>
        <span className={`distributor-badge ${getDistributorBadgeClass(part.distributor)}`}>
          {part.distributor}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">재고 현황</p>
          <p className={`text-sm font-bold ${getStockClass(part.stock)}`}>
            {part.stock > 0 ? `${part.stock.toLocaleString()} 개` : '확인 필요'}
          </p>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">구매 단가</p>
          <p className="text-sm font-bold text-slate-900">
            {part.price > 0 ? `${part.price.toLocaleString()} ${part.currency}` : '견적 문의'}
          </p>
        </div>
      </div>
      
      {part.risk_score !== undefined && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border-l-4 border-l-slate-200">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">공급 리스크</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${part.risk_score >= 70 ? 'bg-red-500' : part.risk_score >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${part.risk_score}%` }} 
            />
          </div>
          {part.market_notes && (
            <p className="text-[9px] text-slate-400 mt-1.5 italic line-clamp-1">{part.market_notes}</p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <a
          href={getDistributorUrl(part)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all text-center"
        >
          사이트 방문
        </a>
        <button 
          onClick={() => handleLock(part)}
          disabled={part.is_locked || part.is_processing}
          className={`flex-1 py-2 text-white text-xs font-bold rounded-lg transition-all shadow-md ${
            part.is_locked 
              ? 'bg-slate-900 cursor-default' 
              : part.is_processing
              ? 'bg-blue-400 cursor-wait'
              : 'bg-[#0176d3] hover:bg-blue-700'
          }`}
        >
          {part.is_locked ? 'LOCKED' : part.is_processing ? 'Processing...' : 'LOCK'}
        </button>
      </div>
    </div>
  );
};
