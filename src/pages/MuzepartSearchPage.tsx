import React, { useState } from 'react';
import { useMuzepartSearch } from '../hooks/useMuzepartSearch';
import { MuzepartMarketIntel } from '../components/muzepart/MuzepartMarketIntel';
import { MuzepartResultRow } from '../components/muzepart/MuzepartResultRow';
import { MuzepartResultCard } from '../components/muzepart/MuzepartResultCard';
import { MuzepartSkeletonRow } from '../components/muzepart/MuzepartSkeletonRow';
import { getSortClass } from '../components/muzepart/muzepartHelpers';
import { MuzepartFacets } from '../components/muzepart/MuzepartFacets';
import { 
  Search, ShieldCheck, 
  LayoutGrid, List, AlertTriangle, RefreshCw
} from 'lucide-react';
import type { SortField, ComponentPart } from '../types/muzepart';
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
    handleRetryConnection, resetFilters,
    isSearchFetching
  } = useMuzepartSearch();

  const [detailPart, setDetailPart] = useState<ComponentPart | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const onShowDetails = async (part: ComponentPart) => {
    setDetailPart(part);
    setIsFetchingDetails(true);
    if (part.product_url) {
      await fetchPartDetails(part.product_url);
    }
    setIsFetchingDetails(false);
  };

  type ViewMode = 'grid' | 'table';
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  return (
    <div className="space-y-6 bg-[#fbfdff] p-4 md:p-8 lg:p-10 min-h-screen">
      {/* Connection Error Banner */}
      {!isBackendConnected && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm shadow-sm">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <span className="text-rose-700 font-bold flex-1">{connectionError || '백엔드 서버에 연결할 수 없습니다'}</span>
          <button onClick={handleRetryConnection} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 border border-rose-200 rounded-lg text-rose-700 font-bold hover:bg-rose-200 transition-colors">
            <RefreshCw className="w-3 h-3" /> 재시도
          </button>
        </div>
      )}

      {/* Page Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 w-full">
        <div className="flex items-center gap-4 w-full lg:w-auto flex-shrink-0">
          <div className="p-3 bg-cyan-50 border border-cyan-150 rounded-xl shadow-sm">
            <Search className="w-6 h-6 text-cyan-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-cyan-700 uppercase tracking-widest mb-0.5 font-mono">Global Sourcing</p>
            <h1 className="text-3xl font-black text-blue-900 leading-tight">제품 검색</h1>
          </div>
        </div>
        
        <div className="bg-white/80 backdrop-blur-xl px-6 py-4 rounded-xl flex items-center gap-6 border border-blue-200 shadow-sm w-full lg:w-auto">
          <form onSubmit={handleSearch} className="flex items-center gap-2 w-full">
            <input
              type="text"
              placeholder="부품번호 (MPN) 입력..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-72 bg-white border border-blue-200 rounded-xl px-4 py-2.5 text-xs font-bold placeholder-blue-400 focus:border-indigo-500 focus:bg-white transition-all text-blue-800 font-mono outline-none focus:ring-2 focus:ring-indigo-500/15"
            />
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all text-xs font-bold uppercase tracking-wider shadow-sm hover:shadow active:scale-95 cursor-pointer font-sans">
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

          <div className="dark-glass-panel border border-blue-200/85 rounded-2xl p-4 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
            <div className="border-b border-blue-100 pb-3 mb-3">
              <h3 className="text-xs font-extrabold text-blue-700 uppercase tracking-widest">최근 검색</h3>
            </div>
            <div className="space-y-1">
              {searchHistory.length === 0 ? (
                <p className="text-xs text-blue-500 font-semibold px-2 py-2">기록 없음</p>
              ) : (
                searchHistory.map((h: string, idx: number) => (
                  <button
                    key={`${h}-${idx}`}
                    onClick={() => handleSearch(undefined, h)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50 hover:text-cyan-600 transition-colors truncate cursor-pointer"
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
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center text-rose-600 font-bold mb-6">
              [SYSTEM ERROR] {error}
            </div>
          )}

          {phase === 'SCOUTING' && (
            <div className="fade-in space-y-6">
              <div className="relative overflow-hidden flex flex-col md:flex-row items-stretch bg-slate-900 rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.05)]">
                {/* Radar Section */}
                <div className="relative w-full md:w-64 flex-shrink-0 bg-slate-950/50 border-b md:border-b-0 md:border-r border-slate-800/80 overflow-hidden flex items-center justify-center p-8 min-h-[240px]">
                  {/* Glowing background aura */}
                  <div className="absolute inset-0 bg-cyan-500/10 blur-3xl rounded-full" />
                  
                  {/* Radar Base */}
                  <div className="relative w-40 h-40 rounded-full border border-cyan-900/40 bg-slate-900 shadow-[inset_0_0_30px_rgba(6,182,212,0.1)] flex items-center justify-center overflow-hidden">
                    {/* Crosshairs */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-[1px] bg-cyan-500/20" />
                      <div className="absolute h-full w-[1px] bg-cyan-500/20" />
                    </div>
                    
                    {/* Concentric rings */}
                    <svg className="w-full h-full absolute inset-0" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(6,182,212,0.3)" strokeWidth="0.5" strokeDasharray="2 2" />
                      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5" />
                      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="0.5" />
                    </svg>

                    {/* Rotating Sweep */}
                    <div className="absolute w-full h-full animate-spin" style={{ animationDuration: '3s', animationTimingFunction: 'linear' }}>
                      <div 
                        className="w-1/2 h-1/2 absolute top-0 left-0"
                        style={{
                          background: 'conic-gradient(from 0deg at 100% 100%, transparent 0deg, rgba(6,182,212,0.1) 60deg, rgba(6,182,212,0.6) 90deg)',
                          borderBottom: '1.5px solid rgba(6,182,212,0.9)',
                        }}
                      />
                    </div>

                    {/* Blips */}
                    <div className="absolute w-2 h-2 rounded-full bg-cyan-400 top-1/4 left-1/3 animate-ping" />
                    <div className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 bottom-1/3 right-1/4 animate-pulse shadow-[0_0_8px_rgba(52,211,153,1)]" />
                    
                    {/* Center point */}
                    <div className="absolute w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,1)]" />
                  </div>
                </div>

                {/* Terminal Section */}
                <div className="flex-1 p-6 relative flex flex-col justify-center">
                  <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <svg className="w-24 h-24 text-cyan-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                    </svg>
                  </div>
                  
                  <h2 className="text-sm font-black mb-4 font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    Scouting Global Supply Chain
                  </h2>
                  
                  <div className="terminal-feed bg-[#050b14] text-emerald-400/90 p-5 rounded-xl font-mono text-xs h-36 overflow-y-auto border border-slate-800/80 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]">
                      {logs.map((log: string, i: number) => (
                          <div key={i} className="flex gap-4 mb-2 opacity-90 hover:opacity-100 transition-opacity">
                              <span className="text-slate-500 w-16 flex-shrink-0">[{new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                              <span className="text-emerald-400 flex-1 break-all">{log}</span>
                          </div>
                      ))}
                      <div className="flex gap-4 mt-2 opacity-60">
                          <span className="text-slate-500 w-16">[{new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                          <span className="text-cyan-500 animate-pulse">_</span>
                      </div>
                  </div>
                </div>
              </div>
              
              {/* Skeleton Table */}
              <div className="dark-glass-panel rounded-xl border border-blue-200/85 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-blue-50 border-b border-blue-200/60">
                    <tr>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-24 animate-pulse"></div></th>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-40 animate-pulse"></div></th>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-16 animate-pulse"></div></th>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-20 animate-pulse"></div></th>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-24 animate-pulse"></div></th>
                      <th className="px-4 py-3"><div className="h-4 bg-blue-200 rounded w-16 animate-pulse"></div></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {[...Array(5)].map((_, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-4"><div className="h-6 bg-blue-100 rounded-md w-20 animate-pulse"></div></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-blue-100 animate-pulse"></div>
                            <div className="space-y-2">
                              <div className="h-4 bg-blue-100 rounded w-32 animate-pulse"></div>
                              <div className="h-3 bg-blue-100 rounded w-20 animate-pulse"></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><div className="h-4 bg-blue-100 rounded w-16 animate-pulse"></div></td>
                        <td className="px-4 py-4"><div className="h-5 bg-blue-100 rounded w-16 animate-pulse"></div></td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <div className="h-5 bg-blue-100 rounded w-24 animate-pulse"></div>
                            <div className="h-4 bg-blue-100 rounded w-16 animate-pulse"></div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><div className="h-4 bg-blue-100 rounded w-24 animate-pulse"></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {phase === 'RESULTS' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-blue-200/85 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-blue-650 font-medium">
                    <strong className="text-blue-900 font-bold">{processedResults.length}</strong> results found
                  </span>
                  <div className="flex bg-blue-100 p-1 rounded-xl border border-blue-200/60">
                    <button 
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white shadow-sm text-cyan-600 border border-cyan-200/50' : 'text-blue-500 hover:text-blue-900'}`}
                      onClick={() => setViewMode('table')}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button 
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white shadow-sm text-cyan-600 border border-cyan-200/50' : 'text-blue-500 hover:text-blue-900'}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-blue-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={filterInStock} 
                      onChange={(e) => { setFilterInStock(e.target.checked); setCurrentPage(1); }}
                      className="rounded border-blue-300 bg-white text-indigo-600 focus:ring-indigo-500/20"
                    />
                    재고 있음
                  </label>
                  
                  <select 
                    className="bg-white border border-blue-200 text-xs font-bold text-blue-700 rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:bg-blue-50 outline-none transition-all cursor-pointer" 
                    value={filterDistributor}
                    onChange={(e) => { setFilterDistributor(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="all">모든 판매처</option>
                    {uniqueDistributors.map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <select 
                    className="bg-white border border-blue-200 text-xs font-bold text-blue-700 rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:bg-blue-50 outline-none transition-all cursor-pointer" 
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
                <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100/80 border-b border-slate-200">
                      <tr>
                        <th className={`w-[15%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest cursor-pointer hover:bg-slate-200/50 transition-colors ${getSortClass(sortField, 'distributor', sortOrder)}`} onClick={() => handleSort('distributor')}>Distributor</th>
                        <th className="w-[30%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest">Part Number</th>
                        <th className={`w-[10%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest cursor-pointer hover:bg-slate-200/50 transition-colors ${getSortClass(sortField, 'stock', sortOrder)}`} onClick={() => handleSort('stock')}>Stock</th>
                        <th className={`w-[20%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest cursor-pointer hover:bg-slate-200/50 transition-colors ${getSortClass(sortField, 'price', sortOrder)}`} onClick={() => handleSort('price')}>Price</th>
                        <th className="w-[15%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest">Delivery</th>
                        <th className="w-[10%] px-5 py-4 text-[11px] font-black text-slate-800 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {isSearchFetching ? (
                        Array.from({ length: 5 }).map((_, idx) => (
                          <MuzepartSkeletonRow key={`skeleton-${idx}`} />
                        ))
                      ) : (
                        paginatedResults.map((part: ComponentPart) => (
                          <MuzepartResultRow 
                            key={`${part.id}-${part.distributor}`}
                            part={part}
                            handleLock={handleLock}
                            onShowDetails={onShowDetails}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isSearchFetching ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <div key={`skeleton-card-${idx}`} className="h-[280px] bg-slate-100 rounded-2xl animate-pulse"></div>
                    ))
                  ) : (
                    paginatedResults.map((part: ComponentPart) => (
                      <MuzepartResultCard 
                        key={`${part.id}-${part.distributor}`}
                        part={part}
                        handleLock={handleLock}
                        onShowDetails={onShowDetails}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-2 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    ←
                  </button>
                  
                  {/* Smart Pagination Logic */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1)
                    .map((page, index, array) => (
                      <React.Fragment key={page}>
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 py-2 text-blue-500">...</span>
                        )}
                        <button 
                          onClick={() => setCurrentPage(page)}
                          className={`w-10 h-10 flex items-center justify-center font-bold rounded-lg transition-all cursor-pointer ${currentPage === page ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/20' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'}`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-2 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'IDLE' && (
            <div className="dark-glass-panel border border-blue-200/85 rounded-2xl p-6 shadow-sm">
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 bg-cyan-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-200/60 shadow-sm">
                  <Search className="w-8 h-8 text-cyan-600" />
                </div>
                <h2 className="text-xl font-black text-blue-900">검색 대기 중</h2>
                <p className="text-xs text-blue-650 font-bold">상단 검색창에 부품번호(MPN)를 입력하여 글로벌 소싱을 시작하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-blue-900/40 backdrop-blur-sm">
          <div className="bg-white border border-blue-200/85 rounded-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none cockpit-carbon" />
            <div className="w-20 h-20 bg-emerald-50 border border-emerald-250 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-black text-blue-900 mb-2 uppercase tracking-tight relative z-10">Inventory Secured</h2>
            <div className="bg-blue-50 p-4 rounded-xl mb-6 border border-blue-200/60 relative z-10">
              <p className="text-xs font-bold text-blue-650 uppercase tracking-widest mb-1 font-mono">Tracking ID</p>
              <p className="font-mono text-cyan-700 font-bold">{trackingId}</p>
            </div>
            <p className="text-xs text-blue-650 font-bold leading-relaxed mb-8 relative z-10">
              선택한 부품의 수급 동결이 완료되었습니다.<br/>
              결제 대기 리스트에서 최종 승인을 진행해 주세요.
            </p>
            <button 
              onClick={() => setShowSuccess(false)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer relative z-10"
            >
              확인 후 계속하기
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailPart && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-blue-900/40 backdrop-blur-sm">
          <div className="bg-white border border-blue-200/85 rounded-2xl max-w-2xl w-full p-0 overflow-hidden animate-in fade-in zoom-in duration-300 shadow-xl relative">
            <div className="absolute inset-0 opacity-[0.01] pointer-events-none cockpit-carbon" />
            <div className="p-6 border-b border-blue-200/60 flex items-center justify-between bg-blue-50 relative z-10">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-cyan-50 border border-cyan-150 rounded-lg shadow-sm">
                  <Search className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-blue-900 leading-tight">Extended Specifications</h2>
                  <p className="text-xs font-bold text-blue-650 uppercase tracking-widest font-mono">{detailPart.mpn}</p>
                </div>
              </div>
              <button 
                onClick={() => setDetailPart(null)}
                className="p-2 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer text-blue-500 hover:text-blue-900 font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isFetchingDetails ? (
                <div className="py-20 text-center space-y-4">
                  <div className="loading-spinner-premium mx-auto"></div>
                  <p className="text-xs font-bold text-blue-650">Fetching deep specs from {detailPart.distributor}...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200/60">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2">Core Identity</p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-xs text-blue-600">Manufacturer</span>
                          <span className="text-xs font-bold text-blue-900">{detailPart.manufacturer}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-blue-600">Package</span>
                          <span className="text-xs font-bold text-blue-900">{detailPart.specs?.package || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-blue-600">RoHS</span>
                          <span className={`text-xs font-bold ${detailPart.specs?.rohs ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {detailPart.specs?.rohs ? 'Compliant' : 'Non-Compliant'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200/60 h-full">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2">Technical Specs</p>
                      <div className="space-y-2">
                        {detailPart.specs && Object.keys(detailPart.specs).length > 0 ? (
                           Object.entries(detailPart.specs).map(([k, v]) => (
                            <div key={k} className="flex justify-between border-b border-blue-100 pb-1">
                              <span className="text-xs text-blue-600">{k}</span>
                              <span className="text-xs font-bold text-blue-900 text-right ml-2">{v as string}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-blue-500 italic">No additional specs found.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-blue-50 border-t border-blue-200/60 flex justify-end gap-3 relative z-10">
              <button 
                onClick={() => setDetailPart(null)}
                className="px-6 py-2 bg-white border border-blue-250 text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all cursor-pointer text-xs font-mono"
              >
                Close
              </button>
              <button 
                onClick={() => { handleLock(detailPart); setDetailPart(null); }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer text-xs font-mono"
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
