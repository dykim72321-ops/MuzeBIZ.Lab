import React, { useState, useEffect } from 'react';
import { Settings, Bell, Database, Save, RefreshCw, Shield, ShieldOff, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { toggleSystemArm } from '../../services/pythonApiService';

export const CommandSettings: React.FC = () => {
  const [dnaThreshold, setDnaThreshold] = useState<number>(85);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const [isArmed, setIsArmed] = useState<boolean>(false);
  const [isTogglingArm, setIsTogglingArm] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (data) {
        if (data.alert_threshold) setDnaThreshold(data.alert_threshold);
        if (data.webhook_url) setWebhookUrl(data.webhook_url);
        if (data.is_armed !== undefined) setIsArmed(!!data.is_armed);
      }
    };
    fetchSettings();
  }, []);

  const handleToggleArm = async () => {
    const next = !isArmed;
    setIsTogglingArm(true);
    try {
      await toggleSystemArm(next);
      setIsArmed(next);
      if (next) {
        toast.success('🔴 SYSTEM ARMED', {
          description: '자동 매수/매도가 활성화됩니다. DNA≥80 STRONG BUY 시 자동 진입합니다.',
        });
      } else {
        toast('🟣 SYSTEM DISARMED', {
          description: '안전 모드 전환. 스캐닝은 계속되지만 매매는 실행되지 않습니다.',
        });
      }
    } catch (err: any) {
      toast.error('ARM 전환 실패', {
        description: err.message || '백엔드 연결을 확인하세요.',
      });
    } finally {
      setIsTogglingArm(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          alert_threshold: dnaThreshold,
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;

      toast.success('Matrix Config Saved', {
        description: 'System thresholds globally updated.',
      });
    } catch (error) {
      console.error('Settings save error:', error);
      toast.error('Save Failed', {
        description: error instanceof Error ? error.message : 'Check database connectivity.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    toast('💣 Cache Flush Confirmation', {
      description: '정말 백테스트 캐시를 모두 초기화하시겠습니까? 다음 호출 시 연산 부하가 발생할 수 있습니다.',
      action: {
        label: '캐시 초기화',
        onClick: async () => {
          setIsClearing(true);
          const toastId = toast.loading('Purging backtest memory tables...');
          try {
            const { error } = await supabase
              .from('backtest_cache')
              .delete()
              .neq('ticker', 'dummy');

            if (error) throw error;
            toast.success('Cache Flushed', {
              description: 'All backtest data has been cleared.',
              id: toastId,
            });
          } catch (error) {
            console.error('Cache clear error:', error);
            toast.error('Flush Error', {
              description: 'Could not purge memory tables.',
              id: toastId,
            });
          } finally {
            setIsClearing(false);
          }
        },
      },
      cancel: {
        label: '취소',
        onClick: () => {},
      },
    });
  };

  return (
    <div className="w-full bg-white/60 backdrop-blur-xl rounded-2xl border border-white/20 shadow-xl overflow-hidden mt-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header */}
      <div className="bg-white/40 px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
          <Settings className="w-4 h-4 text-slate-500" />
          System Control Panel
        </h3>
        {/* ARMED 상태 뱃지 */}
        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border transition-colors ${
          isArmed
            ? 'bg-rose-50 text-rose-600 border-rose-200'
            : 'bg-slate-100 text-slate-400 border-slate-200'
        }`}>
          {isArmed
            ? <ShieldCheck className="w-3 h-3" />
            : <ShieldOff className="w-3 h-3" />
          }
          {isArmed ? 'ARMED' : 'DISARMED'}
        </span>
      </div>

      <div className="p-6 space-y-8">

        {/* 0. SYSTEM_ARMED 토글 — 최상단 배치 */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Shield className="w-4 h-4" /> Autonomous Trading Control
          </h4>

          <div className="pl-6 border-l-2 border-slate-100">
            <div className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${
              isArmed
                ? 'bg-rose-50 border-rose-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <p className={`text-sm font-black ${isArmed ? 'text-rose-700' : 'text-slate-700'}`}>
                  {isArmed ? '🔴 COMBAT MODE — 자동 매매 활성' : '🟣 SAFE MODE — 관제 전용'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-sm">
                  {isArmed
                    ? 'DNA≥80 STRONG BUY 시 자동 진입 · RSI>60 Scale-Out · Trailing Stop 자동 청산'
                    : '스캐닝 및 시그널 수신은 계속되지만 실제 주문은 실행되지 않습니다.'
                  }
                </p>
              </div>
              <button
                onClick={handleToggleArm}
                disabled={isTogglingArm}
                className={`relative flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${
                  isArmed
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                    : 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200'
                }`}
              >
                {isTogglingArm ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isArmed ? (
                  <ShieldOff className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {isTogglingArm ? 'Processing...' : isArmed ? 'DISARM' : 'ARM SYSTEM'}
              </button>
            </div>
          </div>
        </div>

        {/* 1. 알림 시스템 설정 */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Bell className="w-4 h-4" /> Alert & Webhook Setup
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-6 border-l-2 border-slate-100">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider">DNA Score Threshold (Target)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50" max="100"
                  value={dnaThreshold}
                  onChange={(e) => setDnaThreshold(Number(e.target.value))}
                  className="flex-1 accent-[#0176d3]"
                />
                <span className={`text-lg font-black w-12 text-right ${dnaThreshold >= 85 ? 'text-rose-600' : 'text-[#0176d3]'}`}>
                  {dnaThreshold}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">이 점수 이상을 획득한 종목만 Webhook으로 알림을 전송합니다.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Discord Webhook URL</label>
              <input
                type="password"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0176d3]/20 focus:border-[#0176d3] transition-all"
              />
            </div>
          </div>
        </div>

        {/* 2. 시스템 유지보수 (Cache Control) */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Database className="w-4 h-4" /> System Maintenance
          </h4>

          <div className="pl-6 border-l-2 border-slate-100 flex items-center justify-between bg-slate-50 p-4 rounded-lg">
            <div>
              <p className="text-sm font-bold text-slate-700">Backtest Matrix Cache</p>
              <p className="text-[10px] text-slate-500 mt-1">알고리즘 v4 업데이트 후 즉각적인 재연산이 필요할 때 캐시를 초기화합니다.</p>
            </div>
            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isClearing ? 'animate-spin' : ''}`} />
              {isClearing ? 'FLUSHING...' : 'FLUSH CACHE'}
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#0176d3] text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-[#015ba3] transition-colors disabled:opacity-50 shadow-sm shadow-[#0176d3]/30"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Matrix...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
