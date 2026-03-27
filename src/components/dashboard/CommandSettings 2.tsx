import React, { useState, useEffect } from 'react';
import { Settings, Bell, Database, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

export const CommandSettings: React.FC = () => {
  const [dnaThreshold, setDnaThreshold] = useState<number>(85);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  // 컴포넌트 마운트 시 DB에서 기존 설정값 불러오기
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('*')
        .single();
      
      if (data) {
        if (data.alert_threshold) setDnaThreshold(data.alert_threshold);
        if (data.webhook_url) setWebhookUrl(data.webhook_url);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // [Fix] RLS 정책 우회를 위해 백엔드 프록시 API 호출
      const result = await (window as any).apiFetch('/api/system/settings', 'PUT', { 
        alert_threshold: dnaThreshold, 
        webhook_url: webhookUrl 
      });

      if (result.error) throw new Error(result.error);
      
      toast.success('Matrix Config Saved', {
        description: 'System thresholds globally updated via Secure Proxy.',
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
              id: toastId
            });
          } catch (error) {
            console.error('Cache clear error:', error);
            toast.error('Flush Error', {
              description: 'Could not purge memory tables.',
              id: toastId
            });
          } finally {
            setIsClearing(false);
          }
        }
      },
      cancel: {
        label: '취소',
        onClick: () => {}
      }
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
      </div>

      <div className="p-6 space-y-8">
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
