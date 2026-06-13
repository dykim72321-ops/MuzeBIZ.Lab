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

export const usePulseSocket = (url: string = 'ws://127.0.0.1:8000/ws/pulse') => {
  // 최신 수신된 단일 결과 (기존 컴포넌트 호환용)
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  // 전체 종목별 최신 상태 맵 (Live Dashboard용)
  // 전체 종목별 최신 상태 맵 (Live Dashboard용)
  const [pulseMap, setPulseMap] = useState<Record<string, PulseData>>({});
  // 실시간 시그널 상태 전환 감지용 Ref (onmessage 클로저 stale 상태 및 중복 알림 방지)
  const pulseMapRef = useRef<Record<string, PulseData>>({});
  // Live Flash: 마지막으로 업데이트된 티커 (2초 후 자동 초기화)
  const [lastUpdatedTicker, setLastUpdatedTicker] = useState<string | null>(null);
  
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  
  // 상태 변경 없이 WebSocket 인스턴스를 유지하기 위해 useRef 사용
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('✅ WebSocket Connected to Pulse Engine:', url);
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: PulseData = JSON.parse(event.data);
          
          // 1. 단일 최신 데이터 업데이트
          setPulseData(data);
          
          // 2. 이전 데이터 추출 및 Ref 업데이트
          const prevData = pulseMapRef.current[data.ticker];
          pulseMapRef.current[data.ticker] = data;
          
          // 3. 종목 맵 업데이트
          setPulseMap((prev) => ({
            ...prev,
            [data.ticker]: data
          }));

          // 4. Live Flash: 방금 수신된 티커 설정 → 2초 후 자동 초기화
          setLastUpdatedTicker(data.ticker);
          setTimeout(() => setLastUpdatedTicker(null), 2000);
          
          console.log(`💓 Pulse received for ${data.ticker}:`, data);

          // 시그널 상태가 실제로 변했는지 감지 (이전 데이터가 없거나, 시그널 종류 혹은 강도가 달라진 경우만)
          const isTransition = !prevData || 
            prevData.signal !== data.signal || 
            prevData.strength !== data.strength;

          // 강한 시그널로의 새로운 상태 전환일 때만 전역 알림(Toast) 발생 (중복 알림 도배 방지)
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

      ws.onerror = (event) => {
        console.error('❌ WebSocket Error:', event);
        setError('WebSocket error occurred');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.warn('⚠️ WebSocket Disconnected');
        setIsConnected(false);
        // 연결이 끊어지면 자동 재연결 시도
        setTimeout(connect, 3000); 
      };

      socketRef.current = ws;
    } catch (e: any) {
      setError(e.message || 'Failed to initialize WebSocket');
    }
  }, [url]);

  useEffect(() => {
    connect();

    // 컴포넌트 마운트 해제 시 소켓 연결 안전하게 종료
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  // 수동으로 재연결할 수 있는 매서드 제공
  const reconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
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
