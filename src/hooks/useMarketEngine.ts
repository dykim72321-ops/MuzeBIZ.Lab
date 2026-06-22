import { useState, useEffect } from 'react';
import { usePulseSocket } from './usePulseSocket';
import { triggerHunt, apiFetch } from '../services/pythonApiService';

/**
 * useMarketEngine
 * 퀀트 엔진의 실시간 상태와 제어를 담당하는 통합 훅
 */
export const useMarketEngine = () => {
  // 로컬 dev에서는 Vite 프록시(/py-api)를 사용해 localhost:8001로 라우팅
  // 프로덕션(HTTPS)에서만 VITE_WS_BASE_URL(Railway 등) 사용
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBase = import.meta.env.DEV
    ? `${wsProto}//${window.location.host}/py-api`
    : (import.meta.env.VITE_WS_BASE_URL ?? `${wsProto}//${window.location.host}/py-api`);
  const pulseUrl = `${wsBase}/ws/pulse`;
  const { pulseMap, isConnected, lastUpdatedTicker, error, seedMap } = usePulseSocket(pulseUrl);

  // 1.1 초기 히스토리 데이터 획득 및 시딩
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await apiFetch('/api/pulse/history');
        if (Array.isArray(history)) {
          seedMap(history);
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

  const handleTriggerHunt = async () => {
    setIsHunting(true);
    setHuntStatus(null);
    try {
      const result = await triggerHunt();
      if (result.success) {
        setHuntStatus('success');
      } else {
        throw new Error(result.message);
      }
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
    triggerHunt: handleTriggerHunt,
    error
  };
};
