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
      <div className="sfdc-card-header flex justify-between items-center bg-[#0d1527]/40 border-b border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyan-400" />
          <h3 className="text-base font-extrabold text-white uppercase tracking-tight">Intelligence Filters</h3>
        </div>
        <button 
          onClick={resetFilters}
          className="text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
        >
          Reset
        </button>
      </div>
      
      <div className="p-4 space-y-6">
        {/* Availability */}
        <div>
          <label className="flex items-center gap-2 text-sm font-extrabold text-slate-350 uppercase mb-3 px-1">
            <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
            Stock Status
          </label>
          <div 
            onClick={() => setFilterInStock(!filterInStock)}
            className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${filterInStock ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-700 bg-[#0a0f1c]/40'}`}
          >
            <span className={`text-sm font-bold ${filterInStock ? 'text-cyan-400' : 'text-slate-300'}`}>In Stock Only</span>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${filterInStock ? 'border-cyan-500 bg-cyan-500' : 'border-slate-600'}`}>
              {filterInStock && <div className="w-1.5 h-1.5 bg-[#0d1527] rounded-full" />}
            </div>
          </div>
        </div>

        {/* Manufacturers */}
        <div>
          <label className="flex items-center gap-2 text-sm font-extrabold text-slate-350 uppercase mb-3 px-1">
            <Factory className="w-3.5 h-3.5 text-cyan-400" />
            Manufacturers
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1 sfdc-scrollbar">
            <button
              onClick={() => setFilterManufacturer('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filterManufacturer === 'all' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-white/5'}`}
            >
              All Manufacturers
            </button>
            {uniqueManufacturers.map(m => (
              <button
                key={m}
                onClick={() => setFilterManufacturer(m)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate cursor-pointer ${filterManufacturer === m ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-white/5'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Packages */}
        {uniquePackages.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-extrabold text-slate-350 uppercase mb-3 px-1">
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              Package / Case
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1 sfdc-scrollbar">
              <button
                onClick={() => setFilterPackage('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filterPackage === 'all' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-white/5'}`}
              >
                All Packages
              </button>
              {uniquePackages.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPackage(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate cursor-pointer ${filterPackage === p ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Parametric Filters */}
        {specKeys.map(key => (
          <div key={key} className="pt-4 border-t border-slate-800">
            <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase mb-3 px-1 tracking-wider">
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              {key}
            </label>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1 sfdc-scrollbar">
              <button
                onClick={() => handleDynamicFilterChange(key, 'all')}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${(!dynamicFilters[key] || dynamicFilters[key] === 'all') ? 'bg-cyan-500 text-slate-950 font-black shadow-sm' : 'text-slate-300 hover:bg-white/5'}`}
              >
                All {key}
              </button>
              {specValues[key]?.map(val => (
                <button
                  key={val}
                  onClick={() => handleDynamicFilterChange(key, val)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all truncate cursor-pointer ${dynamicFilters[key] === val ? 'bg-cyan-500 text-slate-950 font-black shadow-sm' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Distributors */}
        <div className="pt-4 border-t border-slate-800">
          <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase mb-3 px-1 tracking-wider">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            Distributors
          </label>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1 sfdc-scrollbar">
            <button
              onClick={() => setFilterDistributor('all')}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${filterDistributor === 'all' ? 'bg-cyan-500 text-slate-950 font-black shadow-sm' : 'text-slate-300 hover:bg-white/5'}`}
            >
              All Channels
            </button>
            {uniqueDistributors.map(d => (
              <button
                key={d}
                onClick={() => setFilterDistributor(d)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all truncate cursor-pointer ${filterDistributor === d ? 'bg-cyan-500 text-slate-950 font-black shadow-sm' : 'text-slate-300 hover:bg-white/5'}`}
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
