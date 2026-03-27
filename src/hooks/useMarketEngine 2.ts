import { useState, useEffect } from 'react';
import { usePulseSocket } from './usePulseSocket';

/**
 * useMarketEngine
 * 퀀트 엔진의 실시간 상태와 제어를 담당하는 통합 훅
 * - WebSocket 연결 상태 관리
 * - 실시간 펄스 데이터 수신
 * - 하이브리드 헌팅 트리거 실행
 */
export const useMarketEngine = () => {
  // 1. WebSocket을 통한 v4 펄스 엔진 실시간 데이터 수신
  // PulseDashboard와 Dashboard에서 공통으로 사용하는 엔드포인트 적용
  const pulseUrl = `ws://${window.location.host}/py-api/ws/pulse`;
  const { pulseMap, isConnected, lastUpdatedTicker, error, seedMap } = usePulseSocket(pulseUrl);

  // 1.1 초기 히스토리 데이터 획득 및 시딩
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/py-api/api/pulse/history');
        if (response.ok) {
          const history = await response.json();
          if (Array.isArray(history)) {
            seedMap(history);
          }
        }
      } catch (err) {
        console.error('Failed to fetch pulse history:', err);
      }
    };
    fetchHistory();
  }, [seedMap]);

  // 2. 하이브리드 수동 탐색(Hunting) 상태 관리
  const [isHunting, setIsHunting] = useState(false);
  const [huntStatus, setHuntStatus] = useState<'success' | 'error' | null>(null);

  const triggerHunt = async () => {
    setIsHunting(true);
    setHuntStatus(null);
    try {
      const adminKey = import.meta.env.VITE_ADMIN_SECRET_KEY || "muze_secret_key_2024";
      const response = await fetch('/py-api/api/hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      });
      if (!response.ok) throw new Error("API Error");
      setHuntStatus('success');
      setTimeout(() => setHuntStatus(null), 3000);
    } catch (error) {
      console.error("Hunting Error:", error);
      setHuntStatus('error');
      setTimeout(() => setHuntStatus(null), 3000);
    } finally {
      setIsHunting(false);
    }
  };

  return {
    pulseMap,
    isConnected,
    lastUpdatedTicker,
    isHunting,
    huntStatus,
    triggerHunt,
    error
  };
};
