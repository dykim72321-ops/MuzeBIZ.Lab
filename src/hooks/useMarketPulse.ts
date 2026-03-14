
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Sonner Toast 사용 시 (프로젝트에 sonner가 설치되어 있다면)
import { toast } from 'sonner'; 

export interface MarketSignal {
  ticker: string;
  indicator: string;
  value: number;
  price: number;
  signal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL';
  timestamp: string;
}

export const useMarketPulse = () => {
  const [lastSignal, setLastSignal] = useState<MarketSignal | null>(null);

  useEffect(() => {
    let active = true;
    
    // 'realtime_signals' 테이블의 INSERT 이벤트를 구독
    const channel = supabase
      .channel('market-pulse')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'realtime_signals' },
        (payload) => {
          if (!active) return;
          const signal = payload.new as MarketSignal;
          setLastSignal(signal);
          console.log("💓 Pulse Received:", signal);

          // RSI 신호에 따른 알림 발송
          if (signal.signal === 'OVERSOLD') {
             toast.error(`🚨 ${signal.ticker} 과매도! (RSI: ${signal.value})`);
          } else if (signal.signal === 'OVERBOUGHT') {
             toast.success(`📈 ${signal.ticker} 과매수! (RSI: ${signal.value})`);
          }
        }
      );

    const subscribe = (attempt = 0) => {
      if (!active) return;
      
      channel.subscribe((status, err) => {
        if (!active) return;
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Supabase Realtime connected');
        }
        
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Supabase Realtime connection error:', err);
          console.warn("💡 Tip: Supabase 대시보드에서 'realtime_signals' 테이블의 Realtime 기능이 켜져 있는지 확인하세요.");
        }
        
        if (status === 'TIMED_OUT') {
          console.warn(`⚠️ Supabase Realtime connection timed out (Attempt ${attempt + 1}). Retrying in 5s...`);
          if (attempt < 5) {
            setTimeout(() => subscribe(attempt + 1), 5000);
          }
        }
      });
    };

    subscribe();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel).then(() => {
           console.log("🔌 Supabase Realtime channel removed safely.");
        }).catch(err => {
           // 연결 도중 종료 시 발생하는 에러 무시 (closed before established)
           if (!err.message?.includes('closed before the connection is established')) {
             console.warn("Channel removal warning:", err);
           }
        });
      }
    };
  }, []);

  return lastSignal;
};
