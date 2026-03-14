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
    handleRetryConnection, resetFilters
  } = useMuzepartSearch();

  type ViewMode = 'grid' | 'table';
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  return (
    <div className="space-y-6">
      {/* Connection Error Banner */}
      {!isBackendConnected && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <span className="text-rose-700 font-medium flex-1">{connectionError || '백엔드 서버에 연결할 수 없습니다'}</span>
          <button onClick={handleRetryConnection} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 rounded-lg text-rose-700 font-bold hover:bg-rose-100 transition-colors">
            <RefreshCw className="w-3 h-3" /> 재시도
          </button>
        </div>
      )}

      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
            <Search className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Global Sourcing</p>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">제품 검색</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="부품번호 (MPN) 입력..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sfdc-input w-72"
            />
            <button type="submit" className="sfdc-button-primary flex items-center gap-2">
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

          <div className="sfdc-card opacity-75 hover:opacity-100 transition-opacity">
            <div className="sfdc-card-header">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-tight">최근 검색</h3>
            </div>
            <div className="p-2 space-y-1">
              {searchHistory.length === 0 ? (
                <p className="text-[10px] text-slate-400 font-medium px-2 py-2">기록 없음</p>
              ) : (
                searchHistory.map((h: string, idx: number) => (
                  <button
                    key={`${h}-${idx}`}
                    onClick={() => handleSearch(undefined, h)}
                    className="w-full text-left px-3 py-1.5 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0176d3] transition-colors truncate"
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
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center text-rose-700 font-bold mb-6">
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
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-600">
                    <strong>{processedResults.length}</strong> results found
                  </span>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button 
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => setViewMode('table')}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button 
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#0176d3]' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={filterInStock} 
                      onChange={(e) => { setFilterInStock(e.target.checked); setCurrentPage(1); }}
                      className="rounded border-slate-300 text-[#0176d3] focus:ring-[#0176d3]"
                    />
                    재고 있음
                  </label>
                  
                  <select 
                    className="sfdc-select text-xs" 
                    value={filterDistributor}
                    onChange={(e) => { setFilterDistributor(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="all">모든 판매처</option>
                    {uniqueDistributors.map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <select 
                    className="sfdc-select text-xs" 
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
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className={`px-4 py-3 font-bold text-slate-700 uppercase tracking-tight cursor-pointer ${getSortClass(sortField, 'distributor', sortOrder)}`} onClick={() => handleSort('distributor')}>Distributor</th>
                        <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-tight">MPN / Manufacturer</th>
                        <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-tight">Package</th>
                        <th className={`px-4 py-3 font-bold text-slate-700 uppercase tracking-tight cursor-pointer ${getSortClass(sortField, 'stock', sortOrder)}`} onClick={() => handleSort('stock')}>Stock</th>
                        <th className={`px-4 py-3 font-bold text-slate-700 uppercase tracking-tight cursor-pointer ${getSortClass(sortField, 'price', sortOrder)}`} onClick={() => handleSort('price')}>Price</th>
                        <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-tight">Delivery</th>
                        <th className="px-4 py-3 font-bold text-slate-700 uppercase tracking-tight">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedResults.map((part: any) => (
                        <MuzepartResultRow 
                          key={`${part.id}-${part.distributor}`}
                          part={part}
                          handleLock={handleLock}
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
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ←
                  </button>
                  
                  {/* Smart Pagination Logic */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1)
                    .map((page, index, array) => (
                      <React.Fragment key={page}>
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 py-2 text-slate-400">...</span>
                        )}
                        <button 
                          onClick={() => setCurrentPage(page)}
                          className={`w-10 h-10 flex items-center justify-center font-bold rounded-lg transition-all ${currentPage === page ? 'bg-[#0176d3] text-white shadow-md' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'IDLE' && (
            <div className="sfdc-card">
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-[#0176d3]" />
                </div>
                <h2 className="text-xl font-black text-slate-900">검색 대기 중</h2>
                <p className="text-sm text-slate-500 font-medium">상단 검색창에 부품번호(MPN)를 입력하여 글로벌 소싱을 시작하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Inventory Secured</h2>
            <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tracking ID</p>
              <p className="font-mono text-[#0176d3] font-bold">{trackingId}</p>
            </div>
            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-8">
              선택한 부품의 수급 동결이 완료되었습니다.<br/>
              결제 대기 리스트에서 최종 승인을 진행해 주세요.
            </p>
            <button 
              onClick={() => setShowSuccess(false)}
              className="w-full py-4 bg-[#0176d3] text-white font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
            >
              확인 후 계속하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
