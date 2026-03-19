import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, BrainCircuit, Share2, ShieldAlert, ExternalLink, Banknote, ShieldCheck } from 'lucide-react';
import { GradeBadge } from '../ui/GradeBadge';
import { AddToWatchlistBtn } from '../ui/AddToWatchlistBtn';
import { DnaRadarChart } from './DnaRadarChart';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import clsx from 'clsx';

import { fetchStockQuote } from '../../services/stockService';
import { fetchStockAnalysis } from '../../services/analysisService'; 
import { useLiveTicker } from '../../hooks/useLiveTicker';
import { supabase } from '../../lib/supabase';

// --- Types ---
interface AnalysisData {
  score: number;
  verdict: string;
  reason: string;
  bullPoints: string[];
  bearPoints: string[];
  riskScore: number;
  radarData: any[];
  financialHealthAudit?: string;
  marketTrendAnalysis?: string;
  solvencyAnalysis?: {
    survival_months: number;
    financial_health_grade: 'A' | 'B' | 'C' | 'D' | 'F';
    capital_raise_needed: boolean;
    reason: string;
  };
  sentimentAudit?: {
    score: number;
    hype_score: number;
    category: 'Organic' | 'Hype' | 'Negative';
    key_event: string | null;
    summary: string;
  };
  // 🆕 Momentum Master Algorithm Fields
  popProbability?: number;
  matchedLegend?: {
    ticker: string;
    similarity: number;
  };
}

interface RealTimeData {
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  name: string;
  volume: number;
  cashRunway?: number;
  marketCap?: string;
  totalCash?: string;
  netIncome?: string;
  // Yahoo Finance Data
  targetPrice?: number;
  upsidePotential?: number;
  fiftyTwoWeekPosition?: number;
  analystCount?: number;
  recommendation?: string;
  // 🆕 Momentum Indicators
  averageVolume10d?: number;
  relativeVolume?: number;
}

// Helper function to safely render AI analysis content (string or object)
const renderContent = (content: any): string => {
  if (!content) return "";
  if (typeof content === 'string') return content;
  
  // If it's an object (e.g., 5W1H structure), convert to formatted string
  if (typeof content === 'object') {
    return Object.entries(content)
      .map(([key, value]) => `[${key}] ${value}`)
      .join('\n');
  }
  
  return String(content);
};


