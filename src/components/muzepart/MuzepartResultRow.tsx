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
import { Globe, Info } from 'lucide-react';

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
    <tr key={`${part.id}-${part.distributor}`} className="hover:bg-white/5 transition-colors">
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
            <span className="text-base font-extrabold text-white font-mono">{part.mpn}</span>
            {part.is_alternative && (
              <span className="family-tag mt-1">Family Match</span>
            )}
            <span className="text-xs font-bold text-slate-400 uppercase mt-0.5">{part.manufacturer}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-sm font-semibold text-slate-200">{(part as any).package || 'N/A'}</span>
      </td>
      <td className="px-4 py-4">
        <span className={`text-sm font-extrabold ${getStockClass(part.stock)}`}>
          {part.stock > 0 ? part.stock.toLocaleString() : 'Check'}
        </span>
      </td>
      <td className="px-4 py-4 font-black text-white">
        <div className="flex flex-col">
          <span className="text-base font-black font-mono">{part.price > 0 ? `${part.price.toLocaleString()} ${part.currency}` : 'Quote'}</span>
          {part.risk_score !== undefined && (
            <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="text-slate-200 text-sm font-medium">{part.delivery}</span>
          {part.market_notes && (
            <span className="text-xs text-slate-400 mt-1 italic truncate max-w-[120px]" title={part.market_notes}>
              {part.market_notes}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <a
            href={getDistributorUrl(part)}
            target="_blank"
            rel="noreferrer noopener"
            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            title="판매 사이트 방문"
          >
            <Globe className="w-4 h-4" />
          </a>
          <button
            onClick={() => onShowDetails(part)}
            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            title="상세 정보 (Specs)"
          >
            <Info className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleLock(part)}
            disabled={part.is_locked || part.is_processing}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer ${
              part.is_locked 
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-default' 
                : part.is_processing
                ? 'bg-cyan-600/40 text-cyan-400 cursor-wait'
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
