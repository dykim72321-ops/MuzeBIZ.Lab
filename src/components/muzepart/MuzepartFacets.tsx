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
    <div className="bg-white/95 backdrop-blur-xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[20px] overflow-hidden">
      <div className="flex justify-between items-center bg-slate-50/50 border-b border-slate-100 p-5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
            <Filter className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Intelligence Filters</h3>
        </div>
        <button 
          onClick={resetFilters}
          className="text-[11px] font-black text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-wider cursor-pointer"
        >
          Reset All
        </button>
      </div>
      
      <div className="p-5 space-y-7">
        {/* Availability */}
        <div>
          <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />
            Stock Status
          </label>
          <div 
            onClick={() => setFilterInStock(!filterInStock)}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-300 ${filterInStock ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-indigo-200 bg-white'}`}
          >
            <span className={`text-[13px] font-black tracking-wide ${filterInStock ? 'text-indigo-700' : 'text-slate-600'}`}>In Stock Only</span>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${filterInStock ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
              {filterInStock && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-sm" />}
            </div>
          </div>
        </div>

        {/* Manufacturers */}
        <div className="pt-2">
          <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">
            <Factory className="w-3.5 h-3.5 text-indigo-400" />
            Manufacturers
          </label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
            <button
              onClick={() => setFilterManufacturer('all')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer font-bold ${filterManufacturer === 'all' ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] border-none' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600 border border-transparent'}`}
            >
              All Manufacturers
            </button>
            {uniqueManufacturers.map(m => (
              <button
                key={m}
                onClick={() => setFilterManufacturer(m)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] transition-all truncate cursor-pointer font-bold ${filterManufacturer === m ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] border-none' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600 border border-transparent'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Packages */}
        {uniquePackages.length > 0 && (
          <div className="pt-2">
            <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">
              <Box className="w-3.5 h-3.5 text-indigo-400" />
              Package / Case
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
              <button
                onClick={() => setFilterPackage('all')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer font-bold ${filterPackage === 'all' ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] border-none' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600 border border-transparent'}`}
              >
                All Packages
              </button>
              {uniquePackages.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPackage(p)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] transition-all truncate cursor-pointer font-bold ${filterPackage === p ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] border-none' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600 border border-transparent'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Parametric Filters */}
        {specKeys.map(key => (
          <div key={key} className="pt-6 border-t border-slate-100">
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
              <Box className="w-3.5 h-3.5 text-indigo-300" />
              {key}
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
              <button
                onClick={() => handleDynamicFilterChange(key, 'all')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer font-bold ${(!dynamicFilters[key] || dynamicFilters[key] === 'all') ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600'}`}
              >
                All {key}
              </button>
              {specValues[key]?.map(val => (
                <button
                  key={val}
                  onClick={() => handleDynamicFilterChange(key, val)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all truncate cursor-pointer font-bold ${dynamicFilters[key] === val ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600'}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Distributors */}
        <div className="pt-6 border-t border-slate-100">
          <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
            <Filter className="w-3.5 h-3.5 text-indigo-300" />
            Distributors
          </label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
            <button
              onClick={() => setFilterDistributor('all')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer font-bold ${filterDistributor === 'all' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600'}`}
            >
              All Channels
            </button>
            {uniqueDistributors.map(d => (
              <button
                key={d}
                onClick={() => setFilterDistributor(d)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all truncate cursor-pointer font-bold ${filterDistributor === d ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-indigo-600'}`}
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
