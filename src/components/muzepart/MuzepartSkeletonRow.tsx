import React from 'react';

export const MuzepartSkeletonRow: React.FC = () => {
  return (
    <tr className="border-b border-slate-100 last:border-0 relative animate-pulse bg-white">
      {/* Distributor */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-24 bg-slate-200 rounded-md"></div>
          <div className="h-4 w-16 bg-slate-100 rounded-md mt-1"></div>
        </div>
      </td>
      
      {/* MPN / Manufacturer */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-8 bg-slate-200 rounded-lg"></div>
          <div className="flex flex-col gap-1.5">
            <div className="h-5 w-32 bg-slate-200 rounded-md"></div>
            <div className="h-3 w-20 bg-slate-100 rounded-md mt-0.5"></div>
          </div>
        </div>
      </td>
      
      {/* Stock */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
          <div className="h-5 w-16 bg-slate-200 rounded-md"></div>
        </div>
      </td>
      
      {/* Price */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-5 w-24 bg-slate-200 rounded-md"></div>
          <div className="h-4 w-12 bg-slate-100 rounded-md mt-1"></div>
        </div>
      </td>
      
      {/* Delivery */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-5 w-20 bg-slate-200 rounded-md"></div>
          <div className="h-3 w-28 bg-slate-100 rounded-md mt-1"></div>
        </div>
      </td>
      
      {/* Actions */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-lg p-0.5 gap-1">
            <div className="w-7 h-7 bg-slate-200 rounded-md"></div>
            <div className="w-7 h-7 bg-slate-200 rounded-md"></div>
          </div>
          <div className="w-[80px] h-7 bg-slate-200 rounded-lg"></div>
        </div>
      </td>
    </tr>
  );
};
