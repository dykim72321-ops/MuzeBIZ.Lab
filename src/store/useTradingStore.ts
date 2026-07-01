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
  AlpacaAccount,
  TerminalData,
} from '../types/dashboard';

import type { BrokerPositionRaw, ClosedTradeRaw, PennyScanStatusResponse } from '../types/api';
import {
  fetchBrokerAccount,
  fetchBrokerStatus,
  fetchBrokerPositions,
  fetchClosedTrades,
  fetchPennyScanStatus,
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

  // ── Data ──

  discoveryStocks: DiscoveryStock[];
  livePositions: PaperPosition[];
  liveHistory: PaperHistory[];
  alpacaAccount: AlpacaAccount | null;
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

function mapBrokerPositions(raw: BrokerPositionRaw[]): PaperPosition[] {
  return raw.map((bp) => {
    const entry = Number(bp.entry_price);
    const current = bp.current_price != null ? Number(bp.current_price) : entry;
    const units = Number(bp.quantity);
    const isPenny = entry <= PENNY_THRESHOLD;
    const highestPrice = Math.max(entry, current);
    const tsInitPct = isPenny ? 0.90 : 0.95;
    const estimatedTsThreshold = highestPrice * tsInitPct;

    return {
      ticker: bp.ticker,
      units,
      entry_price: entry,
      current_price: current,
      ts_threshold: estimatedTsThreshold,
      trailing_stop: estimatedTsThreshold,
      highest_price: highestPrice,
      status: 'HOLDING',
      is_penny: isPenny,
      unrealized_pl: (current - entry) * units,
      unrealized_plpc: (current / entry - 1) * 100,
      isPenny,
    };
  });
}

function mapClosedTrades(raw: ClosedTradeRaw[]): PaperHistory[] {
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
    created_at: th.created_at,
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


  discoveryStocks: [],
  livePositions: [],
  liveHistory: [],
  alpacaAccount: null,
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
      const [
        alpaca,
        discoveryResult,
        scanStatus,
        brokerPositions,
        alpacaClosedTrades,
      ] = await Promise.all([
        fetchBrokerAccount().catch(() => null),
        supabaseClient
          .from('daily_discovery')
          .select('*')
          .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .not('dna_score', 'is', null)
          .gte('dna_score', 70)
          .order('dna_score', { ascending: false })
          .limit(8),
        fetchPennyScanStatus(),
        fetchBrokerPositions().catch(() => []),
        fetchClosedTrades(1000).catch(() => []),
      ]);

      const mappedPositions = mapBrokerPositions(brokerPositions);
      const mappedHistory = mapClosedTrades(alpacaClosedTrades);

      const updates: Partial<TradingState> = {
        discoveryStocks: ((discoveryResult.data || []) as DiscoveryStock[]).filter(
          (s) => s.dna_score != null && s.price != null,
        ),
        livePositions: mappedPositions,
        liveHistory: mappedHistory,
        lastFetchedTime: new Date().toISOString().substring(11, 19),
        loading: false,
      };

      if (scanStatus) updates.pennyScanStatus = scanStatus;
      if (alpaca && !('error' in alpaca && alpaca.error)) {
        updates.alpacaAccount = alpaca as unknown as AlpacaAccount;
      }

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
      set({ loading: false });
    }
  },
}));
