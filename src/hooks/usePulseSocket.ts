import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

// 백엔드 Pulse Engine에서 방출하는 데이터의 인터페이스
export interface PulseData {
  ticker: string;
  rsi: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_diff: number | null;
  volatility_ann: number | null;
  vol_weight: number | null;
  kelly_f: number | null;
  recommended_weight: number | null;
  price: number | null;
  signal: 'BUY' | 'SELL' | 'HOLD';
  strength: 'STRONG' | 'NORMAL';
  quant_report: string;
  quant_metadata?: {
    dna_score: number;
    bull_case: string;
    bear_case: string;
    reasoning_ko: string;
    tags: string[];
  } | null;
  timestamp: string;
}

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 3000;
const MAX_DELAY_MS = 60000;

export const usePulseSocket = (url: string = 'ws://127.0.0.1:8000/ws/pulse') => {
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [pulseMap, setPulseMap] = useState<Record<string, PulseData>>({});
  const pulseMapRef = useRef<Record<string, PulseData>>({});
  const [lastUpdatedTicker, setLastUpdatedTicker] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    try {
      const state = socketRef.current?.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!isMountedRef.current) { ws.close(); return; }
        console.log('✅ WebSocket Connected to Pulse Engine:', url);
        retryCountRef.current = 0;
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: PulseData = JSON.parse(event.data);

          setPulseData(data);

          const prevData = pulseMapRef.current[data.ticker];
          pulseMapRef.current[data.ticker] = data;

          setPulseMap((prev) => ({ ...prev, [data.ticker]: data }));

          setLastUpdatedTicker(data.ticker);
          setTimeout(() => setLastUpdatedTicker(null), 2000);

          console.log(`💓 Pulse received for ${data.ticker}:`, data);

          const isTransition = !prevData ||
            prevData.signal !== data.signal ||
            prevData.strength !== data.strength;

          if (isTransition && data.strength === 'STRONG') {
            if (data.signal === 'BUY') {
              toast.success(`🚀 [STRONG BUY] ${data.ticker} 포착!`, {
                description: `RSI: ${data.rsi} | MACD 확인 완료`,
                duration: 5000,
              });
            } else if (data.signal === 'SELL') {
              toast.error(`⚠️ [STRONG SELL] ${data.ticker} 주의!`, {
                description: `RSI: ${data.rsi} | MACD 하락세`,
                duration: 5000,
              });
            }
          }
        } catch (e) {
          console.error('❌ Failed to parse pulse message:', e);
        }
      };

      ws.onerror = () => {
        // onerror 직후 onclose가 항상 호출되므로 여기선 상태만 기록
        setIsConnected(false);
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);

        if (retryCountRef.current >= MAX_RETRIES) {
          const ts = new Date().toLocaleTimeString('ko-KR');
          const msg = `Pulse WS 재연결 실패 (${MAX_RETRIES}회 시도) — 백엔드 엔진 상태를 확인하세요`;
          console.warn(`⚠️ ${msg} @ ${ts}`);
          setError(msg);
          return;
        }

        // 지수 백오프: 3s → 6s → 12s → ... (최대 60s)
        const delay = Math.min(BASE_DELAY_MS * 2 ** retryCountRef.current, MAX_DELAY_MS);
        retryCountRef.current += 1;
        console.warn(`⚠️ Pulse WS disconnected — retry #${retryCountRef.current} in ${delay / 1000}s`);

        retryTimerRef.current = setTimeout(() => connectRef.current(), delay);
      };

      socketRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize WebSocket');
    }
  }, [url]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    // connect()는 WebSocket을 열고 콜백을 등록할 뿐, 이 호출 프레임에서 동기적으로
    // setState를 실행하지 않는다 (상태 변경은 모두 비동기 ws.onopen/onclose 콜백에서 발생).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();

    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connect]);

  // 수동 재연결 — 재시도 카운터 초기화 후 즉시 연결
  const reconnect = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (socketRef.current) socketRef.current.close();
    retryCountRef.current = 0;
    setError(null);
    connect();
  };

  // 초기 데이터(히스토리)로 맵을 채우는 기능
  const seedMap = useCallback((data: PulseData[]) => {
    setPulseMap((prev) => {
      const newMap = { ...prev };
      data.forEach((item) => {
        // 기존 실시간 데이터가 더 최신일 수 있으므로 우선순위 확인 (생략 가능하면 단순 병합)
        if (!newMap[item.ticker]) {
          newMap[item.ticker] = item;
          pulseMapRef.current[item.ticker] = item;
        }
      });
      return newMap;
    });
  }, []);

  return { pulseData, pulseMap, isConnected, error, reconnect, lastUpdatedTicker, seedMap };
};
