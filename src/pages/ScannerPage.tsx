import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { getTopStocks } from '../services/stockService';
import type { Stock } from '../types';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { addToWatchlist } from '../services/watchlistService';
import { useNavigate } from 'react-router-dom';
import { calculateDNATargets } from '../utils/dnaMath';

// New Components
import { ScannerHeader } from '../components/scanner/ScannerHeader';
import { ScannerControls } from '../components/scanner/ScannerControls';
import { ScannerTopFive } from '../components/scanner/ScannerTopFive';
import { ScannerAssetList } from '../components/scanner/ScannerAssetList';

const RISK_LOW_MAX = 40;
const RISK_HIGH_MIN = 70;

export const ScannerPage = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Terminal Modal State
  const [terminalData, setTerminalData] = useState<any | null>(null);

  // Filters & Sorting
  const [minDna, setMinDna] = useState(0);
  const [selectedSector, setSelectedSector] = useState('All');
  const [selectedRisk, setSelectedRisk] = useState('All');
  const [sortBy, setSortBy] = useState<'dna' | 'price' | 'change'>('dna');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isHistorical, setIsHistorical] = useState(false);

  const fetchStocks = async () => {
    try {
      setLoading(true);
      const data = await getTopStocks(isHistorical);
      setStocks(data);
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, [isHistorical]);

  const sectors = useMemo(() => ['All', ...new Set(stocks.map(s => s.sector))], [stocks]);

  const processedStocks = useMemo(() => {
    return stocks
      .filter(stock => {
        const matchesSearch = stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
          stock.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDna = stock.dnaScore >= minDna;
        const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
        const matchesRisk = selectedRisk === 'All' ||
          (selectedRisk === 'Low' && stock.dnaScore < RISK_LOW_MAX) ||
          (selectedRisk === 'Medium' && stock.dnaScore >= RISK_LOW_MAX && stock.dnaScore < RISK_HIGH_MIN) ||
          (selectedRisk === 'High' && stock.dnaScore >= RISK_HIGH_MIN);

        return matchesSearch && matchesDna && matchesSector && matchesRisk;
      })
      .sort((a, b) => {
        let valA = sortBy === 'dna' ? a.dnaScore : sortBy === 'price' ? a.price : a.changePercent;
        let valB = sortBy === 'dna' ? b.dnaScore : sortBy === 'price' ? b.price : b.changePercent;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [stocks, searchTerm, minDna, selectedSector, selectedRisk, sortBy, sortOrder]);

  const toggleSort = (field: 'dna' | 'price' | 'change') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleDeepDive = (stock: Stock) => {
    const cache = (stock as { stock_analysis_cache?: Array<{ analysis: any }> }).stock_analysis_cache?.[0]?.analysis;
    const rawSummary = stock.rawAiSummary || "";

    let bullPoints = ["No details available"];
    let bearPoints = ["No details available"];
    let aiSummaryStr = "해당 자산에 대한 최신 시장 Narrative를 분석 중입니다...";
    let quantData: any = undefined;

    if (rawSummary && rawSummary.trim().startsWith('{')) {
      try {
        quantData = JSON.parse(rawSummary);
        aiSummaryStr = "순수 퀀트(수학적) 알고리즘 분석 결과가 적용되었습니다.";
        bullPoints = [
          `이동평균선(20일) 이격도: ${quantData.ma20_distance_pct ?? 'N/A'}%`,
          `RSI (14일): ${quantData.rsi_14 ?? 'N/A'}`
        ];
        bearPoints = [
          `최근 20일 변동성: ${quantData.volatility_20d_pct ?? 'N/A'}%`,
          `거래량 급증 배수: ${quantData.volume_surge_multiplier ?? 'N/A'}x`
        ];
      } catch (e) {
        console.warn(`Failed to parse raw summary for ${stock.ticker}:`, e);
      }
    } else if (cache && Object.keys(cache).length > 0) {
      bullPoints = cache.bullCase || bullPoints;
      bearPoints = cache.bearCase || bearPoints;
      aiSummaryStr = cache.aiSummary || aiSummaryStr;
    } else if (rawSummary) {
      const bullMatch = rawSummary.match(/🐂 Bull: (.*)/);
      const bearMatch = rawSummary.match(/🐻 Bear: (.*)/);
      const reasoningMatch = rawSummary.match(/💡\s*([\s\S]*)/); 

      if (bullMatch) bullPoints = [bullMatch[1]];
      if (bearMatch) bearPoints = [bearMatch[1]];
      if (reasoningMatch) aiSummaryStr = reasoningMatch[1].trim();
    }

    setTerminalData({
      ticker: stock.ticker,
      dnaScore: stock.dnaScore,
      popProbability: cache?.popProbability || quantData?.historical_win_rate_pct || 0,
      bullPoints,
      bearPoints,
      matchedLegend: cache?.matchedLegend || { ticker: 'None', similarity: 0 },
      riskLevel: cache?.riskLevel || 'Medium',
      aiSummary: aiSummaryStr,
      price: stock.price,
      change: `${stock.changePercent.toFixed(2)}%`,
      quantData
    });
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">
      <ScannerHeader 
        loading={loading}
        onRefresh={fetchStocks}
        onNavigateWatchlist={() => navigate('/watchlist')}
      />

      <ScannerControls 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        minDna={minDna}
        onMinDnaToggle={() => setMinDna(minDna === 70 ? 0 : 70)}
        isHistorical={isHistorical}
        onHistoricalToggle={() => setIsHistorical(!isHistorical)}
        selectedRisk={selectedRisk}
        onRiskChange={setSelectedRisk}
        selectedSector={selectedSector}
        onSectorChange={setSelectedSector}
        sectors={sectors}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 space-y-6 relative">
          <Loader2 className="w-16 h-16 text-[#0176d3] animate-spin relative z-10 opacitiy-80" />
          <p className="text-slate-400 font-black text-xs tracking-widest uppercase animate-pulse">Filtering Market Signal Matrix...</p>
        </div>
      ) : processedStocks.length === 0 ? (
        <div className="text-center py-40 bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-inner">
          <p className="text-slate-500 font-bold text-lg">No results matched your search matrix.</p>
          <button onClick={() => { setSearchTerm(''); setMinDna(0); setSelectedRisk('All'); setSelectedSector('All'); }} className="mt-4 text-[#0176d3] font-black uppercase text-xs hover:underline tracking-widest">Reset Core Filters</button>
        </div>
      ) : (
        <>
          <ScannerTopFive stocks={stocks} onDeepDive={handleDeepDive} />
          <div className="h-4" />
          <ScannerAssetList 
            viewMode={viewMode}
            stocks={processedStocks}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
            onDeepDive={handleDeepDive}
          />
        </>
      )}

      {terminalData && (
        <StockTerminalModal
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
          onAddToWatchlist={async () => {
            try {
              const buyPrice = terminalData.price;
              const { targetPrice, stopPrice } = calculateDNATargets(
                buyPrice, 
                buyPrice,
                buyPrice,
                terminalData.quantData?.atr5
              );
              
              await addToWatchlist(
                terminalData.ticker, 
                undefined, 
                'WATCHING', 
                buyPrice,
                targetPrice,
                stopPrice,
                terminalData.dnaScore
              );
              navigate('/watchlist');
            } catch (err) {
              console.error('Failed to add to watchlist:', err);
              alert('종목 추가에 실패했습니다. 데이터베이스 컬럼(initial_dna_score) 생성 여부를 확인해주세요.');
            }
          }}
        />
      )}
    </div>
  );
};
