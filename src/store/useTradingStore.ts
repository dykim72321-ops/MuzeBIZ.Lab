/**
 * useTradingStore.ts — Zustand Global Trading State
 *
 * UnifiedDashboard.tsx에서 분리한 전역 상태 스토어.
 * 컴포넌트 렌더링을 세분화(Selector 기반 구독)하여 불필요한 리렌더링을 차단한다.
 *
 * 핵심 설계 원칙:
 *   1. 상태(State) + 액션(Actions) 함께 정의 → 어디서든 import해서 사용
 *   2. 서비스 함수는 직접 import (순환 참조 방지)
 *   3. 데이터 변환(mapping)은 이 스토어에서 수행 → 뷰는 순수 렌더링만
 */

import { create } from 'zustand';
import type {
  DiscoveryStock,
  PaperPosition,
  PaperHistory,
  TerminalData,
  PortfolioHistoryPoint,
} from '../types/dashboard';

import type { BrokerPositionRaw, ClosedTradeRaw, BrokerAccountResponse, PennyScanStatusResponse } from '../types/api';
import {
  fetchBrokerStatus,
  fetchBrokerAccount,
  fetchBrokerPositions,
  fetchClosedTrades,
  fetchPennyScanStatus,
  fetchPortfolioHistory,
} from '../services/pythonApiService';

import { supabase as supabaseClient } from '../lib/supabase';

// ─── Constants ───────────────────────────────────────────────────────────────

const PENNY_THRESHOLD = 1.0;

// ─── State Shape ─────────────────────────────────────────────────────────────

interface EdgeAlert {
  active: boolean;
  message: string | null;
}

interface TradingState {
  // ── System Status ──
  isArmed: boolean;
  isMarketOpen: boolean;
  isSettingsOpen: boolean;
  loading: boolean;
  lastFetchedTime: string;
  connectionError: boolean;

  // ── Data ──

  discoveryStocks: DiscoveryStock[];
  livePositions: PaperPosition[];
  liveHistory: PaperHistory[];
  portfolioHistory: PortfolioHistoryPoint[];
  paperAccount: BrokerAccountResponse | null;
  pennyScanStatus: PennyScanStatusResponse | null;
  edgeAlert: EdgeAlert;
  terminalData: TerminalData | null;

  // ── Chart ──
  chartRange: '7d' | '30d' | 'all';

  // ── Actions ──
  setIsArmed: (armed: boolean) => void;
  setIsMarketOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setChartRange: (range: '7d' | '30d' | 'all') => void;
  setTerminalData: (data: TerminalData | null | ((prev: TerminalData | null) => TerminalData | null)) => void;
  setEdgeAlert: (alert: EdgeAlert) => void;

