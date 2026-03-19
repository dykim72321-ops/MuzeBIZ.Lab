import { useState, useEffect, useMemo } from 'react';
import {
  ArrowUpRight, Search, Loader2, RefreshCw,
  List, LayoutGrid, ArrowDownWideNarrow, ArrowUpWideNarrow,
  Zap, TrendingUp, TrendingDown, Clock
} from 'lucide-react';

import { Card } from '../components/ui/Card';
import { getTopStocks } from '../services/stockService';
import type { Stock } from '../types';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { StockTerminalModal } from '../components/dashboard/StockTerminalModal';
import { addToWatchlist } from '../services/watchlistService';
import { useNavigate } from 'react-router-dom';
import { useDNACalculator } from '../hooks/useDNACalculator';
import { calculateDNATargets } from '../utils/dnaMath';

const RISK_LOW_MAX = 40;
const RISK_HIGH_MIN = 70;

const TargetStopDisplay = ({ stock }: { stock: Stock }) => {
  const { targetPrice, stopPrice } = useDNACalculator({
    buyPrice: stock.price,
    currentPrice: stock.price,
    buyDate: new Date().toISOString()
  });

  return (
    <div className="flex flex-col gap-1 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/80 min-w-[120px]">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-500 font-bold uppercase tracking-wider">🎯 Target</span>
        <span className="text-emerald-600 font-black">${targetPrice.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono mt-1">
       <span className="text-slate-500 font-bold uppercase tracking-wider">🛡️ Stop</span>
       <span className="text-rose-600 font-black">${stopPrice.toFixed(2)}</span>
      </div>
    </div>
  );
};


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


  useEffect(() => {
    const controller = new AbortController();
    
    const fetchStocks = async () => {
      try {
        setLoading(true);
        // Note: Currently getTopStocks doesn't accept an AbortSignal, 
        // but we can at least prevent state updates if unmounted.
        const data = await getTopStocks(isHistorical);
        if (!controller.signal.aborted) {
          setStocks(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch stocks:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStocks();
    
    return () => {
      controller.abort();
    };
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
    // Map to Terminal format
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
        quantData = undefined;
        // Fallback since parsing failed
      }
    } else if (cache && Object.keys(cache).length > 0) {
      bullPoints = cache.bullCase || bullPoints;
      bearPoints = cache.bearCase || bearPoints;
      aiSummaryStr = cache.aiSummary || aiSummaryStr;
    } else if (rawSummary) {
      // Parse from 🐂 Bull:, 🐻 Bear:, 💡
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
      {/* Page Header — CRM Hub Style */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Quant Intelligence</p>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">퀀트 핫 아이템</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 py-2 px-4 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-500">AI Market Pulse</span>
            <span className="font-black text-slate-800">Bullish Sector Rotation</span>
          </div>
          <button
            onClick={() => navigate('/watchlist')}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm border border-slate-200 transition-colors"
          >
            My Monitoring Orbit
            <ArrowUpRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
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
              fetchStocks();
            }}
            className="sfdc-button-primary flex items-center gap-2"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            데이터 동기화
          </button>
        </div>
      </header>


      {/* Control Bar */}
      <div className="sfdc-card p-4">
        <div className="flex flex-col xl:flex-row gap-6 items-center justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#0176d3] transition-colors" />
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="sfdc-input pl-10 w-64"
              />
            </div>

            <button
              onClick={() => setMinDna(minDna === 70 ? 0 : 70)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md border transition-all text-sm font-black active:scale-95 shadow-sm",
                minDna === 70
                  ? "bg-blue-50 border-blue-200 text-[#0176d3]"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Zap className={clsx("w-3.5 h-3.5", minDna === 70 ? "fill-current" : "")} />
              DNA 70+ SPEC
            </button>

            {/* Historical Scan Toggle */}
            <button
              onClick={() => setIsHistorical(!isHistorical)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md border transition-all text-sm font-black active:scale-95 shadow-sm",
                isHistorical
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Clock className={clsx("w-3.5 h-3.5", isHistorical ? "fill-current" : "")} />
              HISTORICAL SCAN
            </button>


            {/* Risk Selection */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-inner">
              {['All', 'Low', 'Medium', 'High'].map(risk => (
                <button
                  key={risk}
                  onClick={() => setSelectedRisk(risk)}
                  className={clsx(
                    "px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                    selectedRisk === risk ? "bg-white text-[#0176d3] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {risk}
                </button>
              ))}
            </div>

            {/* Sector Dropdown */}
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 rounded-md px-4 py-2 text-sm font-bold focus:border-[#0176d3] focus:ring-4 focus:ring-blue-100 outline-none shadow-sm transition-all"
            >
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-1 shadow-inner">
              <button
                onClick={() => setViewMode('table')}
                className={clsx("p-2 rounded-md transition-all", viewMode === 'table' ? "bg-white text-[#0176d3] shadow-sm" : "text-slate-400")}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={clsx("p-2 rounded-md transition-all", viewMode === 'grid' ? "bg-white text-[#0176d3] shadow-sm" : "text-slate-400")}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
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
          {/* Top 5 Recommendations Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
              <div className="p-2 bg-amber-500 rounded-lg shadow-sm">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                TOP 5 QUANT HOT ITEMS — 핵심 추천 종목
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {stocks.slice(0, 5).map((stock, index) => (
                <motion.div
                  key={stock.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleDeepDive(stock)}
                  className="relative group cursor-pointer"
                >
                  <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-slate-900 border-2 border-white text-white flex items-center justify-center font-black text-xs z-20 shadow-lg group-hover:bg-[#0176d3] transition-colors">
                    {index + 1}
                  </div>
                  <Card className="p-5 bg-white border border-slate-200 group-hover:border-[#0176d3] transition-all duration-300 shadow-sm group-hover:shadow-xl rounded-2xl overflow-hidden h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-sm text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-all">
                        {stock.ticker[0]}
                      </div>
                      <div className={clsx(
                        "text-[10px] font-black font-mono",
                        stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                      </div>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-xl font-black text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</h3>
                      <p className="text-[9px] text-slate-400 uppercase font-black truncate">{stock.name}</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-400">$ {stock.price.toFixed(2)}</span>
                      <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        <Zap className="w-3 h-3 text-[#0176d3] fill-current" />
                        <span className="text-[10px] font-black text-[#0176d3] font-mono">{stock.dnaScore}</span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          <div className="h-4" /> {/* Spacer */}

          {/* List/Grid View Toggle Label */}
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-6">
            <div className="h-5 w-1 bg-slate-400 rounded-full" />
            <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">
              ALL ASSETS MONITORING
            </h2>
          </div>

          {viewMode === 'table' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="px-8 py-5">Asset Identification</th>
                      <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('price')}>
                        Market Value {sortBy === 'price' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                      </th>
                      <th className="px-8 py-5 text-left">Targets &amp; Stops (ATR)</th>
                      <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('change')}>
                        24h Delta {sortBy === 'change' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                      </th>
                      <th className="px-8 py-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('dna')}>
                        DNA Signal {sortBy === 'dna' && (sortOrder === 'asc' ? <ArrowUpWideNarrow className="inline w-3 h-3 ml-1" /> : <ArrowDownWideNarrow className="inline w-3 h-3 ml-1" />)}
                      </th>
                      <th className="px-8 py-5 text-right">Terminal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedStocks.map(stock => (
                      <tr
                        key={stock.id}
                        className="hover:bg-slate-50/80 transition-all group cursor-pointer"
                        onClick={() => handleDeepDive(stock)}
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-black text-xs text-[#0176d3] border border-slate-200 group-hover:bg-white group-hover:shadow-sm transition-all">
                              {stock.ticker[0]}
                            </div>
                            <div>
                              <div className="font-black text-xl text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</div>
                              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{stock.sector}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-slate-800 text-lg font-black">${stock.price.toFixed(2)}</div>
                        </td>
                        <td className="px-8 py-6">
                          <TargetStopDisplay stock={stock} />
                        </td>
                        <td className="px-8 py-6">
                          <div className={clsx(
                            "flex items-center gap-1.5 text-sm font-black font-mono",
                            stock.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {stock.changePercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="flex-1 h-2 w-24 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stock.dnaScore}%` }}
                                transition={{ duration: 1, ease: "circOut" }}
                                className={clsx(
                                  "h-full rounded-full transition-all duration-700",
                                  stock.dnaScore >= 70 ? "bg-[#0176d3]" :
                                    stock.dnaScore >= 40 ? "bg-indigo-400" : "bg-rose-400"
                                )}
                              />
                            </div>
                            <span className="font-black text-lg text-slate-800 font-mono">{stock.dnaScore}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button className="p-3 bg-white text-slate-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all active:scale-90 border border-slate-200 hover:border-[#0176d3] hover:text-[#0176d3] shadow-sm">
                            <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {processedStocks.map(stock => (
                <Card
                  key={stock.id}
                  className="p-6 bg-white border border-slate-200 hover:border-[#0176d3]/40 transition-all group cursor-pointer group rounded-2xl shadow-sm hover:shadow-xl"
                  onClick={() => handleDeepDive(stock)}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-lg text-[#0176d3] group-hover:bg-[#0176d3] group-hover:text-white transition-all duration-300">
                      {stock.ticker[0]}
                    </div>
                    <div className={clsx(
                      "px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm transition-all",
                      stock.changePercent >= 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                    )}>
                      {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter group-hover:text-[#0176d3] transition-colors">{stock.ticker}</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em] mt-1">{stock.name}</p>
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-50 pt-6 mb-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Asset Value</p>
                      <p className="text-2xl font-mono font-black text-slate-900 tabular-nums">${stock.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">DNA Power</p>
                      <div className="flex items-center gap-2 justify-end">
                        <Zap className={clsx("w-4 h-4 fill-current", stock.dnaScore >= 70 ? "text-[#0176d3]" : "text-amber-500")} />
                        <p className="text-2xl font-mono text-slate-900 font-black">{stock.dnaScore}</p>
                      </div>
                    </div>
                  </div>

                  {/* Added Target/Stop for Grid Parity */}
                  <TargetStopDisplay stock={stock} />
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Deep-Dive Modal */}
      {terminalData && (
        <StockTerminalModal
          isOpen={!!terminalData}
          onClose={() => setTerminalData(null)}
          data={terminalData}
          onAddToWatchlist={async () => {
            const buyPrice = terminalData.price;
            // Use Pure Function to get consistent T/S
            const { targetPrice, stopPrice } = calculateDNATargets(
              buyPrice, 
              buyPrice, // 진입 시점이므로 현재가는 진입가와 동일
              buyPrice, // 진입 시점이므로 최고가도 진입가와 동일
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
          }}
        />
      )}
    </div>
  );
};
