import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { Trophy } from 'lucide-react';

interface PersonaStats {
  persona_name: string;
  total_predictions: number;
  correct_predictions: number;
  win_rate: number;
}

const PERSONA_COLORS: Record<string, string> = {
  'Growth Hunter': '#10b981',
  'Risk Manager': '#ef4444',
  'Chart Analyst': '#3b82f6',
  'Value Hunter': '#f59e0b',
};

export const PersonaPerformance = () => {
  const [personas, setPersonas] = useState<PersonaStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
          .from('persona_performance')
          .select('*')
          .order('win_rate', { ascending: false });

        if (dbError) throw dbError;
        setPersonas(data || []);
      } catch (err: any) {
        console.error('Failed to fetch persona performance:', err);
        setError(err?.message ?? 'Failed to load persona data');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  if (loading) {
    return (
      <Card className="p-5 h-full">
        <Skeleton className="h-6 w-1/3 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5 h-full flex flex-col items-center justify-center gap-3">
        <Trophy className="w-8 h-8 text-blue-600" />
        <p className="text-sm font-bold text-blue-400">페르소나 데이터를 불러올 수 없습니다</p>
        <p className="text-xs text-blue-600 font-mono">{error}</p>
      </Card>
    );
  }

  const topPersona = personas[0];

  return (
    <Card className="p-5 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500 fill-amber-500/20" />
          <h2 className="text-lg font-bold text-white tracking-tight">AI Persona Performance</h2>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {/* Top Persona Small Card */}
        {topPersona && (
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
               <Trophy className="w-12 h-12 text-amber-500" />
            </div>
            <div className="relative z-10">
              <div className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest mb-1">Top Performer</div>
              <div className="text-sm font-bold text-white mb-2">{topPersona.persona_name}</div>
              <div className="flex items-center gap-3">
                 <div>
                   <div className="text-[10px] text-blue-500 uppercase font-mono">Win Rate</div>
                   <div className="text-sm font-bold text-emerald-400 font-mono">{topPersona.win_rate.toFixed(1)}%</div>
                 </div>
                 <div className="w-px h-6 bg-white/10" />
                 <div>
                   <div className="text-[10px] text-blue-500 uppercase font-mono">Predictions</div>
                   <div className="text-sm font-bold text-white font-mono">{topPersona.total_predictions}</div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Small Horizontal Chart for Win Rates */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Win Rate Comparison</h3>
          <div className="space-y-4">
            {personas.slice(0, 4).map((persona) => (
              <div key={persona.persona_name} className="space-y-1.5">
                <div className="flex justify-between items-end text-[11px]">
                  <span className="text-blue-300 font-medium">{persona.persona_name}</span>
                  <span className="text-white font-bold font-mono">{persona.win_rate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full bg-blue-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ 
                      width: `${persona.win_rate}%`,
                      backgroundColor: PERSONA_COLORS[persona.persona_name] || '#8b5cf6',
                      boxShadow: `0 0 8px ${PERSONA_COLORS[persona.persona_name] || '#8b5cf6'}66`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
