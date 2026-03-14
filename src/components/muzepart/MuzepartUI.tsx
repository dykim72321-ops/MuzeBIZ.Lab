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
  if (n.includes('mouser')) return 'dist-mouser';
  if (n.includes('digi-key') || n.includes('digikey')) return 'dist-digikey';
  if (n.includes('arrow')) return 'dist-arrow';
  if (n.includes('future')) return 'dist-future';
  if (n.includes('rs components')) return 'dist-rs';
  if (n.includes('tme')) return 'dist-tme';
  if (n.includes('eol') || n.includes('rochester') || n.includes('flip')) return 'dist-eol';
  return 'dist-general';
};

export const getStockClass = (stock: number) => {
  if (stock === 0) return 'out-of-stock';
  if (stock < 100) return 'low-stock';
  return 'in-stock';
};

export const getRiskScoreClass = (score: number) => {
  if (score >= 70) return 'text-red-500 bg-red-50 border-red-200';
  if (score >= 30) return 'text-amber-500 bg-amber-50 border-amber-200';
  return 'text-emerald-500 bg-emerald-50 border-emerald-200';
};

export const getRiskLabel = (score: number) => {
  if (score >= 70) return 'High Alert';
  if (score >= 30) return 'Caution';
  return 'Stable';
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
