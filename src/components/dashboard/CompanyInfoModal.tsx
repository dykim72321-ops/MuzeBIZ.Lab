import { X, ExternalLink, Building2, Briefcase } from 'lucide-react';

export interface CompanyInfo {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  summary?: string;
  website?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  info: CompanyInfo | null;
  isLoading: boolean;
  error: string | null;
}

export function CompanyInfoModal({ isOpen, onClose, info, isLoading, error }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-black text-slate-800 text-base">{info?.name || 'Company Info'}</h2>
              <p className="text-xs font-bold text-slate-500">{info?.symbol}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-slate-500">기업 정보를 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-500 font-bold text-sm bg-rose-50 rounded-lg border border-rose-100">
              {error}
            </div>
          ) : info ? (
            <div className="space-y-6">
              {/* Badges */}
              {(info.sector || info.industry) && (
                <div className="flex flex-wrap gap-2">
                  {info.sector && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 text-xs font-bold">
                      <Building2 className="w-3.5 h-3.5" />
                      {info.sector}
                    </div>
                  )}
                  {info.industry && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 text-xs font-bold">
                      <Briefcase className="w-3.5 h-3.5" />
                      {info.industry}
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Business Summary
                </h3>
                <div className="text-sm text-slate-600 leading-relaxed font-medium bg-slate-50 p-4 rounded-lg border border-slate-100">
                  {info.summary ? (
                    info.summary
                  ) : (
                    <span className="italic text-slate-400">기업 요약 정보가 제공되지 않았습니다 (Yahoo Finance 데이터 없음).</span>
                  )}
                </div>
              </div>

              {/* Links */}
              {info.website && (
                <div className="pt-2">
                  <a 
                    href={info.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-2 rounded-md transition-colors"
                  >
                    공식 웹사이트 방문 <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
