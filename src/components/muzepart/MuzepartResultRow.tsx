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
import { Globe } from 'lucide-react';

interface MuzepartResultRowProps {
  part: ComponentPart;
  handleLock: (part: ComponentPart) => void;
}

export const MuzepartResultRow: React.FC<MuzepartResultRowProps> = ({ 
  part, 
  handleLock 
}) => {
  return (
    <tr key={`${part.id}-${part.distributor}`} className="hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-4">
        <span className={`distributor-badge ${getDistributorBadgeClass(part.distributor)}`}>
          {part.distributor}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          {getBrandIcon(part.manufacturer)}
          <div className="flex flex-col">
            <span className="font-bold text-slate-900">{part.mpn}</span>
            {part.is_alternative && (
              <span className="family-tag ml-2">Family Match</span>
            )}
            <span className="text-[10px] font-bold text-slate-400 uppercase">{part.manufacturer}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-xs font-bold text-slate-600">{(part as any).package || 'N/A'}</span>
      </td>
      <td className="px-4 py-4">
        <span className={`font-bold ${getStockClass(part.stock)}`}>
          {part.stock > 0 ? part.stock.toLocaleString() : 'Check'}
        </span>
      </td>
      <td className="px-4 py-4 font-black text-slate-900">
        <div className="flex flex-col">
          <span>{part.price > 0 ? `${part.price.toLocaleString()} ${part.currency}` : 'Quote'}</span>
          {part.risk_score !== undefined && (
            <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border ${getRiskScoreClass(part.risk_score)}`}>
              {getRiskLabel(part.risk_score)} {part.risk_score}%
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col">
          <span className="text-slate-600 text-xs font-medium">{part.delivery}</span>
          {part.market_notes && (
            <span className="text-[9px] text-slate-400 mt-0.5 italic truncate max-w-[120px]" title={part.market_notes}>
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
            className="p-2 text-slate-400 hover:text-[#0176d3] hover:bg-blue-50 rounded-lg transition-all"
            title="판매 사이트 방문"
          >
            <Globe className="w-4 h-4" />
          </a>
          <button 
            onClick={() => handleLock(part)}
            disabled={part.is_locked || part.is_processing}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${
              part.is_locked 
                ? 'bg-slate-900 text-white cursor-default' 
                : part.is_processing
                ? 'bg-blue-400 text-white cursor-wait'
                : 'bg-[#0176d3] text-white hover:bg-blue-700'
            }`}
          >
            {part.is_locked ? 'LOCKED' : part.is_processing ? 'Processing...' : 'LOCK'}
          </button>
        </div>
      </td>
    </tr>
  );
};
