import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ComponentPart, JourneyPhase, SortField, SortOrder, IntelData } from '../types/muzepart';

const QC_PRICE = 72500;

export const useMuzepartSearch = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<JourneyPhase>('IDLE');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ComponentPart[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleRetryConnection = useCallback(async () => {
    setConnectionError(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/market/stats');
      if (res.ok) setIsBackendConnected(true);
    } catch {
      setIsBackendConnected(false);
      setConnectionError('서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.');
    }
  }, []);

  const [sortField, setSortField] = useState<SortField>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterInStock, setFilterInStock] = useState(false);
  const [filterDistributor, setFilterDistributor] = useState<string>('all');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
  const [filterPackage, setFilterPackage] = useState<string>('all');
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset filters when new search
  const resetFilters = useCallback(() => {
    setFilterInStock(false);
    setFilterDistributor('all');
    setFilterManufacturer('all');
    setFilterPackage('all');
    setDynamicFilters({});
    setSortField('none');
    setCurrentPage(1);
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent, historicalQuery?: string) => {
    if (e) e.preventDefault();
    const targetQuery = historicalQuery || query;
    if (!targetQuery.trim()) return;

    setPhase('SCOUTING');
    setError(null);
    setLogs(["[BOOT] Initializing Intel Engine...", "[OSINT] Checking Global Broker Manifests...", "[SCANNING] Secondary Market Clusters..."]);

    const newHistory = [targetQuery, ...history.filter(h => h !== targetQuery)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('search_history', JSON.stringify(newHistory));
    
    // Update URL params
    setSearchParams({ q: targetQuery });

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/parts/search?q=${encodeURIComponent(targetQuery)}`);
      
      if (!response.ok) throw new Error('System link failure');
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setResults(data.map((item: any) => ({ 
          ...item, 
          basePrice: item.price, 
          is_qc_enabled: false,
          price_history: item.price_history || [item.price],
          is_locked: false,
          is_processing: false
        })));
      } else {
        console.error("Malformed search data:", data);
        setError(data.error || 'Unexpected data format from server');
        setResults([]);
      }
      resetFilters(); 
      setPhase('RESULTS');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown System Error');
      setPhase('IDLE');
    }
  }, [query, history, setSearchParams, resetFilters]);

  const toggleQC = useCallback((id: string, current: boolean) => {
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
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  }, [sortField]);

  // Derived: Market Intel Data
  const intelData = useMemo<IntelData | null>(() => {
    if (results.length === 0) return null;

    const distMap: Record<string, number> = {};
    results.forEach(r => {
      if (r.stock > 0) {
        distMap[r.distributor] = (distMap[r.distributor] || 0) + r.stock;
      }
    });
    const inventoryData = Object.entries(distMap).map(([name, value]) => ({ name, value }));

    const riskCounts = { High: 0, Medium: 0, Low: 0 };
    results.forEach(r => {
      const level = r.risk_level as keyof typeof riskCounts;
      if (riskCounts[level] !== undefined) riskCounts[level]++;
    });
    const riskData = Object.entries(riskCounts).map(([name, value]) => ({ name, value }));

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

  // Derived: Filtered & Sorted Results
  const processedResults = useMemo(() => {
    let filtered = [...results];
    
    if (filterInStock) {
      filtered = filtered.filter(p => p.stock > 0);
    }
    
    if (filterDistributor !== 'all') {
      filtered = filtered.filter(p => 
        p.distributor.toLowerCase().includes(filterDistributor.toLowerCase())
      );
    }

    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p => 
        p.manufacturer.toLowerCase().includes(filterManufacturer.toLowerCase())
      );
    }

    if (filterPackage !== 'all') {
      filtered = filtered.filter(p => 
        (p as any).package && (p as any).package.toLowerCase().includes(filterPackage.toLowerCase())
      );
    }

    if (Object.keys(dynamicFilters).length > 0) {
      filtered = filtered.filter(p => {
        return Object.entries(dynamicFilters).every(([key, value]) => {
          if (value === 'all') return true;
          return p.specs?.[key] === value;
        });
      });
    }
    
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
  }, [results, filterInStock, filterDistributor, filterManufacturer, filterPackage, dynamicFilters, sortField, sortOrder]);

  const totalPages = Math.ceil(processedResults.length / itemsPerPage);
  const paginatedResults = processedResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const uniqueDistributors = useMemo(() => {
    return [...new Set(results.map(r => r.distributor))];
  }, [results]);

  const specKeys = useMemo(() => {
    const keysCount: Record<string, number> = {};
    results.forEach(r => {
      if (r.specs) {
        Object.keys(r.specs).forEach(key => {
          keysCount[key] = (keysCount[key] || 0) + 1;
        });
      }
    });
    // Keys appearing in >= 20% of results
    return Object.entries(keysCount)
      .filter(([_, count]) => count >= results.length * 0.2)
      .map(([key]) => key);
  }, [results]);

  const specValues = useMemo(() => {
    const values: Record<string, string[]> = {};
    specKeys.forEach(key => {
      values[key] = Array.from(new Set(results.map(r => r.specs?.[key]).filter(v => !!v))) as string[];
    });
    return values;
  }, [results, specKeys]);

  // Backend connection check
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/market/stats');
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
    
    const localHist = localStorage.getItem('search_history');
    if (localHist) {
        setHistory(JSON.parse(localHist));
    }

    const interval = setInterval(fetchStats, 10000); 
    return () => clearInterval(interval);
  }, []);

  // Handle URL query on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery && urlQuery !== query) {
      setQuery(urlQuery);
      handleSearch(undefined, urlQuery);
    }
  }, []);

  const [selectedPart, setSelectedPart] = useState<ComponentPart | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const handleLock = useCallback(async (part: ComponentPart) => {
    setSelectedPart(part);
    // Set processing state
    setResults(prev => prev.map(p => p.id === part.id ? { ...p, is_processing: true } : p));

    try {
      const response = await fetch('http://127.0.0.1:8000/procurement/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_id: part.id, quantity: 1 })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Short delay for visual confirmation
        setTimeout(() => {
            setTrackingId(data.tracking_id);
            setShowSuccess(true);
            setResults(prev => prev.map(p => p.id === part.id ? { ...p, is_processing: false, is_locked: true } : p));
        }, 500);
      } else {
        throw new Error('Lock failed');
      }
    } catch (err) {
      setResults(prev => prev.map(p => p.id === part.id ? { ...p, is_processing: false } : p));
      alert("Security protocol violation during lock sequence.");
    }
  }, []);

  return {
    phase,
    query,
    setQuery,
    results,
    processedResults,
    paginatedResults,
    history,
    logs,
    error,
    isBackendConnected,
    connectionError,
    sortField,
    sortOrder,
    filterInStock,
    setFilterInStock,
    filterDistributor,
    setFilterDistributor,
    filterManufacturer,
    setFilterManufacturer,
    filterPackage,
    setFilterPackage,
    currentPage,
    setCurrentPage,
    totalPages,
    itemsPerPage,
    uniqueDistributors,
    uniqueManufacturers: [...new Set(results.map(r => r.manufacturer))],
    uniquePackages: [...new Set(results.map(r => (r as any).package || 'N/A'))].filter(p => p !== 'N/A'),
    specKeys,
    specValues,
    dynamicFilters,
    setDynamicFilters,
    intelData,
    selectedPart,
    setSelectedPart,
    showSuccess,
    setShowSuccess,
    trackingId,
    handleSearch,
    toggleQC,
    handleSort,
    resetFilters,
    handleLock,
    handleRetryConnection,
    setIsBackendConnected,
    setConnectionError
  };
};
