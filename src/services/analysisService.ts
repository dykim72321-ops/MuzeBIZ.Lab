import { supabase } from '../lib/supabase';
import type { Stock } from '../types';

export interface QuantAnalysis {
  matchReasoning: string;
  bullCase: string[];
  bearCase: string[];
  dnaScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'CRITICAL';
  riskReason: string;
  survivalRate: 'Healthy' | 'Warning' | 'Critical';
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
  // 🆕 Master Algorithm Fields
  popProbability?: number;
  matchedLegend?: {
    ticker: string;
    similarity: number;
  };
}

export async function fetchStockAnalysis(stock: Stock): Promise<QuantAnalysis | null> {
  try {
    // 1. Try to fetch from "Zero-Cost" tables first
    const { data: auditData, error: auditError } = await supabase
      .from('risk_audits')
      .select('*')
      .eq('ticker', stock.ticker)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 406 에러나 권한 문제는 경고만 표시하고 fallback
    if (auditError) {
      if (auditError.code === 'PGRST116') {
        console.log(`ℹ️ No cached audit for ${stock.ticker}, using Quant analysis`);
      } else if (auditError.message?.includes('406') || auditError.message?.includes('Not Acceptable')) {
        console.warn(`⚠️ RLS policy blocked access to risk_audits for ${stock.ticker}, using Quant analysis`);
      } else {
        console.error(`❌ Failed to fetch risk_audit for ${stock.ticker}:`, auditError);
      }
    } else if (auditData) {
      console.log(`✅ Using Zero-Cost Risk Audit for ${stock.ticker}`);
      
      // Map Zero-Cost data to QuantAnalysis interface
      return {
        matchReasoning: auditData.audit_reason,
        bullCase: [], // Heuristically empty or could be derived
        bearCase: [auditData.audit_reason],
        dnaScore: Math.round(100 - auditData.risk_score), // Inverse of risk
        riskLevel: auditData.risk_score > 80 ? 'CRITICAL' : 
                   auditData.risk_score > 60 ? 'High' : 
                   auditData.risk_score > 30 ? 'Medium' : 'Low',
        riskReason: auditData.audit_reason,
        survivalRate: auditData.cash_runway_months < 6 ? 'Critical' : 
                      auditData.cash_runway_months < 12 ? 'Warning' : 'Healthy',
        financialHealthAudit: `Cash Runway: ${auditData.cash_runway_months} months. Dilution Likely: ${auditData.is_dilution_likely}`,
        marketTrendAnalysis: "Analyzed via Zero-Cost Collector."
      };
    }

    // 2. Fallback to Quant Edge Function
    const { data, error } = await supabase.functions.invoke('analyze-stock', {
      body: {
        ticker: stock.ticker,
        price: stock.price,
        change: stock.changePercent,
        volume: stock.volume,
        peRatio: stock.relevantMetrics.peRatio,
        revenueGrowth: stock.relevantMetrics.revenueGrowth,
        operatingMargin: stock.relevantMetrics.operatingMargin,
        sentimentScore: stock.relevantMetrics.sentimentScore,
        sentimentLabel: stock.relevantMetrics.sentimentLabel,
        institutionalOwnership: stock.relevantMetrics.institutionalOwnership,
        topInstitution: stock.relevantMetrics.topInstitution,
        sector: stock.sector,
        cashRunway: stock.relevantMetrics.cashRunway,
        netIncome: stock.relevantMetrics.netIncome,
        totalCash: stock.relevantMetrics.totalCash,
        debtToEquity: stock.relevantMetrics.debtToEquity,
        newsHeadlines: stock.newsHeadlines || [],
        // 🆕 Momentum Indicators
        relativeVolume: stock.relevantMetrics.relativeVolume,
        averageVolume10d: stock.relevantMetrics.averageVolume10d,
      },
    });

    if (error) throw error;
    return data as QuantAnalysis;
  } catch (error) {
    console.warn('Quant Analysis failed, falling back to heuristic:', error);
    return null;
  }
}

export async function getStrategyStats() {
  try {
    const response = await fetch('/py-api/api/strategy/stats');
    if (!response.ok) throw new Error('Failed to fetch strategy stats');
    return await response.json();
  } catch (err) {
    console.error('Error fetching strategy stats:', err);
    return null;
  }
}
