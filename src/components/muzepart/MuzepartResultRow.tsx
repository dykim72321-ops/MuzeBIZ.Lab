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
import { Globe, Info, FileText } from 'lucide-react';

interface MuzepartResultRowProps {
  part: ComponentPart;
  handleLock: (part: ComponentPart) => void;
  onShowDetails: (part: ComponentPart) => void;
}

export const MuzepartResultRow: React.FC<MuzepartResultRowProps> = ({ 
  part, 
  handleLock,
  onShowDetails
}) => {
  return (
    <tr key={`${part.id}-${part.distributor}`} className="hover:bg-indigo-50/40 hover:shadow-[0_2px_15px_rgba(59,130,246,0.06)] transition-all duration-300 group border-b border-slate-100 last:border-0 relative">
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <span className={`distributor-badge ${getDistributorBadgeClass(part.distributor)}`}>
            {part.distributor}
          </span>
          {part.relevance_score !== undefined && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${getRelevanceBadgeClass(part.relevance_score)}`}>
              {getRelevanceLabel(part.relevance_score)}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3.5">
          <div className="p-1.5 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-300/70 rounded-lg shadow-sm">
            {getBrandIcon(part.manufacturer)}
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-black text-slate-900 tracking-tight">{part.mpn}</span>
            {part.is_alternative && (
              <span className="px-1.5 py-0.5 mt-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold uppercase rounded w-fit tracking-wider">Family Match</span>
            )}
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{part.manufacturer}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          {part.stock > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
          )}
          <span className={`text-[14px] font-black font-mono tracking-tight ${part.stock > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {part.stock > 0 ? part.stock.toLocaleString() : 'Check'}
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col relative group/price">
          <span className={`text-[14px] font-black font-mono tracking-tight text-slate-900 w-fit ${part.priceBreaks && part.priceBreaks.length > 0 ? 'cursor-help border-b border-dashed border-slate-400' : ''}`}>
            {part.price > 0 ? `${part.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${part.currency}` : 'Quote'}
          </span>
          {part.priceBreaks && part.priceBreaks.length > 0 && (
            <div className="absolute left-0 top-full mt-2 hidden group-hover/price:block z-50">
              <div className="bg-white/95 backdrop-blur-xl text-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] border border-slate-300 min-w-[180px]">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-200 flex items-center justify-between">
                  <span>Tiered Pricing</span>
                  <span className="text-indigo-500 bg-indigo-50 px-1.5 rounded">{part.currency}</span>
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
          {part.risk_score !== undefined && (
            <div className={`mt-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-widest border w-fit ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="text-slate-900 text-[13px] font-black">{part.delivery}</span>
          {part.market_notes && (
            <span className="text-[10px] font-bold text-slate-500 mt-1 truncate max-w-[140px]" title={part.market_notes}>
              {part.market_notes}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2 relative z-10">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm p-0.5">
            {part.datasheet && (
              <a
                href={part.datasheet}
                target="_blank"
                rel="noreferrer noopener"
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                title="데이터시트 (PDF)"
              >
                <FileText className="w-4 h-4" />
              </a>
            )}
            <a
              href={getDistributorUrl(part)}
              target="_blank"
              rel="noreferrer noopener"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all cursor-pointer"
              title="Buy / Site"
            >
              <Globe className="w-4 h-4" />
            </a>
            <button
              onClick={() => onShowDetails(part)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all cursor-pointer"
              title="상세 정보 (Specs)"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          
          <button 
            onClick={() => handleLock(part)}
            disabled={part.is_locked || part.is_processing}
            className={`min-w-[80px] py-1.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-sm flex items-center justify-center cursor-pointer ${
              part.is_locked 
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                : part.is_processing
                ? 'bg-indigo-50 text-indigo-400 border border-indigo-100 cursor-wait'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_2px_10px_rgba(79,70,229,0.25)] hover:shadow-[0_4px_15px_rgba(79,70,229,0.4)] border-none'
            }`}
          >
            {part.is_locked ? 'Locked' : part.is_processing ? 'Wait...' : 'Lock'}
          </button>
        </div>
      </td>
    </tr>
  );
};
