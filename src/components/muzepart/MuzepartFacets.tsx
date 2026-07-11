import React from 'react';
import { Filter, Factory, Box, AlertCircle } from 'lucide-react';

const primaryPillClass = (active: boolean, truncate = false) =>
  `w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer font-bold ${truncate ? 'truncate ' : ''}${active ? 'bg-black text-white shadow-md border-none' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 border border-transparent'}`;

const secondaryPillClass = (active: boolean, truncate = false) =>
  `w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer font-bold ${truncate ? 'truncate ' : ''}${active ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900'}`;

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
  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[20px] overflow-hidden">
      <div className="flex justify-between items-center bg-slate-50/50 border-b border-slate-100 p-5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
            <Filter className="w-4 h-4 text-slate-800" />
          </div>
          <h2 className="font-black text-slate-900 tracking-tight text-[15px]">검색 필터</h2>
        </div>
        <button 
          onClick={resetFilters}
          className="text-[11px] font-black text-slate-400 hover:text-slate-800 transition-colors uppercase tracking-wider cursor-pointer"
        >
          Reset All
        </button>
      </div>
      
      <div className="p-5 space-y-7">
        {/* Availability */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-slate-600" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Availability</h3>
          </div>
          <div 
            onClick={() => setFilterInStock(!filterInStock)}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-300 ${filterInStock ? 'border-black bg-slate-50' : 'border-slate-100 hover:border-slate-300 bg-white'}`}
          >
            <span className={`text-[13px] font-black tracking-wide ${filterInStock ? 'text-black' : 'text-slate-600'}`}>In Stock Only</span>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${filterInStock ? 'border-black bg-black' : 'border-slate-300'}`}>
              {filterInStock && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-sm" />}
            </div>
          </div>
        </div>

        {/* Manufacturers */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="w-3.5 h-3.5 text-slate-600" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Manufacturer</h3>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setFilterManufacturer('all')}
              className={primaryPillClass(filterManufacturer === 'all')}
            >
              All Manufacturers
            </button>
            {uniqueManufacturers.slice(0, 5).map(m => (
              <button
                key={m}
                onClick={() => setFilterManufacturer(m)}
                className={primaryPillClass(filterManufacturer === m, true)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Packages */}
        {uniquePackages.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-3">
              <Box className="w-3.5 h-3.5 text-slate-600" />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Package Case</h3>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
              <button
                onClick={() => setFilterPackage('all')}
                className={primaryPillClass(filterPackage === 'all')}
              >
                All Packages
              </button>
              {uniquePackages.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPackage(p)}
                  className={primaryPillClass(filterPackage === p, true)}
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
            <div className="flex items-center gap-2 mb-2.5">
              <Box className="w-3.5 h-3.5 text-slate-500" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{key}</h3>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
              <button
                onClick={() => setDynamicFilters({ ...dynamicFilters, [key]: 'all' })}
                className={secondaryPillClass(!dynamicFilters[key] || dynamicFilters[key] === 'all')}
              >
                All
              </button>
              {specValues[key]?.map(val => (
                <button
                  key={val}
                  onClick={() => setDynamicFilters({ ...dynamicFilters, [key]: val })}
                  className={secondaryPillClass(dynamicFilters[key] === val, true)}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Distributors */}
        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Distributor</h3>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
            <button
              onClick={() => setFilterDistributor('all')}
              className={secondaryPillClass(filterDistributor === 'all')}
            >
              All Distributors
            </button>
            {uniqueDistributors.map(d => (
              <button
                key={d}
                onClick={() => setFilterDistributor(d)}
                className={secondaryPillClass(filterDistributor === d, true)}
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
