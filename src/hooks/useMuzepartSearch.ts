import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import type { ComponentPart, JourneyPhase, SortField, SortOrder, IntelData } from '../types/muzepart';

const QC_PRICE = 72500;

interface MuzepartState {
  phase: JourneyPhase;
  query: string;
  activeSearchQuery: string;
  results: ComponentPart[];
  history: string[];
  logs: string[];
  error: string | null;
  isBackendConnected: boolean;
  connectionError: string | null;
  sortField: SortField;
  sortOrder: SortOrder;
  filterInStock: boolean;
  filterDistributor: string;
  filterManufacturer: string;
  filterPackage: string;
  dynamicFilters: Record<string, string>;
  currentPage: number;
  
  setPhase: (phase: JourneyPhase) => void;
  setQuery: (query: string) => void;
  setActiveSearchQuery: (query: string) => void;
  setResults: (results: ComponentPart[] | ((prev: ComponentPart[]) => ComponentPart[])) => void;
  setHistory: (history: string[]) => void;
  setLogs: (logs: string[] | ((prev: string[]) => string[])) => void;
  setError: (error: string | null) => void;
  setIsBackendConnected: (status: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setSortField: (field: SortField) => void;
  setSortOrder: (order: SortOrder | ((prev: SortOrder) => SortOrder)) => void;
  setFilterInStock: (filter: boolean) => void;
  setFilterDistributor: (filter: string) => void;
  setFilterManufacturer: (filter: string) => void;
  setFilterPackage: (filter: string) => void;
  setDynamicFilters: (filters: Record<string, string>) => void;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
}

export const useMuzepartStore = create<MuzepartState>((set) => ({
  phase: 'IDLE',
  query: '',
  activeSearchQuery: '',
  results: [],
  history: [],
  logs: [],
  error: null,
  isBackendConnected: true,
  connectionError: null,
  sortField: 'none',
  sortOrder: 'asc',
  filterInStock: false,
  filterDistributor: 'all',
  filterManufacturer: 'all',
  filterPackage: 'all',
  dynamicFilters: {},
  currentPage: 1,

  setPhase: (phase) => set({ phase }),
  setQuery: (query) => set({ query }),
  setActiveSearchQuery: (activeSearchQuery) => set({ activeSearchQuery }),
  setResults: (results) => set((state) => ({ results: typeof results === 'function' ? results(state.results) : results })),
  setHistory: (history) => set({ history }),
  setLogs: (logs) => set((state) => ({ logs: typeof logs === 'function' ? logs(state.logs) : logs })),
  setError: (error) => set({ error }),
  setIsBackendConnected: (isBackendConnected) => set({ isBackendConnected }),
  setConnectionError: (connectionError) => set({ connectionError }),
  setSortField: (sortField) => set({ sortField }),
  setSortOrder: (sortOrder) => set((state) => ({ sortOrder: typeof sortOrder === 'function' ? sortOrder(state.sortOrder) : sortOrder })),
  setFilterInStock: (filterInStock) => set({ filterInStock }),
  setFilterDistributor: (filterDistributor) => set({ filterDistributor }),
  setFilterManufacturer: (filterManufacturer) => set({ filterManufacturer }),
  setFilterPackage: (filterPackage) => set({ filterPackage }),
  setDynamicFilters: (dynamicFilters) => set({ dynamicFilters }),
  setCurrentPage: (currentPage) => set((state) => ({ currentPage: typeof currentPage === 'function' ? currentPage(state.currentPage) : currentPage })),
}));

export const useMuzepartSearch = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    phase, setPhase,
    query, setQuery,
    activeSearchQuery, setActiveSearchQuery,
    results, setResults,
    history, setHistory,
    logs, setLogs,
    error, setError,
    isBackendConnected, setIsBackendConnected,
    connectionError, setConnectionError,
    sortField, setSortField,
    sortOrder, setSortOrder,
    filterInStock, setFilterInStock,
    filterDistributor, setFilterDistributor,
    filterManufacturer, setFilterManufacturer,
    filterPackage, setFilterPackage,
    dynamicFilters, setDynamicFilters,
    currentPage, setCurrentPage
  } = useMuzepartStore();
  const itemsPerPage = 10;

  const handleRetryConnection = useCallback(async () => {
    setConnectionError(null);
    try {
      const res = await fetch('/py-api/api/market/stats');
      if (res.ok) setIsBackendConnected(true);
    } catch {
      setIsBackendConnected(false);
      setConnectionError('서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.');
    }
  }, [setConnectionError, setIsBackendConnected]);

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
    
    // Update URL params and trigger query
    setSearchParams({ q: targetQuery });
    resetFilters();
    setActiveSearchQuery(targetQuery);
  }, [query, history, setSearchParams, setActiveSearchQuery, setPhase, setError, setLogs, setHistory, resetFilters]);

  const { data: queryData, isFetching: isSearchFetching, isError, error: queryError } = useQuery({
    queryKey: ['partsSearch', activeSearchQuery],
    queryFn: async () => {
      if (!activeSearchQuery.trim()) return [];
      const response = await fetch(`/py-api/api/parts/search?q=${encodeURIComponent(activeSearchQuery)}`);
      if (!response.ok) throw new Error('System link failure');
      const data = await response.json();
      
      if (Array.isArray(data)) {
        return data.map((item: ComponentPart) => {
          const baseP = item.price;
          return {
            ...item,
            basePrice: baseP,
            is_qc_enabled: false,
            price_history: item.price_history || [baseP],
            is_locked: false,
            is_processing: false,
            relevance_score: item.relevance_score || 0,
          };
        });
      } else {
        console.error("Malformed search data:", data);
        throw new Error(data.error || 'Unexpected data format from server');
      }
    },
    enabled: !!activeSearchQuery,
    staleTime: 5 * 60 * 1000,
  });

  // Sync React Query data to Zustand for local mutation (toggleQC, handleLock)
  useEffect(() => {
    if (queryData && !isSearchFetching) {
      setResults(queryData);
      setPhase('RESULTS');
    }
  }, [queryData, isSearchFetching, setResults, setPhase]);

  // Handle Query Errors
  useEffect(() => {
    if (isError) {
      setError(queryError instanceof Error ? queryError.message : 'Unknown System Error');
      setResults([]);
      setPhase('IDLE');
    }
  }, [isError, queryError, setError, setResults, setPhase]);

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
        p.specs?.package && p.specs.package.toLowerCase().includes(filterPackage.toLowerCase())
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
      .filter(([, count]) => count >= results.length * 0.2)
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
        const res = await fetch('/py-api/api/market/stats');
        if (!res.ok) throw new Error('API 연결 실패');
        const data = await res.json();
        setIsBackendConnected(true);
        setConnectionError(null);
        if (data.recent_logs) {
          setLogs(prev => [...prev.slice(-10), ...data.recent_logs]);
        }
      } catch (err) {
        setIsBackendConnected(false);
        setConnectionError(err instanceof Error ? err.message : String(err));
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
      const response = await fetch('/py-api/procurement/lock', {
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
    } catch {
      setResults(prev => prev.map(p => p.id === part.id ? { ...p, is_processing: false } : p));
      alert("Security protocol violation during lock sequence.");
    }
  }, []);

  const fetchPartDetails = useCallback(async (productUrl: string) => {
    if (!productUrl) return null;
    try {
      const response = await fetch(`/py-api/api/parts/details?url=${encodeURIComponent(productUrl)}`);
      if (!response.ok) throw new Error('Detail fetch failed');
      const details = await response.json();
      
      // Update results with fetched specs
      setResults(prev => prev.map(p => 
        p.product_url === productUrl ? { ...p, ...details, specs: { ...p.specs, ...details.specs } } : p
      ));
      
      return details;
    } catch (err) {
      console.error("Failed to fetch extended specs:", err);
      return null;
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
    uniquePackages: [...new Set(results.map(r => r.specs?.package || 'N/A'))].filter(p => p !== 'N/A'),
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
    fetchPartDetails,
    handleRetryConnection,
    setIsBackendConnected,
    setConnectionError,
    activeSearchQuery,
    isSearchFetching
  };
};
