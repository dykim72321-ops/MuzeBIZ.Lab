import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, BarChart, Bar
} from 'recharts';
import './MuzepartSearchPage.css';

// Simple health check fallback
const checkBackendHealth = async () => {
  try {
    const res = await fetch('http://localhost:8000/');
    return res.ok;
  } catch {
    return false;
  }
};

interface ComponentPart {
  id: string;
  mpn: string;
  manufacturer: string;
  distributor: string;
  source_type: string;
  stock: number;
  price: number;
  price_history: number[];
  basePrice?: number;
  currency: string;
  delivery: string;
  condition: string;
  date_code: string;
  is_eol: boolean;
  risk_level: string;
  lifecycle?: string;
  is_alternative?: boolean;
  is_qc_enabled?: boolean;
  datasheet?: string;
  description?: string;
  product_url?: string;
}



type JourneyPhase = 'IDLE' | 'SCOUTING' | 'RESULTS';

const QC_PRICE = 72500;

// --- Sub-components for Premium UI ---

const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
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

const getBrandIcon = (mfr: string) => {
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

const SearchPlatform: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<JourneyPhase>('IDLE');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ComponentPart[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<ComponentPart | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- New: View, Sort, Filter, Pagination State ---
  type ViewMode = 'grid' | 'table';
  type SortField = 'price' | 'stock' | 'distributor' | 'none';
  type SortOrder = 'asc' | 'desc';

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterInStock, setFilterInStock] = useState(false);
  const [filterDistributor, setFilterDistributor] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // --- New: Market Intel State ---



  // --- Derived: Market Intel Data ---
  const intelData = useMemo(() => {
    if (results.length === 0) return null;

    // 1. Inventory Distribution (Pie Chart) — REAL DATA
    const distMap: Record<string, number> = {};
    results.forEach(r => {
      if (r.stock > 0) {
        distMap[r.distributor] = (distMap[r.distributor] || 0) + r.stock;
      }
    });
    const inventoryData = Object.entries(distMap).map(([name, value]) => ({ name, value }));

    // 2. Supply Risk Distribution — REAL DATA (based on actual stock levels)
    const riskCounts = { High: 0, Medium: 0, Low: 0 };
    results.forEach(r => {
      const level = r.risk_level as keyof typeof riskCounts;
      if (riskCounts[level] !== undefined) riskCounts[level]++;
    });
    const riskData = Object.entries(riskCounts).map(([name, value]) => ({ name, value }));

    // 3. Real Price Comparison — actual prices from all distributors
    const priceData = results
      .filter(r => r.price > 0)
      .map(r => ({
        name: r.distributor.length > 12 ? r.distributor.substring(0, 12) + '…' : r.distributor,
        price: r.price,
        fullName: r.distributor,
        currency: r.currency
      }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10);

    const prices = results.filter(r => r.price > 0).map(r => r.price);
    const priceStats = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      spread: prices.length > 1
        ? ((Math.max(...prices) - Math.min(...prices)) / (prices.reduce((a, b) => a + b, 0) / prices.length) * 100)
        : 0,
      count: prices.length,
      currency: results.find(r => r.price > 0)?.currency || 'USD'
    } : null;

    return { inventoryData, riskData, priceData, priceStats };
  }, [results]);

  // --- Derived: Filtered & Sorted Results ---
  const processedResults = React.useMemo(() => {
    let filtered = [...results];
    
    // Filter: In Stock Only
    if (filterInStock) {
      filtered = filtered.filter(p => p.stock > 0);
    }
    
    // Filter: By Distributor
    if (filterDistributor !== 'all') {
      filtered = filtered.filter(p => 
        p.distributor.toLowerCase().includes(filterDistributor.toLowerCase())
      );
    }
    
    // Sort
    if (sortField !== 'none') {
      filtered.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'price':
            comparison = a.price - b.price;
            break;
          case 'stock':
            comparison = a.stock - b.stock;
            break;
          case 'distributor':
            comparison = a.distributor.localeCompare(b.distributor);
            break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }
    
    return filtered;
  }, [results, filterInStock, filterDistributor, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(processedResults.length / itemsPerPage);
  const paginatedResults = processedResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get unique distributors for filter dropdown
  const uniqueDistributors = React.useMemo(() => {
    return [...new Set(results.map(r => r.distributor))];
  }, [results]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Reset filters when new search
  const resetFilters = () => {
    setFilterInStock(false);
    setFilterDistributor('all');
    setSortField('none');
    setCurrentPage(1);
  };

  // Check for query parameter on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      handleSearch(undefined, urlQuery);
    }
  }, [searchParams]);

  // --- Logic ---
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/market/stats');
        if (!res.ok) throw new Error('API 연결 실패');
        const data = await res.json();
        setIsBackendConnected(true);
        setConnectionError(null);
        if (data.recent_logs) {
          setLogs(prev => [...prev.slice(-10), ...data.recent_logs]);
        }
      } catch (err: any) {
        setIsBackendConnected(false);
        setConnectionError(err.message);
      }
    };
    
    fetchStats();
    
    const loadHistory = () => {
        const localHist = localStorage.getItem('search_history');
        if (localHist) {
            setHistory(JSON.parse(localHist));
        }
    };
    loadHistory();

    const interval = setInterval(fetchStats, 10000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSearch = async (e?: React.FormEvent, historicalQuery?: string) => {
    if (e) e.preventDefault();
    const targetQuery = historicalQuery || query;
    if (!targetQuery.trim()) return;

    setPhase('SCOUTING');
    setError(null);
    setLogs([]); 
    
    setLogs(["[BOOT] Initializing Intel Engine...", "[OSINT] Checking Global Broker Manifests...", "[SCANNING] Secondary Market Clusters..."]);

    const newHistory = [targetQuery, ...history.filter(h => h !== targetQuery)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('search_history', JSON.stringify(newHistory));

    try {
      const [response] = await Promise.all([
        fetch(`http://localhost:8000/api/parts/search?q=${encodeURIComponent(targetQuery)}`),
        new Promise(resolve => setTimeout(resolve, 2500)) 
      ]);
      
      if (!response.ok) throw new Error('System link failure');
      const data: ComponentPart[] = await response.json();
      
      setResults(data.map((item: any) => ({ 
        ...item, 
        basePrice: item.price, 
        is_qc_enabled: false,
        price_history: item.price_history || [item.price]
      })));
      resetFilters(); 
      if (!history.includes(targetQuery)) setHistory(prev => [targetQuery, ...prev].slice(0, 5));
      setPhase('RESULTS');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown System Error');
      setPhase('IDLE');
    }
  };

  const toggleQC = (id: string, current: boolean) => {
    setResults(prev => prev.map(item => {
      if (item.id === id) {
        const newState = !current;
        return {
          ...item,
          is_qc_enabled: newState,
          price: newState ? (item.basePrice || item.price) + QC_PRICE : (item.basePrice || item.price)
        };
      }
      return item;
    }));
  };

  // --- Smart Link Reconstruction ---
  const openExternalLink = (url: string) => {
    // Solution 2: rel="noreferrer" ಉಜಾ (Bypass referrer checks that cause redirects to homepage)
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDistributorUrl = (part: ComponentPart) => {
    // 0. Prioritize Backend-provided direct link (if it's a valid URL)
    if (part.product_url && part.product_url.startsWith('http')) {
      return part.product_url;
    }

    const q = encodeURIComponent(part.mpn);
    const dist = part.distributor.toLowerCase();
    
    // 1. Prioritize Direct Deep Links for Major Distributors 
    if (dist.includes('mouser')) return `https://www.mouser.com/c/?q=${q}`;
    if (dist.includes('digi-key') || dist.includes('digikey')) return `https://www.digikey.com/en/products/result?keywords=${q}`;
    if (dist.includes('arrow')) return `https://www.arrow.com/en/products/search?q=${q}`;
    if (dist.includes('avnet')) return `https://www.avnet.com/shop/us/search/${q}`;
    if (dist.includes('element14') || dist.includes('farnell') || dist.includes('newark')) return `https://www.newark.com/search?st=${q}`;
    if (dist.includes('future')) return `https://www.futureelectronics.com/search/?text=${q}`;
    if (dist.includes('rs component') || dist.includes('rs-online')) return `https://uk.rs-online.com/web/c/?searchTerm=${q}`;
    if (dist.includes('verical')) return `https://www.verical.com/search?text=${q}`;
    if (dist.includes('lcsc')) return `https://www.lcsc.com/search?q=${q}`;
    if (dist.includes('tme')) return `https://www.tme.eu/en/katalog/?search=${q}`;
    if (dist.includes('win source')) return `https://www.win-source.net/search/${q}.html`;
    if (dist.includes('rochester')) return `https://www.rocelec.com/search?q=${q}`;
    if (dist.includes('flip')) return `https://www.flipelectronics.com/search?q=${q}`;
    if (dist.includes('netcomponents')) return `https://www.netcomponents.com/results.htm?t=f&r=1&s=1&v=1&p=${q}`;

    // 2. Fallback to aggregator tracking link if available (was redundant with step 0, but kept for logic safety)
    if (part.product_url) return part.product_url;
    
    // 3. Final Fallback: Google search
    return `https://www.google.com/search?q=${encodeURIComponent(part.distributor)}+${q}`;
  };

  const handleLock = async (part: ComponentPart) => {
    setSelectedPart(part);
    // Optimistic UI update or separate loading state could be added here
    const btnId = `btn-lock-${part.id}`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.innerText = "Processing...";
        btn.style.opacity = '0.7';
        btn.style.pointerEvents = 'none';
    }

    try {
      const response = await fetch('http://localhost:8000/procurement/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_id: part.id, quantity: 1 })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Simulate processing delay for UX "weight"
        setTimeout(() => {
            setTrackingId(data.tracking_id);
            setShowSuccess(true);
            if (btn) {
                btn.innerText = "LOCKED";
                btn.style.background = 'var(--text-main)';
            }
        }, 800);
      }
    } catch (err) {
      alert("Security protocol violation during lock sequence.");
      if (btn) {
          btn.innerText = "RETRY LOCK";
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
      }
    }
  };


  const handleRetryConnection = async () => {
    setConnectionError(null);
    const isHealthy = await checkBackendHealth();
    setIsBackendConnected(isHealthy);
    if (!isHealthy) {
      setConnectionError('서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.');
    }
  };



  const getDistributorBadgeClass = (name: string) => {
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
  const renderSkeleton = () => (
    <div className="results-grid">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-item skeleton-title" />
          <div className="skeleton-item skeleton-subtitle" />
          <div className="skeleton-item skeleton-table" />
          <div className="skeleton-item skeleton-price" />
        </div>
      ))}
    </div>
  );

  const renderResults = () => {
    // Helper: Get stock class
    const getStockClass = (stock: number) => {
      if (stock === 0) return 'out-of-stock';
      if (stock < 100) return 'low-stock';
      return 'in-stock';
    };

    // Helper: Get sort class for table header
    const getSortClass = (field: SortField) => {
      if (sortField !== field) return 'sortable';
      return sortOrder === 'asc' ? 'sortable sorted-asc' : 'sortable sorted-desc';
    };

    // Render: Controls Bar
    const renderControls = () => (
      <div className="results-controls">
        <div className="results-meta">
          <span className="results-count">
            <strong>{processedResults.length}</strong> results found
            {filterInStock && ' (in stock only)'}
          </span>
          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              ☰ Table
            </button>
            <button 
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              ⊞ Grid
            </button>
          </div>
        </div>
        
        <div className="filter-controls">
          <label className={`filter-checkbox ${filterInStock ? 'active' : ''}`}>
            <input 
              type="checkbox" 
              checked={filterInStock} 
              onChange={(e) => { setFilterInStock(e.target.checked); setCurrentPage(1); }}
            />
            In Stock Only
          </label>
          
          <select 
            className="filter-select" 
            value={filterDistributor}
            onChange={(e) => { setFilterDistributor(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Distributors</option>
            {uniqueDistributors.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select 
            className="filter-select" 
            value={sortField === 'none' ? '' : `${sortField}-${sortOrder}`}
            onChange={(e) => {
              if (!e.target.value) {
                setSortField('none');
              } else {
                const [field, order] = e.target.value.split('-') as [SortField, SortOrder];
                setSortField(field);
                setSortOrder(order);
              }
              setCurrentPage(1);
            }}
          >
            <option value="">Sort By...</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="stock-desc">Stock: High to Low</option>
            <option value="stock-asc">Stock: Low to High</option>
          </select>
        </div>
      </div>
    );

    // Render: Table View
    const renderTableView = () => (
      <div className="results-table-container">
        <table className="results-table">
          <thead>
            <tr>
              <th className={getSortClass('distributor')} onClick={() => handleSort('distributor')}>Distributor</th>
              <th>MPN / Manufacturer</th>
              <th className={getSortClass('stock')} onClick={() => handleSort('stock')}>Stock</th>
              <th className={getSortClass('price')} onClick={() => handleSort('price')}>Unit Price</th>
              <th>Lead Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.map(part => {
              const badgeClass = getDistributorBadgeClass(part.distributor);
              return (
                <tr key={`${part.id}-${part.distributor}`}>
                  <td className="dist-cell">
                    <span className={`distributor-badge ${badgeClass}`} title={part.distributor}>
                      {part.distributor}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {getBrandIcon(part.manufacturer)}
                      <div className="mpn-display">
                        <div className="mpn-cell-text" title="Part Number">
                          {part.mpn}
                          {part.is_alternative && (
                            <span className="family-tag" style={{ marginLeft: '8px' }}>Family Match</span>
                          )}
                        </div>
                        <div className="mfr-cell" title="Manufacturer">{part.manufacturer}</div>
                      </div>
                    </div>
                  </td>
                   <td className="st-td">
                    <div className="lifecycle-display">
                      <span className={`lifecycle-badge ${part.lifecycle?.toLowerCase() || 'active'}`}>
                        {part.lifecycle || 'Active'}
                      </span>
                    </div>
                  </td>
                  <td className={`stock-cell ${getStockClass(part.stock)}`}>
                    {part.stock > 0 ? part.stock.toLocaleString() : 'Check'}
                  </td>
                  <td className="price-cell">
                    {part.price > 0 
                      ? `${part.price.toLocaleString()} ${part.currency}`
                      : 'Quote'}
                  </td>
                  <td>{part.delivery}</td>
                  <td className="actions-cell">
                    {part.datasheet && (
                      <button 
                        className="btn-table-action"
                        onClick={() => part.datasheet && openExternalLink(part.datasheet)}
                        title="View PDF Datasheet"
                      >📄</button>
                    )}
                    
                    {part.source_type === 'Deep Link' || part.stock === 0 ? (
                      <button 
                        className="sfdc-button"
                        onClick={() => openExternalLink(getDistributorUrl(part))}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title="Check price and availability on Distributor site"
                      >🔗 Check Site</button>
                    ) : (
                      <button 
                        className="btn-table-action"
                        onClick={() => openExternalLink(getDistributorUrl(part))}
                        title={`Buy ${part.mpn} at ${part.distributor}`}
                      >🛒</button>
                    )}
                    
                    <button 
                      className="btn-table-action primary"
                      id={`btn-lock-${part.id}`}
                      onClick={() => handleLock(part)}
                    >LOCK</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    // Render: Grid View (Original Cards)
    const renderGridView = () => (
      <div className="results-grid">
        {paginatedResults.map(part => {
          const badgeClass = getDistributorBadgeClass(part.distributor);
          const hasDatasheet = !!part.datasheet;
          const isRealTime = part.source_type !== 'Deep Link';

          return (
            <div key={`${part.id}-${part.distributor}`} className="card">
              <div className="card-header">
                <div>
                  <span className={`distributor-badge ${badgeClass}`}>{part.distributor}</span>
                  <div className="mpn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {getBrandIcon(part.manufacturer)}
                    {part.mpn}
                    {part.is_alternative && <span className="family-tag">Family Match</span>}
                  </div>
                  <div className="manufacturer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{part.manufacturer}</span>
                    <span className={`lifecycle-badge ${part.lifecycle?.toLowerCase() || 'active'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                      {part.lifecycle || 'Active'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginBottom: '0.25rem', fontWeight: 600 }}>📡 JUST NOW</div>
                   {part.stock > 0 ? (
                      <span className="stock-badge">{part.stock.toLocaleString()} UNITS</span>
                   ) : (
                      <span className="stock-badge" style={{ background: '#fef3c7', color: '#d97706', borderColor: '#fde68a' }}>CHECK STOCK</span>
                   )}
                </div>
              </div>

              <table className="data-table">
                <tbody>
                  <tr><td className="label-cell">Source Type</td><td className="value-cell">{part.source_type}</td></tr>
                  <tr><td className="label-cell">Risk Assessment</td><td className={`value-cell badge-risk-${part.risk_level.toLowerCase()}`}>{part.risk_level}</td></tr>
                  <tr><td className="label-cell">Lead Time</td><td className="value-cell">{part.delivery}</td></tr>
                  <tr><td className="label-cell">Description</td><td className="value-cell" style={{ fontSize: '0.8rem', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.description}</td></tr>
                </tbody>
              </table>

              {!isRealTime && (part.risk_level === 'Medium' || part.risk_level === 'High') && (
                <div style={{ border: '1px dashed var(--success)', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>QC Protocol +₩72,500</span>
                  <input type="checkbox" checked={part.is_qc_enabled} onChange={() => toggleQC(part.id, !!part.is_qc_enabled)} />
                </div>
              )}

              <div className="pricing-row" style={{ flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {part.price > 0 ? (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>UNIT PRICE</div>
                      <div className="price-main" style={{ display: 'flex', alignItems: 'center' }}>
                        {part.price.toLocaleString()}<span className="currency">{part.currency}</span>
                        <Sparkline data={part.price_history} />
                      </div>
                    </div>
                  ) : (
                    <div className="price-main" style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                       {part.source_type === 'Deep Link' ? 'Market Price' : 'Quote Only'}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {hasDatasheet && (
                        <button 
                            className="btn-secondary-sm"
                            onClick={() => part.datasheet && openExternalLink(part.datasheet)}
                            title="View Datasheet"
                        >
                            📄 PDF
                        </button>
                    )}
                    
                    <button 
                        className="btn-secondary-sm"
                        onClick={() => openExternalLink(getDistributorUrl(part))}
                        title="Visit Distributor Website to Purchase"
                    >
                        🛒 BUY AT SITE ↗
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {part.source_type === 'Deep Link' ? (
                        <button 
                            className="sfdc-button" 
                            style={{ flex: 1, padding: '0.75rem', justifyContent: 'center' }} 
                            onClick={() => window.open(getDistributorUrl(part), '_blank')}
                        >
                            🔗 Check Site Directly
                        </button>
                    ) : isRealTime ? (
                        <button 
                            className="buy-btn" 
                            id={`btn-lock-${part.id}`}
                            onClick={() => handleLock(part)} 
                            style={{ flex: 1, padding: '0.75rem' }}
                        >
                            RESERVE & PROCURE 🛡️
                        </button>
                    ) : (
                        <button 
                            className="buy-btn" 
                            id={`btn-lock-${part.id}`}
                            style={{ flex: 1, background: 'var(--bg-sidebar)', color: 'white', padding: '0.75rem' }} 
                            onClick={() => handleLock(part)}
                        >
                            INSTANT LOCK
                        </button>
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

    // Render: Pagination
    const renderPagination = () => {
      if (totalPages <= 1) return null;

      const pages: (number | string)[] = [];
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
          pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
          pages.push('...');
        }
      }

      return (
        <div className="pagination">
          <button 
            className="page-btn" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >←</button>
          
          {pages.map((page, idx) => 
            page === '...' ? (
              <span key={idx} className="page-dots">...</span>
            ) : (
              <button 
                key={idx}
                className={`page-btn ${currentPage === page ? 'active' : ''}`}
                onClick={() => setCurrentPage(page as number)}
              >{page}</button>
            )
          )}
          
          <button 
            className="page-btn" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >→</button>
        </div>
      );
    };

    // Empty state
    if (processedResults.length === 0 && results.length > 0) {
      return (
        <div className="container fade-in">
          {renderControls()}
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No results match your filters</h3>
            <p>Try adjusting your filter settings</p>
            <button className="btn-primary" onClick={resetFilters} style={{ marginTop: '1rem' }}>
              Clear Filters
            </button>
          </div>
        </div>
      );
    }

    const isTimeoutFallback = results.length > 0 && results.every(r => r.source_type === 'Deep Link');

    return (
      <div className="container fade-in">
        {isTimeoutFallback && (
          <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span>⏱️</span>
            <span><strong>스캔 지연:</strong> 로딩 시간이 초과되어 빠른 확인을 위한 직접 링크만 제공합니다.</span>
          </div>
        )}
        {renderControls()}
        {viewMode === 'table' ? renderTableView() : renderGridView()}
        {renderPagination()}
      </div>
    );
  };

  const renderSuccessModal = () => (
    <div className="modal-overlay" onClick={() => setShowSuccess(false)}>
      <div className="modal">
        <div className="status-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>INVENTORY SECURED</h2>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TRACKING INTEL ID</div>
          <div style={{ fontStyle: 'mono', color: 'var(--accent)', fontWeight: 'bold' }}>{trackingId}</div>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
          Procurement lock initiated for MPN: <strong>{selectedPart?.mpn}</strong>.<br/>
          Shipment authorization is pending financial clearance.
        </p>
        <button className="buy-btn" onClick={() => { setShowSuccess(false); setPhase('IDLE'); }}>
          RETURN TO COMMAND CENTER
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Connection Error Banner */}
      {!isBackendConnected && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <span>⚠️</span>
          <span className="text-rose-700 font-medium flex-1">{connectionError || '백엔드 서버에 연결할 수 없습니다'}</span>
          <button onClick={handleRetryConnection} className="sfdc-button-secondary text-xs">🔄 재시도</button>
        </div>
      )}

      {/* Page Header — CRM Hub Style */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Global Sourcing</p>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">제품 검색</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Inline Search */}
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

      {/* Market Intel Visualization Row - Premium Redesign */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Global Inventory Card */}
        <div className="lg:col-span-4 sfdc-card p-6 bg-white/80 backdrop-blur-md border-white/40 shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl text-white shadow-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Global Inventory</h3>
                <p className="text-[10px] text-slate-400 font-bold">Distribution by Region/Dealer</p>
              </div>
            </div>
          </div>
          <div className="h-[200px] flex items-center justify-center">
            {!intelData ? (
              <p className="text-xs text-slate-400 font-medium">검색 후 업데이트됩니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <PieChart>
                    <Pie
                      data={intelData.inventoryData}
                      cx="35%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {intelData.inventoryData.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={['#0176d3', '#4bc076', '#f2cf5b', '#ef6e64', '#9050e9', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316'][index % 9]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend 
                      layout="vertical" 
                      verticalAlign="middle" 
                      align="right" 
                      wrapperStyle={{ 
                        fontSize: '9px', 
                        lineHeight: '12px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        width: '55%'
                      }} 
                    />
                  </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* EOL Risk Map Card */}
        <div className="lg:col-span-4 sfdc-card p-6 bg-white/80 backdrop-blur-md border-white/40 shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl text-white shadow-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Supply Risk Index</h3>
                  <p className="text-[10px] text-slate-400 font-bold">Live Procurement Stability Map</p>
                </div>
              </div>
            </div>
          </div>
          <div className="h-[200px] flex flex-col justify-center gap-4 px-2">
            {!intelData ? (
              <p className="text-xs text-center text-slate-400 font-medium">검색 후 업데이트됩니다.</p>
            ) : (
              <>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-rose-500">재고 부족 (High Risk)</span>
                    <span className="text-slate-500">{intelData.riskData.find(d => d.name === 'High')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${((intelData.riskData.find(d => d.name === 'High')?.value || 0) / Math.max(1, results.length)) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">재고 0개 (품절 또는 EOL 의심)</p>
                </div>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-amber-500">재고 한정 (Medium Risk)</span>
                    <span className="text-slate-500">{intelData.riskData.find(d => d.name === 'Medium')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${((intelData.riskData.find(d => d.name === 'Medium')?.value || 0) / Math.max(1, results.length)) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">재고 1~100개 (수급 주의)</p>
                </div>
                <div className="relative">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-500">재고 안정 (Low Risk)</span>
                    <span className="text-slate-500">{intelData.riskData.find(d => d.name === 'Low')?.value || 0} 개 판매처</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((intelData.riskData.find(d => d.name === 'Low')?.value || 0) / Math.max(1, results.length)) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">재고 100개 초과 (수급 원활)</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Price Comparison Card */}
        <div className="lg:col-span-4 sfdc-card p-6 bg-white/80 backdrop-blur-md border-white/40 shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-rose-600 to-pink-500 rounded-xl text-white shadow-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Market Price Drift</h3>
                  <p className="text-[10px] text-slate-400 font-bold">Cross-Distributor Price Benchmark</p>
                </div>
              </div>
            </div>
          </div>
          <div className="h-[200px]">
            {!intelData ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 font-medium">검색 후 업데이트됩니다.</p>
              </div>
            ) : !intelData.priceData || intelData.priceData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 font-medium">가격 정보가 없습니다.</p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <BarChart data={intelData.priceData} margin={{ top: 15, right: 5, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis 
                        tick={{ fontSize: 9, fill: '#64748b' }} 
                        width={40} 
                        tickFormatter={(val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toString()}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any, _name: any, props: any) => [
                          `${Number(value).toLocaleString()} ${props.payload?.currency || 'USD'}`, '단가 (Unit Price)'
                        ]}
                        labelFormatter={(label: any) => {
                          const item = intelData.priceData.find((d: any) => d.name === label);
                          return item?.fullName || String(label);
                        }}
                      />
                      <Bar dataKey="price" fill="#0176d3" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {intelData.priceStats && (
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 px-1 pt-1 border-t border-slate-100">
                    <span>Min: <span className="text-emerald-600">{intelData.priceStats.min.toLocaleString()}</span></span>
                    <span>Avg: <span className="text-slate-700">{intelData.priceStats.avg.toFixed(2)}</span></span>
                    <span>Max: <span className="text-rose-500">{intelData.priceStats.max.toLocaleString()}</span></span>
                    {intelData.priceStats.spread > 0 && (
                      <span className="text-amber-600">Spread: {intelData.priceStats.spread.toFixed(1)}%</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Search History & Intel */}
        <div className="space-y-6">
          <div className="sfdc-card">
            <div className="sfdc-card-header">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">검색 기록</h3>
            </div>
            <div className="p-4 space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium">최근 검색 기록이 없습니다.</p>
              ) : (
                history.map((h, idx) => (
                  <button
                    key={`${h}-${idx}`}
                    onClick={() => handleSearch(undefined, h)}
                    className="w-full text-left px-3 py-2 rounded-md text-sm font-bold text-[#0176d3] hover:bg-blue-50 transition-colors truncate"
                  >
                    🛰️ {h.toUpperCase()}
                  </button>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Main Results Panel */}
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
                <h2 className="glow-text">Scouting Global Supply Chain...</h2>
                
                <div ref={logContainerRef} className="terminal-feed">
                    {logs.map((log, i) => (
                        <div key={i} className="feed-item-line">
                            <span className="timestamp">{new Date().toLocaleTimeString()}</span>
                            <span className="event">{log}</span>
                        </div>
                    ))}
                </div>
              </div>
              {renderSkeleton()}
            </div>
          )}

          {phase === 'RESULTS' && renderResults()}

          {phase === 'IDLE' && (
            <div className="sfdc-card">
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#0176d3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <h2 className="text-xl font-black text-slate-900">검색 대기 중</h2>
                <p className="text-sm text-slate-500 font-medium">상단 검색창에 부품번호(MPN)를 입력하여 글로벌 소싱을 시작하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSuccess && renderSuccessModal()}
    </div>
  );
};

export { SearchPlatform as MuzepartSearchPage };

