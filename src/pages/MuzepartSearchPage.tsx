import React, { useState } from 'react';
import { useMuzepartSearch } from '../hooks/useMuzepartSearch';
import { MuzepartMarketIntel } from '../components/muzepart/MuzepartMarketIntel';
import { MuzepartResultRow } from '../components/muzepart/MuzepartResultRow';
import { MuzepartResultCard } from '../components/muzepart/MuzepartResultCard';
import { getSortClass } from '../components/muzepart/MuzepartUI';
import { MuzepartFacets } from '../components/muzepart/MuzepartFacets';
import { 
  Search, ShieldCheck, 
  LayoutGrid, List, AlertTriangle, RefreshCw
} from 'lucide-react';
import type { SortField } from '../types/muzepart';
import './MuzepartSearchPage.css';

export const MuzepartSearchPage: React.FC = () => {
  const {
    phase, query, setQuery,
    paginatedResults, processedResults,
    history: searchHistory, logs, error,
    isBackendConnected, connectionError,
    sortField, sortOrder,
    filterInStock, setFilterInStock,
    filterDistributor, setFilterDistributor,
    filterManufacturer, setFilterManufacturer,
    filterPackage, setFilterPackage,
    specKeys, specValues,
    dynamicFilters, setDynamicFilters,
    currentPage, setCurrentPage,
    totalPages, uniqueDistributors,
    uniqueManufacturers, uniquePackages,
    intelData, showSuccess, setShowSuccess,
    trackingId, handleSearch,
    handleSort, handleLock,
    fetchPartDetails,
    handleRetryConnection, resetFilters
  } = useMuzepartSearch();

  const [detailPart, setDetailPart] = useState<any | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const onShowDetails = async (part: any) => {
    setDetailPart(part);
    setIsFetchingDetails(true);
    await fetchPartDetails(part.product_url);
    setIsFetchingDetails(false);
  };

  type ViewMode = 'grid' | 'table';
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  return (
    <div className="space-y-6">
      {/* Connection Error Banner */}
      {!isBackendConnected && (
        <div className="flex items-center gap-3 p-4 bg-rose-900/20 border border-rose-500/30 rounded-xl text-sm shadow-[0_0_15px_rgba(244,63,94,0.1)]">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span className="text-rose-300 font-medium flex-1">{connectionError || '백엔드 서버에 연결할 수 없습니다'}</span>
          <button onClick={handleRetryConnection} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/50 border border-rose-400/30 rounded-lg text-rose-400 font-bold hover:bg-rose-800/50 transition-colors">
            <RefreshCw className="w-3 h-3" /> 재시도
          </button>
        </div>
      )}

      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 dark-glass-panel p-6 rounded-[2rem] border border-white/10 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-md">
            <Search className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-0.5">Global Sourcing</p>
            <h1 className="text-3xl font-black text-white leading-tight">제품 검색</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="부품번호 (MPN) 입력..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72 bg-[#0d1527]/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold placeholder-slate-450 focus:border-indigo-500/60 focus:bg-[#0d1527]/80 transition-all text-slate-200 font-mono outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl transition-all text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg active:scale-95 cursor-pointer">
              검색
            </button>
          </form>
        </div>
      </header>

      {/* Market Intel Section */}
      <MuzepartMarketIntel intelData={intelData} resultsCount={processedResults.length} />

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Filters & History */}
        <div className="space-y-6">
          <MuzepartFacets 
            uniqueDistributors={uniqueDistributors}
            uniqueManufacturers={uniqueManufacturers}
            uniquePackages={uniquePackages}
            filterDistributor={filterDistributor}
            setFilterDistributor={setFilterDistributor}
            filterManufacturer={filterManufacturer}
            setFilterManufacturer={setFilterManufacturer}
            filterPackage={filterPackage}
            setFilterPackage={setFilterPackage}
            filterInStock={filterInStock}
            setFilterInStock={setFilterInStock}
            specKeys={specKeys}
            specValues={specValues}
            dynamicFilters={dynamicFilters}
            setDynamicFilters={setDynamicFilters}
            resetFilters={resetFilters}
          />

          <div className="dark-glass-panel border border-white/10 rounded-[1.5rem] p-4 shadow-2xl opacity-75 hover:opacity-100 transition-opacity">
            <div className="border-b border-white/10 pb-3 mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">최근 검색</h3>
            </div>
            <div className="space-y-1">
              {searchHistory.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium px-2 py-2">기록 없음</p>
              ) : (
                searchHistory.map((h: string, idx: number) => (
                  <button
                    key={`${h}-${idx}`}
                    onClick={() => handleSearch(undefined, h)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-cyan-400 transition-colors truncate cursor-pointer"
                  >
                    🛰️ {h.toUpperCase()}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3">
          {error && (
            <div className="p-6 bg-rose-900/20 border border-rose-500/30 rounded-xl text-center text-rose-400 font-bold mb-6">
              [SYSTEM ERROR] {error}
            </div>
          )}

          {phase === 'SCOUTING' && (
            <div className="fade-in">
              <div className="scout-container">
                <div className="radar-premium"></div>
                <h2 className="glow-text text-center text-xl font-bold mb-4">Scouting Global Supply Chain...</h2>
                <div className="terminal-feed bg-slate-900 text-emerald-400 p-4 rounded-lg font-mono text-xs h-32 overflow-y-auto shadow-inner border border-slate-800">
                    {logs.map((log: string, i: number) => (
                        <div key={i} className="flex gap-4 mb-1">
                            <span className="text-slate-500 text-[10px]">{new Date().toLocaleTimeString()}</span>
                            <span className="event">{log}</span>
                        </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'RESULTS' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 dark-glass-panel rounded-xl border border-white/10 shadow-2xl">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-300">
                    <strong className="text-white">{processedResults.length}</strong> results found
                  </span>
                  <div className="flex bg-slate-900/50 p-1 rounded-lg border border-white/10">
                    <button 
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'table' ? 'bg-[#111c35]/60 shadow-sm text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                      onClick={() => setViewMode('table')}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button 
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[#111c35]/60 shadow-sm text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={filterInStock} 
                      onChange={(e) => { setFilterInStock(e.target.checked); setCurrentPage(1); }}
                      className="rounded border-white/10 bg-white/5 text-indigo-500 focus:ring-indigo-500/20"
                    />
                    재고 있음
                  </label>
                  
                  <select 
                    className="bg-[#0d1527]/50 border border-white/10 text-xs font-bold text-slate-300 rounded-lg px-3 py-1.5 focus:border-indigo-500/60 focus:bg-[#0d1527]/80 outline-none transition-all cursor-pointer" 
                    value={filterDistributor}
                    onChange={(e) => { setFilterDistributor(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="all">모든 판매처</option>
                    {uniqueDistributors.map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <select 
                    className="bg-[#0d1527]/50 border border-white/10 text-xs font-bold text-slate-300 rounded-lg px-3 py-1.5 focus:border-indigo-500/60 focus:bg-[#0d1527]/80 outline-none transition-all cursor-pointer" 
                    value={sortField === 'none' ? '' : `${sortField}-${sortOrder}`}
                    onChange={(e) => {
                      if (!e.target.value) {
                         handleSort('none');
                      } else {
                        const [field] = e.target.value.split('-') as [SortField, string];
                        handleSort(field);
                      }
                    }}
                  >
                    <option value="">정렬 기준...</option>
                    <option value="price-asc">가격 낮은 순</option>
                    <option value="price-desc">가격 높은 순</option>
                    <option value="stock-desc">재고 많은 순</option>
                    <option value="stock-asc">재고 적은 순</option>
                  </select>
                </div>
              </div>

              {/* Table View */}
              {viewMode === 'table' ? (
                <div className="dark-glass-panel rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#101828]/60 border-b border-white/10">
                      <tr>
                        <th className={`px-4 py-3 font-bold text-slate-400 uppercase tracking-wider cursor-pointer ${getSortClass(sortField, 'distributor', sortOrder)}`} onClick={() => handleSort('distributor')}>Distributor</th>
                        <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-wider">MPN / Manufacturer</th>
                        <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-wider">Package</th>
                        <th className={`px-4 py-3 font-bold text-slate-400 uppercase tracking-wider cursor-pointer ${getSortClass(sortField, 'stock', sortOrder)}`} onClick={() => handleSort('stock')}>Stock</th>
                        <th className={`px-4 py-3 font-bold text-slate-400 uppercase tracking-wider cursor-pointer ${getSortClass(sortField, 'price', sortOrder)}`} onClick={() => handleSort('price')}>Price</th>
                        <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-wider">Delivery</th>
                        <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {paginatedResults.map((part: any) => (
                        <MuzepartResultRow 
                          key={`${part.id}-${part.distributor}`}
                          part={part}
                          handleLock={handleLock}
                          onShowDetails={onShowDetails}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paginatedResults.map((part: any) => (
                    <MuzepartResultCard 
                      key={`${part.id}-${part.distributor}`}
                      part={part}
                      handleLock={handleLock}
                      onShowDetails={onShowDetails}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-slate-350 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    ←
                  </button>
                  
                  {/* Smart Pagination Logic */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1)
                    .map((page, index, array) => (
                      <React.Fragment key={page}>
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 py-2 text-slate-500">...</span>
                        )}
                        <button 
                          onClick={() => setCurrentPage(page)}
                          className={`w-10 h-10 flex items-center justify-center font-bold rounded-lg transition-all cursor-pointer ${currentPage === page ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-slate-355 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'IDLE' && (
            <div className="dark-glass-panel border border-white/10 rounded-[2rem] p-6 shadow-2xl">
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/20 shadow-md">
                  <Search className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-xl font-black text-white">검색 대기 중</h2>
                <p className="text-xs text-slate-400 font-bold">상단 검색창에 부품번호(MPN)를 입력하여 글로벌 소싱을 시작하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#0b1222]/80 backdrop-blur-sm">
          <div className="dark-glass-panel border border-white/10 rounded-[2rem] max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300 shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Inventory Secured</h2>
            <div className="bg-[#101828]/60 p-4 rounded-xl mb-6 border border-white/10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 font-mono">Tracking ID</p>
              <p className="font-mono text-cyan-400 font-bold">{trackingId}</p>
            </div>
            <p className="text-xs text-slate-300 font-bold leading-relaxed mb-8">
              선택한 부품의 수급 동결이 완료되었습니다.<br/>
              결제 대기 리스트에서 최종 승인을 진행해 주세요.
            </p>
            <button 
              onClick={() => setShowSuccess(false)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-550 text-white font-black rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              확인 후 계속하기
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailPart && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#0b1222]/80 backdrop-blur-sm">
          <div className="dark-glass-panel border border-white/10 rounded-[2rem] max-w-2xl w-full p-0 overflow-hidden animate-in fade-in zoom-in duration-300 shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#101828]/60">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg shadow-sm">
                  <Search className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">Extended Specifications</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">{detailPart.mpn}</p>
                </div>
              </div>
              <button 
                onClick={() => setDetailPart(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isFetchingDetails ? (
                <div className="py-20 text-center space-y-4">
                  <div className="loading-spinner-premium mx-auto"></div>
                  <p className="text-xs font-bold text-slate-400">Fetching deep specs from {detailPart.distributor}...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-[#101828]/60 rounded-xl border border-white/10">
                      <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-2">Core Identity</p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">Manufacturer</span>
                          <span className="text-xs font-bold text-white">{detailPart.manufacturer}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">Package</span>
                          <span className="text-xs font-bold text-white">{detailPart.package || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-400">RoHS</span>
                          <span className={`text-xs font-bold ${detailPart.rohs ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {detailPart.rohs ? 'Compliant' : 'Non-Compliant'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-[#101828]/60 rounded-xl border border-white/10 h-full">
                      <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-2">Technical Specs</p>
                      <div className="space-y-2">
                        {detailPart.specs && Object.keys(detailPart.specs).length > 0 ? (
                          Object.entries(detailPart.specs).map(([k, v]) => (
                            <div key={k} className="flex justify-between border-b border-white/5 pb-1">
                              <span className="text-xs text-slate-400">{k}</span>
                              <span className="text-xs font-bold text-white text-right ml-2">{v as string}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 italic">No additional specs found.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-[#101828]/60 border-t border-white/10 flex justify-end gap-3">
              <button 
                onClick={() => setDetailPart(null)}
                className="px-6 py-2 bg-white/5 border border-white/10 text-slate-300 font-bold rounded-xl hover:bg-white/10 transition-all cursor-pointer text-xs"
              >
                Close
              </button>
              <button 
                onClick={() => { handleLock(detailPart); setDetailPart(null); }}
                className="px-6 py-2 bg-[#0176d3] text-white font-bold rounded-xl hover:bg-blue-700 shadow-md transition-all cursor-pointer text-xs"
              >
                Proceed to Lock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