  // ── Data Fetching ──
  loadDashboardData: () => Promise<void>;
  loadArmStatus: () => Promise<void>;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapPaperPositions(raw: BrokerPositionRaw[]): PaperPosition[] {
  return raw
    .map((pp) => {
      const entry = Number(pp.entry_price);
      const current = pp.current_price != null ? Number(pp.current_price) : entry;
      const units = Number(pp.units ?? pp.quantity);
      const isPenny = pp.is_penny ?? entry <= PENNY_THRESHOLD;
      const highestPrice = pp.highest_price != null ? Number(pp.highest_price) : Math.max(entry, current);
      const tsThreshold = pp.ts_threshold != null ? Number(pp.ts_threshold) : highestPrice * (isPenny ? 0.90 : 0.95);

      return {
        ticker: pp.ticker,
        units,
        entry_price: entry,
        current_price: current,
        ts_threshold: tsThreshold,
        trailing_stop: tsThreshold,
        highest_price: highestPrice,
        status: pp.status ?? 'HOLDING',
        is_penny: isPenny,
        created_at: pp.created_at ?? undefined,
        unrealized_pl: Number(pp.unrealized_pl ?? 0),
        unrealized_plpc: Number(pp.unrealized_plpc ?? 0),
        isPenny,
      };
    })
    .filter((p) => p.units > 0);
}

function mapPaperHistory(raw: ClosedTradeRaw[]): PaperHistory[] {
  return raw.map((th) => ({
    id: th.id,
    ticker: th.ticker,
    units: Number(th.units ?? 0),
    entry_price: Number(th.entry_price ?? 0),
    exit_price: Number(th.exit_price ?? 0),
    pnl: Number(th.profit_amt ?? 0),
    pnl_pct: Number(th.pnl_pct ?? 0),
    profit_amt: Number(th.profit_amt ?? 0),
    exit_reason: th.exit_reason ?? 'Alpaca Order',
    is_penny: th.is_penny,
    isPenny: th.is_penny,
    created_at: th.created_at,
    closed_at: th.created_at,
  }));
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useTradingStore = create<TradingState>((set) => ({
  // ── Initial State ──
  isArmed: false,
  isMarketOpen: false,
  isSettingsOpen: false,
  loading: true,
  lastFetchedTime: '--:--:--',
  connectionError: false,


  discoveryStocks: [],
  livePositions: [],
  liveHistory: [],
  portfolioHistory: [],
  paperAccount: null,
  pennyScanStatus: null,
  edgeAlert: { active: false, message: null },
  terminalData: null,

  chartRange: 'all',

  // ── Simple Setters ──
  setIsArmed: (armed) => set({ isArmed: armed }),
  setIsMarketOpen: (open) => set({ isMarketOpen: open }),
  setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setChartRange: (range) => set({ chartRange: range }),
  setTerminalData: (dataOrUpdater) =>
    set((state) => ({
      terminalData:
        typeof dataOrUpdater === 'function'
          ? dataOrUpdater(state.terminalData)
          : dataOrUpdater,
    })),
  setEdgeAlert: (alert) => set({ edgeAlert: alert }),


  // ── loadArmStatus ──
  loadArmStatus: async () => {
    try {
      const status = await fetchBrokerStatus();
      if (status && typeof status.is_armed === 'boolean') {
        set({ isArmed: status.is_armed });
      }
    } catch (e) {
      console.warn('Failed to fetch broker status:', e);
    }
  },

  // ── loadDashboardData ──
  loadDashboardData: async () => {
    try {
      // Promise.all은 6개 요청 중 단 하나만 실패해도 이미 성공한 나머지 결과까지
      // 통째로 버려 화면이 옛 상태(livePositions 등)에 영구히 고정되는 원인이 됐다.
      // allSettled로 바꿔 각 데이터를 독립적으로 반영 — 실패한 항목만 기존 값을 유지한다.
      const [
        paperAccountResult,
        discoveryResult,
        scanStatusResult,
        brokerPositionsResult,
        paperHistoryResult,
        portfolioHistoryResult,
      ] = await Promise.allSettled([
        fetchBrokerAccount(),
        supabaseClient
          .from('daily_discovery')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .not('dna_score', 'is', null)
          .gte('dna_score', 70)
          .order('dna_score', { ascending: false })
          .limit(8),
        fetchPennyScanStatus(),
        fetchBrokerPositions(),
        fetchClosedTrades(200),
        fetchPortfolioHistory('all', '1D'),
      ]);

      const updates: Partial<TradingState> = {
        lastFetchedTime: new Date().toISOString().substring(11, 19),
        loading: false,
      };
      let anyFailed = false;

      if (discoveryResult.status === 'fulfilled') {
        updates.discoveryStocks = ((discoveryResult.value.data || []) as DiscoveryStock[]).filter(
          (s) => s.dna_score != null && s.price != null,
        );
      } else {
        anyFailed = true;
        console.error('Failed to load daily_discovery:', discoveryResult.reason);
      }

      if (brokerPositionsResult.status === 'fulfilled') {
        updates.livePositions = mapPaperPositions(brokerPositionsResult.value);
      } else {
        anyFailed = true;
        console.error('Failed to load paper positions:', brokerPositionsResult.reason);
      }

      if (paperHistoryResult.status === 'fulfilled') {
        updates.liveHistory = mapPaperHistory(paperHistoryResult.value);
      } else {
        anyFailed = true;
        console.error('Failed to load paper history:', paperHistoryResult.reason);
      }

      if (portfolioHistoryResult.status === 'fulfilled') {
        updates.portfolioHistory = portfolioHistoryResult.value as PortfolioHistoryPoint[];
      } else {
        anyFailed = true;
        console.error('Failed to load portfolio history:', portfolioHistoryResult.reason);
      }

      if (scanStatusResult.status === 'fulfilled' && scanStatusResult.value) {
        updates.pennyScanStatus = scanStatusResult.value;
      } else if (scanStatusResult.status === 'rejected') {
        anyFailed = true;
        console.error('Failed to load penny scan status:', scanStatusResult.reason);
      }

      if (
        paperAccountResult.status === 'fulfilled' &&
        paperAccountResult.value &&
        !('error' in paperAccountResult.value)
      ) {
        updates.paperAccount = paperAccountResult.value;
      } else {
        // 계좌 응답이 에러 페이로드를 담고 있거나 요청 자체가 실패하면
        // 이전 값(stale)을 유지하고 배지로만 알린다.
        anyFailed = true;
      }

      updates.connectionError = anyFailed;
      set(updates);

      // Edge Monitor 경보 상태 조회
      const { data: settingsRow } = await supabaseClient
        .from('system_settings')
        .select('edge_alert_active, edge_alert_message')
        .eq('id', 1)
        .single();

      if (settingsRow) {
        set({
          edgeAlert: {
            active: Boolean(settingsRow.edge_alert_active),
            message: settingsRow.edge_alert_message ?? null,
          },
        });
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      set({ loading: false, connectionError: true });
    }
  },
}));
