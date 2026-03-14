import React from 'react';
import { Filter, Factory, Box, AlertCircle } from 'lucide-react';

interface MuzepartFacetsProps {
  uniqueDistributors: string[];
  uniqueManufacturers: string[];
  uniquePackages: string[];
  filterDistributor: string;
  setFilterDistributor: (val: string) => void;
  filterManufacturer: string;
  setFilterManufacturer: (val: string) => void;
  filterPackage: string;
  setFilterPackage: (val: string) => void;
  filterInStock: boolean;
  setFilterInStock: (val: boolean) => void;
  specKeys: string[];
  specValues: Record<string, string[]>;
  dynamicFilters: Record<string, string>;
  setDynamicFilters: (val: Record<string, string>) => void;
  resetFilters: () => void;
}

export const MuzepartFacets: React.FC<MuzepartFacetsProps> = ({
  uniqueDistributors,
  uniqueManufacturers,
  uniquePackages,
  filterDistributor,
  setFilterDistributor,
  filterManufacturer,
  setFilterManufacturer,
  filterPackage,
  setFilterPackage,
  filterInStock,
  setFilterInStock,
  specKeys,
  specValues,
  dynamicFilters,
  setDynamicFilters,
  resetFilters
}) => {
  const handleDynamicFilterChange = (key: string, value: string) => {
    setDynamicFilters({
      ...dynamicFilters,
      [key]: value
    });
  };
  return (
    <div className="sfdc-card">
      <div className="sfdc-card-header flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#0176d3]" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Intelligence Filters</h3>
        </div>
        <button 
          onClick={resetFilters}
          className="text-[10px] font-bold text-[#0176d3] hover:underline"
        >
          Reset
        </button>
      </div>
      
      <div className="p-4 space-y-6">
        {/* Availability */}
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-3 px-1">
            <AlertCircle className="w-3 h-3" />
            Stock Status
          </label>
          <div 
            onClick={() => setFilterInStock(!filterInStock)}
            className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${filterInStock ? 'border-[#0176d3] bg-blue-50' : 'border-slate-100 hover:border-slate-200 bg-slate-50'}`}
          >
            <span className={`text-sm font-bold ${filterInStock ? 'text-[#0176d3]' : 'text-slate-600'}`}>In Stock Only</span>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${filterInStock ? 'border-[#0176d3] bg-[#0176d3]' : 'border-slate-300'}`}>
              {filterInStock && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
            </div>
          </div>
        </div>

        {/* Manufacturers */}
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-3 px-1">
            <Factory className="w-3 h-3" />
            Manufacturers
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1 sfdc-scrollbar">
            <button
              onClick={() => setFilterManufacturer('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${filterManufacturer === 'all' ? 'bg-[#0176d3] text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              All Manufacturers
            </button>
            {uniqueManufacturers.map(m => (
              <button
                key={m}
                onClick={() => setFilterManufacturer(m)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${filterManufacturer === m ? 'bg-[#0176d3] text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Packages */}
        {uniquePackages.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-3 px-1">
              <Box className="w-3 h-3" />
              Package / Case
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1 sfdc-scrollbar">
              <button
                onClick={() => setFilterPackage('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${filterPackage === 'all' ? 'bg-[#0176d3] text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                All Packages
              </button>
              {uniquePackages.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPackage(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${filterPackage === p ? 'bg-[#0176d3] text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Parametric Filters */}
        {specKeys.map(key => (
          <div key={key} className="pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase mb-3 px-1 tracking-wider">
              <Box className="w-3 h-3" />
              {key}
            </label>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1 sfdc-scrollbar">
              <button
                onClick={() => handleDynamicFilterChange(key, 'all')}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${(!dynamicFilters[key] || dynamicFilters[key] === 'all') ? 'bg-[#0176d3] text-white font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-100/50'}`}
              >
                All {key}
              </button>
              {specValues[key]?.map(val => (
                <button
                  key={val}
                  onClick={() => handleDynamicFilterChange(key, val)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all truncate ${dynamicFilters[key] === val ? 'bg-[#0176d3] text-white font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-100/50'}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Distributors */}
        <div className="pt-4 border-t border-slate-100">
          <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase mb-3 px-1 tracking-wider">
            <Filter className="w-3 h-3" />
            Distributors
          </label>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1 sfdc-scrollbar">
            <button
              onClick={() => setFilterDistributor('all')}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${filterDistributor === 'all' ? 'bg-[#0176d3] text-white font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-100/50'}`}
            >
              All Channels
            </button>
            {uniqueDistributors.map(d => (
              <button
                key={d}
                onClick={() => setFilterDistributor(d)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all truncate ${filterDistributor === d ? 'bg-[#0176d3] text-white font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-100/50'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
