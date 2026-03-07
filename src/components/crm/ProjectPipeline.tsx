import { useState, useEffect } from 'react';
import { 
  Plus, 
  ChevronRight,
  Target
} from 'lucide-react';
import { getCrmProjects, updateCrmProject } from '../../services/crmService';
import type { ProjectStage } from '../../types/crm';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const STAGES: { id: ProjectStage; label: string; color: string; border: string; text: string }[] = [
  { id: 'NEEDS', label: '니즈파악', color: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-600' },
  { id: 'SAMPLE', label: '샘플제안', color: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' },
  { id: 'TEST', label: '테스트/검증', color: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700' },
  { id: 'NEGOTIATION', label: '단가협의', color: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' },
  { id: 'WIN', label: '수주완료', color: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700' },
  { id: 'DROP', label: '실패', color: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-700' },
];

export const ProjectPipeline = () => {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await getCrmProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const handleStageChange = async (projectId: string, newStage: ProjectStage) => {
    try {
      await updateCrmProject(projectId, { stage: newStage });
      fetchProjects();
    } catch (error) {
      console.error('Failed to update stage:', error);
    }
  };

  const getProjectsByStage = (stageId: ProjectStage) => {
    return projects.filter(p => p.stage === stageId);
  };

  return (
    <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar px-2">
      {STAGES.map((stage) => (
        <div 
          key={stage.id}
          className="flex-shrink-0 w-80 flex flex-col gap-5"
        >
          {/* Column Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-white rounded-t-xl border-x border-t border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className={clsx("w-2 h-2 rounded-full shadow-sm", stage.text.replace('text-', 'bg-'))}></span>
              {stage.label}
              <span className="ml-1 opacity-40 font-black tabular-nums">({getProjectsByStage(stage.id).length})</span>
            </h3>
            <button className="p-1.5 hover:bg-slate-50 rounded-md transition-colors text-slate-400 hover:text-[#0176d3]">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kanban Cards Container */}
          <div className={clsx(
            "flex-1 p-4 rounded-b-xl border-x border-b border-slate-200 min-h-[600px] space-y-4 shadow-inner",
            stage.color
          )}>
            {getProjectsByStage(stage.id).map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group relative p-5 rounded-xl bg-white border border-slate-200 hover:border-[#0176d3]/40 shadow-sm hover:shadow-xl cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-sm font-black text-slate-900 line-clamp-2 leading-tight group-hover:text-[#0176d3] transition-colors">
                    {project.title}
                  </h4>
                </div>
                
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-[#0176d3]" />
                    {project.crm_companies?.name || '미지정 기업'}
                  </p>
                  
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-50">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Expected Val</span>
                      <span className="text-sm font-black text-slate-800 tabular-nums">
                        ${(project.expected_value / 1000).toFixed(1)}K
                      </span>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentIdx = STAGES.findIndex(s => s.id === stage.id);
                        if (currentIdx < STAGES.length - 1) {
                          handleStageChange(project.id, STAGES[currentIdx + 1].id);
                        }
                      }}
                      className="p-2.5 rounded-lg bg-slate-50 hover:bg-[#0176d3] text-slate-400 hover:text-white transition-all active:scale-90 border border-slate-100 shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            
            {getProjectsByStage(stage.id).length === 0 && (
              <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200/50 rounded-2xl opacity-40 bg-white/50">
                <Plus className="w-5 h-5 text-slate-300 mb-2" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add Opportunity</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
