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
    <tr key={`${part.id}-${part.distributor}`} className="hover:bg-slate-50/70 transition-colors">
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
        <div className="flex items-center gap-3">
          {getBrandIcon(part.manufacturer)}
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-slate-900 font-mono">{part.mpn}</span>
            {part.is_alternative && (
              <span className="family-tag mt-1">Family Match</span>
            )}
            <span className="text-xs font-semibold text-slate-500 uppercase mt-0.5">{part.manufacturer}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-sm font-semibold text-slate-700">{(part as any).package || 'N/A'}</span>
      </td>
      <td className="px-4 py-4">
        <span className={`text-sm font-extrabold ${getStockClass(part.stock)}`}>
          {part.stock > 0 ? part.stock.toLocaleString() : 'Check'}
        </span>
      </td>
      <td className="px-4 py-4 font-black text-slate-900">
        <div className="flex flex-col relative group">
          <span className={`text-base font-black font-mono w-fit ${part.priceBreaks && part.priceBreaks.length > 0 ? 'cursor-help border-b border-dashed border-slate-300' : ''}`}>
            {part.price > 0 ? `${part.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${part.currency}` : 'Quote'}
          </span>
          {part.priceBreaks && part.priceBreaks.length > 0 && (
            <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50">
              <div className="bg-slate-900 text-slate-50 text-xs rounded-xl p-3 shadow-xl border border-slate-700 min-w-[160px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-700 pb-1">Tiered Pricing</p>
                <div className="space-y-1">
                  {part.priceBreaks.map((pb, idx) => (
                    <div key={idx} className="flex justify-between items-center gap-4">
                      <span className="text-slate-300">{pb.quantity.toLocaleString()}+</span>
                      <span className="font-mono font-bold">{pb.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {part.risk_score !== undefined && (
            <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border w-fit ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="text-slate-700 text-sm font-medium">{part.delivery}</span>
          {part.market_notes && (
            <span className="text-xs text-slate-500 mt-1 italic truncate max-w-[120px]" title={part.market_notes}>
              {part.market_notes}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          {part.datasheet && (
            <a
              href={part.datasheet}
              target="_blank"
              rel="noreferrer noopener"
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              title="데이터시트 (PDF)"
            >
              <FileText className="w-4 h-4" />
            </a>
          )}
          <a
            href={getDistributorUrl(part)}
            target="_blank"
            rel="noreferrer noopener"
            className="p-2 text-slate-500 hover:text-cyan-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            title="판매 사이트 방문"
          >
            <Globe className="w-4 h-4" />
          </a>
          <button
            onClick={() => onShowDetails(part)}
            className="p-2 text-slate-500 hover:text-cyan-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            title="상세 정보 (Specs)"
          >
            <Info className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleLock(part)}
            disabled={part.is_locked || part.is_processing}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer ${
              part.is_locked 
                ? 'bg-slate-100 text-slate-500 border border-slate-200/80 cursor-default' 
                : part.is_processing
                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200/50 cursor-wait'
                : 'bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black shadow-cyan-500/10'
            }`}
          >
            {part.is_locked ? 'LOCKED' : part.is_processing ? 'Processing...' : 'LOCK'}
          </button>
        </div>
      </td>
    </tr>
  );
};
