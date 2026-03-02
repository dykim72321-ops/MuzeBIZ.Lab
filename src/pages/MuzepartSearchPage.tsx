import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, AreaChart, Area
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

    // 1. Inventory Distribution (Pie Chart)
    const distMap: Record<string, number> = {};
    results.forEach(r => {
      if (r.stock > 0) {
        distMap[r.distributor] = (distMap[r.distributor] || 0) + r.stock;
      }
    });
    const inventoryData = Object.entries(distMap).map(([name, value]) => ({ name, value }));

    // 2. Risk Distribution
    const riskCounts = { High: 0, Medium: 0, Low: 0 };
    results.forEach(r => {
      const level = r.risk_level as keyof typeof riskCounts;
      if (riskCounts[level] !== undefined) riskCounts[level]++;
    });
    const riskData = Object.entries(riskCounts).map(([name, value]) => ({ name, value }));

    // 3. Price Volatility (Aggregate history if multiple, or just take first for demo)
    // For now, let's take the first result's history as a representative or average them
    let combinedHistory: { time: string, price: number }[] = [];
    if (results[0]?.price_history) {
        combinedHistory = results[0].price_history.map((p, i) => ({
            time: `T-${results[0].price_history.length - 1 - i}`,
            price: p
        }));
    }

    return { inventoryData, riskData, combinedHistory };
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
        price_history: item.price_history || [item.price * 0.98, item.price * 1.02, item.price] 
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
  const getDistributorUrl = (part: ComponentPart) => {
    if (part.product_url) return part.product_url;
    
    // Fallback logic based on distributor name
    const q = part.mpn;
    const dist = part.distributor.toLowerCase();
    
    if (dist.includes('mouser')) return `https://www.mouser.kr/Search/Refine?Keyword=${q}`;
    if (dist.includes('digi-key')) return `https://www.digikey.kr/en/products/result?keywords=${q}`;
    if (dist.includes('win source')) return `https://www.win-source.net/search?q=${q}`;
    if (dist.includes('rochester')) return `https://www.rocelec.com/search?q=${q}`;
    if (dist.includes('flip')) return `https://www.flipelectronics.com/search?q=${q}`;
    
    return `https://www.google.com/search?q=${part.distributor}+${q}`;
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
                      <div>
                        <div className="mpn-cell-text" title="Part Number">{part.mpn}</div>
                        <div className="mfr-cell" title="Manufacturer">{part.manufacturer}</div>
                      </div>
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
                        onClick={() => window.open(part.datasheet, '_blank')}
                        title="View PDF Datasheet"
                      >📄</button>
                    )}
                    
                    {part.source_type === 'Deep Link' || part.stock === 0 ? (
                      <button 
                        className="sfdc-button"
                        onClick={() => window.open(getDistributorUrl(part), '_blank')}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title="Check price and availability on Distributor site"
                      >🔗 Check Site</button>
                    ) : (
                      <button 
                        className="btn-table-action"
                        onClick={() => window.open(getDistributorUrl(part), '_blank')}
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
                  <div className="mpn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getBrandIcon(part.manufacturer)}
                    {part.mpn}
                  </div>
                  <div className="manufacturer">{part.manufacturer}</div>
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
                            onClick={() => window.open(part.datasheet, '_blank')}
                            title="View Datasheet"
                        >
                            📄 PDF
                        </button>
                    )}
                    
                    <button 
                        className="btn-secondary-sm"
                        onClick={() => window.open(getDistributorUrl(part), '_blank')}
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

      {/* Market Intel Visualization Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Global Inventory Card */}
        <div className="sfdc-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg text-white shadow-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Global Inventory</h3>
            </div>
          </div>
          <div className="h-[200px] flex items-center justify-center">
            {!intelData ? (
              <p className="text-xs text-slate-400 font-medium">검색 후 업데이트됩니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={intelData.inventoryData}
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {intelData.inventoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#0176d3', '#4bc076', '#f2cf5b', '#ef6e64', '#9050e9'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* EOL Risk Map Card */}
        <div className="sfdc-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg text-white shadow-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">EOL Risk Map</h3>
            </div>
          </div>
          <div className="h-[200px] flex flex-col justify-center gap-4 px-2">
            {!intelData ? (
              <p className="text-xs text-slate-400 font-medium text-center">검색 후 업데이트됩니다.</p>
            ) : (
              intelData.riskData.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-black text-slate-600 uppercase tracking-tight">
                    <span>{item.name} Risk</span>
                    <span>{item.value} Parts</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        item.name === 'High' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 
                        item.name === 'Medium' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 
                        'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      }`}
                      style={{ width: `${(item.value / results.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Price Volatility Card */}
        <div className="sfdc-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500 rounded-lg text-white shadow-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Price Volatility</h3>
            </div>
          </div>
          <div className="h-[200px]">
            {!intelData ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 font-medium">검색 후 업데이트됩니다.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={intelData.combinedHistory}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef6e64" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef6e64" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="price" stroke="#ef6e64" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
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

