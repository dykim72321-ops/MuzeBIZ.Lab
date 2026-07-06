import React from 'react';
import type { ComponentPart, SortField, SortOrder } from '../../types/muzepart';

export const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (!data || data.length < 2) return <div className="sparkline-container" />;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 30;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <div className="sparkline-container">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline points={points} className="sparkline-path" />
      </svg>
    </div>
  );
};

export const getBrandIcon = (mfr: string) => {
  const name = mfr.toUpperCase();
  const initials = name.substring(0, 2);
  let color = '#64748b';
  
  if (name.includes('TEXAS')) color = '#cc0000';
  if (name.includes('ST')) color = '#003d7c';
  if (name.includes('ANALOG')) color = '#004c45';
  if (name.includes('MICROCHIP')) color = '#ff6600';
  
  return (
    <div className="brand-icon" style={{ borderColor: color, color: color }}>
      {initials}
    </div>
  );
};

export const getDistributorBadgeClass = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('mouser')) return 'text-blue-700 bg-blue-50/80 border-blue-200/60 shadow-[0_2px_8px_rgba(59,130,246,0.15)]';
  if (n.includes('digi-key') || n.includes('digikey')) return 'text-red-700 bg-red-50/80 border-red-200/60 shadow-[0_2px_8px_rgba(239,68,68,0.15)]';
  if (n.includes('arrow')) return 'text-teal-700 bg-teal-50/80 border-teal-200/60 shadow-[0_2px_8px_rgba(20,184,166,0.15)]';
  if (n.includes('future')) return 'text-amber-700 bg-amber-50/80 border-amber-200/60 shadow-[0_2px_8px_rgba(245,158,11,0.15)]';
  if (n.includes('rs components')) return 'text-rose-700 bg-rose-50/80 border-rose-200/60 shadow-[0_2px_8px_rgba(225,29,72,0.15)]';
  if (n.includes('tme')) return 'text-indigo-700 bg-indigo-50/80 border-indigo-200/60 shadow-[0_2px_8px_rgba(99,102,241,0.15)]';
  if (n.includes('eol') || n.includes('rochester') || n.includes('flip')) return 'text-slate-700 bg-slate-100 border-slate-300 shadow-[0_2px_8px_rgba(100,116,139,0.15)]';
  return 'text-slate-600 bg-slate-50 border-slate-200 shadow-sm';
};

export const getStockClass = (stock: number) => {
  if (stock === 0) return 'out-of-stock';
  if (stock < 100) return 'low-stock';
  return 'in-stock';
};

export const getRiskScoreClass = (score: number) => {
  if (score >= 70) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (score >= 30) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
};

export const getRiskLabel = (score: number) => {
  if (score >= 70) return 'High Alert';
  if (score >= 30) return 'Caution';
  return 'Stable';
};

export const getRelevanceBadgeClass = (score: number) => {
  if (score >= 1000) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (score >= 500) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (score >= 200) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-white/5 text-blue-300 border-white/10';
};

export const getRelevanceLabel = (score: number) => {
  if (score >= 1000) return 'Exact Match';
  if (score >= 500) return 'Prefix Match';
  if (score >= 200) return 'Variant';
  return 'Partial';
};

export const getSortClass = (currentField: SortField, targetField: SortField, sortOrder: SortOrder) => {
  if (currentField !== targetField) return 'sortable';
  return sortOrder === 'asc' ? 'sortable sorted-asc' : 'sortable sorted-desc';
};

export const openExternalLink = (url: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getDistributorUrl = (part: ComponentPart) => {
  const ensureProtocol = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `https://${url}`;
  };

  if (part.product_url && part.product_url.trim().length > 0) {
    return ensureProtocol(part.product_url);
  }

  const q = encodeURIComponent(part.mpn);
  const dist = part.distributor.toLowerCase();
  let url = '';
  
  if (dist.includes('mouser')) url = `https://www.mouser.com/c/?q=${q}`;
  else if (dist.includes('digi-key') || dist.includes('digikey')) url = `https://www.digikey.com/en/products/result?keywords=${q}`;
  else if (dist.includes('arrow')) url = `https://www.arrow.com/en/products/search?q=${q}`;
  else if (dist.includes('avnet')) url = `https://www.avnet.com/shop/us/search/${q}`;
  else if (dist.includes('element14') || dist.includes('farnell') || dist.includes('newark')) url = `https://www.newark.com/search?st=${q}`;
  else if (dist.includes('future')) url = `https://www.futureelectronics.com/search/?text=${q}`;
  else if (dist.includes('rs component') || dist.includes('rs-online')) url = `https://uk.rs-online.com/web/c/?searchTerm=${q}`;
  else if (dist.includes('verical')) url = `https://www.verical.com/search?text=${q}`;
  else if (dist.includes('lcsc')) url = `https://www.lcsc.com/search?q=${q}`;
  else if (dist.includes('tme')) url = `https://www.tme.eu/en/katalog/?search=${q}`;
  else if (dist.includes('win source')) url = `https://www.win-source.net/search/${q}.html`;
  else if (dist.includes('rochester')) url = `https://www.rocelec.com/search?q=${q}`;
  else if (dist.includes('flip')) url = `https://www.flipelectronics.com/search?q=${q}`;
  else if (dist.includes('netcomponents')) url = `https://www.netcomponents.com/results.htm?t=f&r=1&s=1&v=1&p=${q}`;
  else url = `https://www.google.com/search?q=${encodeURIComponent(part.distributor)}+${q}`;

  return ensureProtocol(url);
};
