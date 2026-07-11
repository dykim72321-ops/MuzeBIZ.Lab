import React from 'react';
import type { ComponentPart } from '../../types/muzepart';
import {
  getBrandIcon,
  getDistributorBadgeClass,
  getDistributorUrl,
  getRiskScoreClass,
  getRiskLabel,
  getRelevanceBadgeClass,
  getRelevanceLabel
} from './muzepartHelpers';
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
    <div className="bg-white/95 backdrop-blur-xl p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 border border-slate-100 rounded-[20px] flex flex-col group relative overflow-hidden">
      {/* Subtle hover glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-200/0 rounded-full blur-[40px] pointer-events-none transform translate-x-1/2 -translate-y-1/2 group-hover:bg-slate-200/50 transition-colors duration-500" />

      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 p-2 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/60 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            {getBrandIcon(part.manufacturer)}
          </div>
          <div className="flex flex-col">
            <span className="text-[17px] font-black text-slate-800 tracking-tight">{part.mpn}</span>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{part.manufacturer}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide shadow-sm border ${getDistributorBadgeClass(part.distributor)}`}>
            {part.distributor}
          </span>
          {part.relevance_score !== undefined && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getRelevanceBadgeClass(part.relevance_score)}`}>
              {getRelevanceLabel(part.relevance_score)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
        <div className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-[14px] flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            {part.stock > 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            )}
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">재고 현황</p>
          </div>
          <p className={`text-[15px] font-black font-mono tracking-tight ${part.stock > 0 ? 'text-slate-800' : 'text-rose-500'}`}>
            {part.stock > 0 ? `${part.stock.toLocaleString()} 개` : '확인 필요'}
          </p>
        </div>
        
        <div className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-[14px] flex flex-col justify-center relative group/price">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800 shadow-[0_0_8px_rgba(30,41,59,0.8)]" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">구매 단가</p>
          </div>
          <p className={`text-[15px] font-black font-mono tracking-tight text-slate-800 w-fit ${part.priceBreaks && part.priceBreaks.length > 0 ? 'cursor-help border-b border-dashed border-slate-300' : ''}`}>
            {part.price > 0 ? `${part.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${part.currency}` : '견적 문의'}
          </p>
          
          {/* Enhanced Tiered Pricing Tooltip */}
          {part.priceBreaks && part.priceBreaks.length > 0 && (
            <div className="absolute left-0 top-full mt-2 hidden group-hover/price:block z-50">
              <div className="bg-white/95 backdrop-blur-xl text-slate-800 rounded-2xl p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-200 min-w-[180px]">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Tiered Pricing</span>
                  <span className="text-slate-600 bg-slate-100 px-1.5 rounded">{part.currency}</span>
                </p>
                <div className="space-y-2">
                  {part.priceBreaks.map((pb, idx) => (
                    <div key={idx} className="flex justify-between items-center gap-6 text-xs">
                      <span className="font-bold text-slate-500">{pb.quantity.toLocaleString()}+</span>
                      <span className="font-mono font-black text-slate-700">{pb.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {part.risk_score !== undefined && (
        <div className="mb-5 p-3.5 bg-slate-50/50 border border-slate-100 rounded-[14px] relative z-10">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">공급 리스크 지수</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shadow-inner p-[1px]">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,0,0,0.2)] ${part.risk_score >= 70 ? 'bg-gradient-to-r from-rose-500 to-rose-400' : part.risk_score >= 30 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`} 
              style={{ width: `${part.risk_score}%` }} 
            />
          </div>
          {part.market_notes && (
            <p className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">{part.market_notes}</p>
          )}
        </div>
      )}
      
      <div className="flex gap-2.5 mt-auto relative z-10">
        {part.datasheet && (
          <a
            href={part.datasheet}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm"
            title="데이터시트 (PDF)"
          >
            <FileText className="w-4 h-4" />
          </a>
        )}
        <a
          href={getDistributorUrl(part)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-wide rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all text-center shadow-sm flex items-center justify-center"
        >
          Buy / Info
        </a>
        <button
          onClick={() => onShowDetails(part)}
          className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-wide rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all text-center flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Info className="w-3.5 h-3.5" /> Details
        </button>
        <button 
          onClick={() => handleLock(part)}
          disabled={part.is_locked || part.is_processing}
          className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center justify-center ${
            part.is_locked 
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
              : part.is_processing
              ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-wait'
              : 'bg-black hover:bg-slate-800 text-white shadow-sm border-none'
          }`}
        >
          {part.is_locked ? 'Locked' : part.is_processing ? 'Wait...' : 'Lock'}
        </button>
      </div>
    </div>
  );
};