export const DnaMatchView = () => {
  const { id } = useParams(); // id = ticker
  const navigate = useNavigate();
  const ticker = id?.toUpperCase() || "UNKNOWN";

  // --- State Management ---
  const [loading, setLoading] = useState(true);
  const [realTimeData, setRealTimeData] = useState<RealTimeData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [legendData, setLegendData] = useState<any>(null); // 🆕 Matched Legend details
  const [error, setError] = useState<string | null>(null);

  // --- Live Ticker Hook ---
  const { currentPrice, isConnected } = useLiveTicker(ticker);

  // --- Live Price Override Effect ---
  useEffect(() => {
    if (currentPrice && realTimeData) {
      setRealTimeData(prev => prev ? { ...prev, price: currentPrice } : null);
    }
  }, [currentPrice]);

  // --- Data Fetching Effect ---
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. 병렬 요청: 실시간 시세 + AI 분석 데이터 + 포트폴리오 상태 확인
        const quoteData = await fetchStockQuote(ticker);
        
        let analysisData = null;
        if (quoteData) {
          analysisData = await fetchStockAnalysis(quoteData);
        }

        if (!isMounted) return;

        // 2. 실시간 데이터 매핑
        if (quoteData) {
          setRealTimeData({
            price: quoteData.price || 0,
            change: 0, // Stock type doesn't have absolute change, only %
            changePercent: quoteData.changePercent || 0,
            sector: quoteData.sector || "Unknown", 
            name: quoteData.name || ticker,
            volume: quoteData.volume || 0,
            marketCap: quoteData.marketCap || "N/A",
            totalCash: quoteData.relevantMetrics.totalCash,
            netIncome: quoteData.relevantMetrics.netIncome,
            cashRunway: quoteData.relevantMetrics.cashRunway,
            // Yahoo Data
            targetPrice: quoteData.relevantMetrics.targetPrice,
            upsidePotential: quoteData.relevantMetrics.upsidePotential,
            fiftyTwoWeekPosition: quoteData.relevantMetrics.fiftyTwoWeekPosition,
            analystCount: quoteData.relevantMetrics.analystCount,
            recommendation: quoteData.relevantMetrics.recommendation,
            // 🆕 Momentum Indicators
            averageVolume10d: quoteData.relevantMetrics.averageVolume10d,
            relativeVolume: quoteData.relevantMetrics.relativeVolume,
          });
        }

        // 3. AI 분석 데이터 매핑 (데이터가 없으면 기본값 제공)
        if (analysisData) {
          setAnalysis({
            score: analysisData.dnaScore || 0,
            verdict: getVerdictLabel(analysisData.dnaScore),
            reason: analysisData.matchReasoning || "AI 분석 대기 중...",
            bullPoints: analysisData.bullCase || [],
            bearPoints: analysisData.bearCase || [],
            riskScore: analysisData.riskLevel === 'CRITICAL' ? 95 : 
                       analysisData.riskLevel === 'High' ? 75 : 
                       analysisData.riskLevel === 'Medium' ? 45 : 15,
            financialHealthAudit: analysisData.financialHealthAudit,
            marketTrendAnalysis: analysisData.marketTrendAnalysis,
            solvencyAnalysis: analysisData.solvencyAnalysis,
            sentimentAudit: analysisData.sentimentAudit,
            // 🆕 Master Algorithm Mapping
            popProbability: analysisData.popProbability,
            matchedLegend: analysisData.matchedLegend,
            radarData: [], // Initial empty, will be updated by Effect 3
          });
        }
      } catch (err) {
        console.error("Data Load Error:", err);
        setError("데이터를 불러오는 데 실패했습니다.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (ticker !== "UNKNOWN") {
      loadData();
    }

    return () => { isMounted = false; };
  }, [ticker]);

  // --- Effect 2: Fetch Legend Data for Comparison (Improvement 3) ---
  useEffect(() => {
    const fetchLegend = async () => {
      if (!analysis?.matchedLegend || analysis.matchedLegend.ticker === 'None') {
        setLegendData(null);
        return;
      }

      try {
        const { data } = await supabase
          .from('stock_legends')
          .select('*')
          .eq('ticker', analysis.matchedLegend.ticker)
          .maybeSingle();

        if (data) {
          console.log(`🗺️ [Legend Loaded] ${data.ticker} details fetched for comparison.`);
          setLegendData(data);
        }
      } catch (err) {
        console.warn("Failed to fetch legend details:", err);
      }
    };

    fetchLegend();
  }, [analysis?.matchedLegend]);

  // --- Effect 3: Generate Radar Data ---
  useEffect(() => {
    if (analysis && analysis.score !== undefined) {
      // Comparison logic: A = Legend, B = Current
      const lMetrics = legendData?.metrics || {};
      const rMetrics = realTimeData?.relativeVolume || 0;
      
      const newRadarData = [
        { subject: 'Momentum', A: lMetrics.relVol ? Math.min(lMetrics.relVol * 10, 100) : 70, B: Math.min(rMetrics * 10, 100), fullMark: 100 },
        { subject: 'Growth', A: lMetrics.gain15d ? 95 : 80, B: Math.min(Math.abs(realTimeData?.changePercent || 0) * 2, 100), fullMark: 100 },
        { subject: 'DNA', A: 90, B: analysis.score, fullMark: 100 },
        { subject: 'Volume', A: legendData ? 85 : 0, B: realTimeData?.volume ? 75 : 0, fullMark: 100 },
        { subject: 'Risk', A: 30, B: analysis.riskScore || 50, fullMark: 100 },
      ];
      
      setAnalysis(prev => prev ? { ...prev, radarData: newRadarData } : null);
    }
  }, [analysis?.score, legendData, realTimeData]);



  // --- Helpers ---
  const getVerdictLabel = (score: number) => {
    if (score >= 80) return "STRONG BUY";
    if (score >= 60) return "BUY";
    if (score >= 40) return "HOLD";
    return "SELL";
  };



  // --- Render Loading ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <BrainCircuit className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
        </div>
        <h2 className="mt-6 text-xl font-bold text-white tracking-tight">Syncing Real-time Data...</h2>
        <p className="text-slate-400 font-mono text-sm mt-2">Analyzing DNA Patterns for {ticker}...</p>
      </div>
    );
  }

  // --- Render Error ---
  if (error || !realTimeData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-white">데이터 로드 실패</h2>
        <p className="text-slate-400 mt-2 mb-6">해당 종목의 데이터를 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/')} className="px-4 py-2 bg-slate-800 rounded text-white">돌아가기</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      
      {/* MASTHEAD - Newspaper Style Header */}
      <header className="border-b-2 border-slate-700 pb-6 mb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-4 group text-sm">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to List
        </button>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            {/* Ticker & Company */}
            <div className="flex items-baseline gap-3 mb-1">
              <h1 className="text-5xl font-black text-white tracking-tighter font-serif">{ticker}</h1>
              <span className="text-3xl font-light text-slate-400 font-mono">${realTimeData.price.toFixed(2)}</span>
              <span className={clsx(
                "text-lg font-bold px-2 py-0.5 rounded",
                realTimeData.changePercent >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
              )}>
                {realTimeData.changePercent >= 0 ? '▲' : '▼'} {Math.abs(realTimeData.changePercent).toFixed(2)}%
              </span>
              {isConnected && (
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
            
            {/* Subtitle */}
            <p className="text-slate-400 text-sm tracking-wide">
              {realTimeData.name} • <span className="text-slate-500">{realTimeData.sector}</span>
              {analysis && analysis.riskScore > 70 && (
                <span className="ml-2 text-amber-500 font-medium">• ⚠ High Risk</span>
              )}
            </p>
          </div>
          
          <div className="flex gap-2">
            <AddToWatchlistBtn ticker={ticker} dnaScore={analysis?.score} />
            <button className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700/50 transition-colors flex items-center gap-2 text-sm">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* LEAD QUOTE - One-line summary in large italic font */}
      {analysis && (
        <blockquote className="border-l-4 border-indigo-500 pl-6 py-4 mb-10">
          <p className="text-xl md:text-2xl text-slate-200 font-serif italic leading-relaxed">
            "{analysis.bullPoints?.[0] || "AI 분석 결과를 기반으로 투자 의견을 제공합니다."}"
          </p>
          <footer className="mt-3 text-sm text-slate-500 font-mono">
            — MuzeBIZ.Lab Master AI • {new Date().toLocaleDateString('ko-KR')}
          </footer>
        </blockquote>
      )}

      {/* MOMENTUM PATTERN MATCH - Hero Section */}
      {analysis?.matchedLegend && analysis.matchedLegend.ticker !== 'None' && (
        <Card className="mb-12 p-8 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/20 border-indigo-500/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-32 h-32 text-indigo-400 rotate-12" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-500 p-2 rounded-lg shadow-[0_0_20px_rgba(99,102,241,0.5)]">
                <BrainCircuit className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight uppercase">Momentum Pattern Match</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Master Algorithm Engine</span>
                  <div className="h-1 w-1 rounded-full bg-slate-600"></div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Similarity: {analysis.matchedLegend.similarity.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-slate-300 text-lg leading-relaxed font-medium italic">
                  "현재 {ticker}의 거래량 분출과 가격 변동성이 전설적인 **{analysis.matchedLegend.ticker}**의 급등 전 초기 패턴과 
                  <span className="text-white font-bold ml-1">{analysis.matchedLegend.similarity.toFixed(0)}% 일치</span>합니다."
                </p>
                
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Pop Probability</p>
                    <p className="text-3xl font-black text-emerald-400 font-mono">{analysis.popProbability}%</p>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Mirror Target</p>
                    <p className="text-3xl font-black text-indigo-400 font-mono">{analysis.matchedLegend.ticker}</p>
                  </div>
                </div>
              </div>

              {/* Legendary Mini-Card */}
              <div className="bg-slate-950/80 rounded-2xl p-6 border border-white/10 shadow-2xl">
                 <div className="flex justify-between items-start mb-4">
                    <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 font-black">HISTORICAL LEGEND</Badge>
                    <p className="text-xs text-slate-500 font-bold">2021 Momentum King</p>
                 </div>
                 <h3 className="text-3xl font-black text-white mb-2">{legendData?.ticker || analysis.matchedLegend.ticker}</h3>
                 <p className="text-sm text-slate-400 leading-relaxed mb-6">
                   {legendData?.description || "과거 기록적인 숏스퀴즈와 개인 투자자들의 결집으로 폭발적인 성장을 기록했던 전설적 종목입니다."}
                 </p>
                 
                 <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                       <span className="text-slate-500">Historical Gain</span>
                       <span className="text-emerald-400">+1,800% (15d)</span>
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 w-[95%]"></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Analysis Sections */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">DNA Score</p>
          <p className="text-4xl font-black text-white font-mono">{analysis?.score || 0}</p>
          <p className="text-xs text-slate-600 mt-1">/100</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Target Price</p>
          <p className="text-4xl font-black text-white font-mono">
            {realTimeData.targetPrice ? `$${realTimeData.targetPrice.toFixed(2)}` : 'N/A'}
          </p>
          {realTimeData.upsidePotential && (
            <p className={clsx("text-xs mt-1 font-bold", realTimeData.upsidePotential > 0 ? "text-emerald-400" : "text-rose-400")}>
              {realTimeData.upsidePotential > 0 ? '↑' : '↓'}{Math.abs(realTimeData.upsidePotential).toFixed(1)}%
            </p>
          )}
        </div>
        {/* 🆕 Relative Volume - Key Momentum Signal */}
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Rel Volume</p>
          <p className={clsx(
            "text-4xl font-black font-mono",
            (realTimeData.relativeVolume || 0) >= 3 ? "text-amber-400" : 
            (realTimeData.relativeVolume || 0) >= 2 ? "text-emerald-400" : 
            (realTimeData.relativeVolume || 0) >= 1 ? "text-white" : "text-slate-500"
          )}>
            {realTimeData.relativeVolume ? `${realTimeData.relativeVolume.toFixed(1)}x` : 'N/A'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {(realTimeData.relativeVolume || 0) >= 2 ? '🔥 Strong' : 
             (realTimeData.relativeVolume || 0) >= 1.5 ? 'Active' : 'Normal'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Risk Level</p>
          <p className={clsx(
            "text-3xl font-black",
            (analysis?.riskScore || 0) > 70 ? "text-rose-400" : 
            (analysis?.riskScore || 0) > 40 ? "text-amber-400" : "text-emerald-400"
          )}>
            {(analysis?.riskScore || 0) > 70 ? "HIGH" : (analysis?.riskScore || 0) > 40 ? "MEDIUM" : "LOW"}
          </p>
          <p className="text-xs text-slate-600 mt-1">{analysis?.riskScore || 0}/100</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Verdict</p>
          <p className={clsx(
            "text-3xl font-black uppercase tracking-tight",
            (analysis?.score || 0) >= 70 ? "text-emerald-400" : 
            (analysis?.score || 0) >= 50 ? "text-amber-400" : "text-rose-400"
          )}>
            {analysis?.verdict || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {realTimeData.analystCount ? `${realTimeData.analystCount} analysts` : ''}
          </p>
        </div>
      </section>

      {/* INVESTMENT THESIS - Editorial text block */}
      {analysis && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 tracking-tight font-serif border-b border-slate-800 pb-3">
            Investment Thesis
          </h2>
          <div className="prose prose-invert prose-slate max-w-none">
            <p className="text-slate-300 text-base leading-relaxed whitespace-pre-wrap">
              {renderContent(analysis.reason)}
            </p>
          </div>
        </section>
      )}

      {/* BULL vs BEAR - Side by Side (Only Once) */}
      {analysis && (analysis.bullPoints?.length || analysis.bearPoints?.length) && (
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Bull Case */}
            <div>
              <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2 border-b border-emerald-500/30 pb-2">
                <TrendingUp className="w-5 h-5" />
                Bull Case
              </h3>
              <ul className="space-y-3">
                {analysis.bullPoints?.map((point, i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-300 text-sm leading-relaxed">
                    <span className="text-emerald-500 font-bold mt-0.5">+</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Bear Case */}
            <div>
              <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2 border-b border-rose-500/30 pb-2">
                <ShieldAlert className="w-5 h-5" />
                Bear Case
              </h3>
              <ul className="space-y-3">
                {analysis.bearPoints?.map((point, i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-300 text-sm leading-relaxed">
                    <span className="text-rose-500 font-bold mt-0.5">−</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* FINANCIAL DATA + CHART - Two Column */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 py-8 border-y border-slate-800">
        {/* Financial Health */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-indigo-400" />
            Financial Health
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-slate-800/50 pb-3">
              <span className="text-slate-400 text-sm">Total Cash</span>
              <span className="text-white font-mono font-bold">{realTimeData?.totalCash || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-slate-800/50 pb-3">
              <span className="text-slate-400 text-sm">TTM Net Income</span>
              <span className={clsx("font-mono font-bold", realTimeData?.netIncome?.includes('-') ? "text-rose-400" : "text-emerald-400")}>
                {realTimeData?.netIncome || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-b border-slate-800/50 pb-3">
              <span className="text-slate-400 text-sm">Cash Runway</span>
              <span className="text-indigo-400 font-mono font-bold">
                {realTimeData?.cashRunway && realTimeData?.cashRunway !== 99 ? `${realTimeData?.cashRunway} Mo` : 'Healthy'}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-sm">Market Cap</span>
              <span className="text-white font-mono font-bold">{realTimeData?.marketCap || 'N/A'}</span>
            </div>
          </div>
          
          {/* External Links */}
          <div className="flex gap-2 mt-6">
            <a 
              href={`https://finviz.com/quote.ashx?t=${ticker}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1"
            >
              Finviz <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-slate-700">•</span>
            <a 
              href={`https://finance.yahoo.com/quote/${ticker}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1"
            >
              Yahoo <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        
        {/* DNA Pattern Chart */}
        <div>
          <DnaRadarChart data={analysis?.radarData || []} />
        </div>
      </section>

      {/* SOLVENCY ANALYSIS (if available) */}
      {analysis?.solvencyAnalysis && (
        <section className="mb-12 p-6 bg-slate-900/30 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Solvency Assessment
            </h3>
            <GradeBadge grade={analysis.solvencyAnalysis.financial_health_grade} />
          </div>
          <p className="text-slate-400 text-sm leading-relaxed italic">
            "{analysis.solvencyAnalysis.reason}"
          </p>
          <div className="flex gap-6 mt-4 text-sm">
            <span className="text-slate-500">
              Survival: <span className="text-white font-bold">{analysis.solvencyAnalysis.survival_months} months</span>
            </span>
            {analysis.solvencyAnalysis.capital_raise_needed && (
              <span className="text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Dilution Risk
              </span>
            )}
          </div>
        </section>
      )}

      {/* DISCLAIMER */}
      <footer className="text-center py-8 border-t border-slate-800">
        <p className="text-[11px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
          본 보고서는 AI 알고리즘에 의해 자동 생성되었으며 투자 권유가 아닙니다. 
          모든 투자 결정은 본인의 책임 하에 이루어져야 합니다.
        </p>
        <p className="text-[10px] text-slate-700 mt-3 font-mono">
          Data: Finnhub • Yahoo Finance • Alpha Vantage | AI: GPT-4o-mini | Generated: {new Date().toISOString().slice(0, 16).replace('T', ' ')}
        </p>
      </footer>
    </div>
  );
};
