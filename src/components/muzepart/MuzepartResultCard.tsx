import React from 'react';
import type { ComponentPart } from '../../types/muzepart';
import { 
  getBrandIcon, 
  getDistributorBadgeClass, 
  getStockClass, 
  getDistributorUrl,
  getRiskScoreClass,
  getRiskLabel,
  getRelevanceBadgeClass,
  getRelevanceLabel
} from './MuzepartUI';
import { Info, FileText } from 'lucide-react';

interface MuzepartResultCardProps {
  part: ComponentPart;
  handleLock: (part: ComponentPart) => void;
  onShowDetails: (part: ComponentPart) => void;
}

export const MuzepartResultCard: React.FC<MuzepartResultCardProps> = ({ 
  part, 
  handleLock,
  onShowDetails
}) => {
  return (
    <div className="sfdc-card p-5 hover:shadow-md transition-all border border-blue-200/80">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {getBrandIcon(part.manufacturer)}
          <div className="flex flex-col">
            <span className="text-lg font-extrabold text-blue-900 font-mono">{part.mpn}</span>
            <span className="text-xs font-semibold text-blue-500 uppercase mt-0.5">{part.manufacturer}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`distributor-badge ${getDistributorBadgeClass(part.distributor)}`}>
            {part.distributor}
          </span>
          {part.relevance_score !== undefined && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${getRelevanceBadgeClass(part.relevance_score)}`}>
              {getRelevanceLabel(part.relevance_score)}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-lg">
          <p className="text-xs font-bold text-blue-700 uppercase mb-1">재고 현황</p>
          <p className={`text-base font-extrabold ${getStockClass(part.stock)}`}>
            {part.stock > 0 ? `${part.stock.toLocaleString()} 개` : '확인 필요'}
          </p>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-lg relative group">
          <p className="text-xs font-bold text-blue-700 uppercase mb-1">구매 단가</p>
          <p className={`text-base font-extrabold text-blue-900 font-mono w-fit ${part.priceBreaks && part.priceBreaks.length > 0 ? 'cursor-help border-b border-dashed border-blue-300' : ''}`}>
            {part.price > 0 ? `${part.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${part.currency}` : '견적 문의'}
          </p>
          {part.priceBreaks && part.priceBreaks.length > 0 && (
            <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50">
              <div className="bg-blue-900 text-blue-50 text-xs rounded-xl p-3 shadow-xl border border-blue-700 min-w-[160px]">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 border-b border-blue-700 pb-1">Tiered Pricing</p>
                <div className="space-y-1">
                  {part.priceBreaks.map((pb, idx) => (
                    <div key={idx} className="flex justify-between items-center gap-4">
                      <span className="text-blue-300">{pb.quantity.toLocaleString()}+</span>
                      <span className="font-mono font-bold">{pb.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {part.risk_score !== undefined && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200/60 border-l-4 border-l-blue-400 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-blue-700 uppercase">공급 리스크</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </span>
          </div>
          <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden border border-blue-300/40">
            <div 
              className={`h-full transition-all ${part.risk_score >= 70 ? 'bg-red-500' : part.risk_score >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${part.risk_score}%` }} 
            />
          </div>
          {part.market_notes && (
            <p className="text-xs text-blue-600 mt-1.5 italic line-clamp-1">{part.market_notes}</p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {part.datasheet && (
          <a
            href={part.datasheet}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center p-2 border border-blue-200 text-blue-500 rounded-lg hover:bg-blue-50 hover:text-rose-600 transition-all cursor-pointer"
            title="데이터시트 (PDF)"
          >
            <FileText className="w-4 h-4" />
          </a>
        )}
        <a
          href={getDistributorUrl(part)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 py-2 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50 hover:text-blue-900 transition-all text-center cursor-pointer"
        >
          사이트 방문
        </a>
        <button
          onClick={() => onShowDetails(part)}
          className="flex-1 py-2 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50 hover:text-blue-900 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" /> Details
        </button>
        <button 
          onClick={() => handleLock(part)}
          disabled={part.is_locked || part.is_processing}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer ${
            part.is_locked 
              ? 'bg-blue-100 text-blue-500 border border-blue-200/80 cursor-default' 
              : part.is_processing
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200/50 cursor-wait'
              : 'bg-cyan-500 hover:bg-cyan-600 text-blue-950 font-black'
          }`}
        >
          {part.is_locked ? 'LOCKED' : part.is_processing ? 'Processing...' : 'LOCK'}
        </button>
      </div>
    </div>
  );
};
