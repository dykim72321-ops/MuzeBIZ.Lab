import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  ChevronRight,
  ClipboardList,
  Cpu,
  Zap,
  ShieldCheck,
  Bell,
  KanbanSquare,
  TrendingUp,
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getCrmCompanies, 
  getCrmProjects, 
  getCallPlans, 
  getProjectTimeline, 
  getCrmContacts,
  deleteCrmCompany,
  deleteCrmProject,
  deleteCrmContact,
  deleteCallPlan
} from '../services/crmService';
import { format, isValid } from 'date-fns';
import clsx from 'clsx';
import { SmartCallPlan } from '../components/crm/SmartCallPlan';
import { OrgProfile } from '../components/crm/OrgProfile';
import { Building2, List as ListIcon, ChevronLeft } from 'lucide-react';

const safeFormatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'UNKNOWN DATE';
  try {
    const d = new Date(dateStr);
    if (!isValid(d)) return 'INVALID DATE';
    return format(d, 'yyyy. MM. dd');
  } catch {
    return 'INVALID DATE';
  }
};

export function CrmDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeCallStep, setActiveCallStep] = useState('during');
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [callPlans, setCallPlans] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Hierarchical view state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectTimeline, setProjectTimeline] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  
  // Modal state
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const companyData = await getCrmCompanies();
        setCompanies(companyData || []);
      } catch (error) {
        console.error('Failed to load companies:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, []);

  const refreshData = async () => {
    if (!selectedCompanyId) {
      const companyData = await getCrmCompanies();
      setCompanies(companyData || []);
      return;
    }

    const [projData, callData, contactData] = await Promise.all([
      getCrmProjects(),
      getCallPlans(selectedCompanyId),
      getCrmContacts(selectedCompanyId)
    ]);

    const filteredProjs = projData.filter((p: any) => p.company_id === selectedCompanyId);
    setProjects(filteredProjs || []);
    setCallPlans(callData || []);
    setContacts(contactData || []);
    
    // Refresh timeline if a project is selected
    if (selectedProjectId) {
      const timeline = await getProjectTimeline(selectedProjectId);
      setProjectTimeline(timeline);
    }
  };

  // Use a separate effect to load company-specific data when selected
  useEffect(() => {
    if (!selectedCompanyId) {
      setProjects([]);
      setCallPlans([]);
      setContacts([]);
      return;
    }
    refreshData();
    setActiveTab('dashboard'); // Default to dashboard when company is switched
    setSelectedProjectId(null); // Reset project view
  }, [selectedCompanyId]);

  const handleCompanyClick = (companyId: string) => {
    setSelectedCompanyId(companyId);
  };

  const handleProjectClick = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setTimelineLoading(true);
    try {
      const timeline = await getProjectTimeline(projectId);
      setProjectTimeline(timeline);
    } catch (error) {
      console.error('Failed to load project timeline:', error);
    } finally {
      setTimelineLoading(false);
    }
  };

  const openModal = (type: string, data: any = null) => {
    setModalType(type);
    setModalData(data);
  };

  const closeModal = () => {
    setModalType(null);
    setModalData(null);
  };

  const handleDelete = async (type: 'company' | 'project' | 'contact' | 'call', id: string, name: string) => {
    if (!window.confirm(`'${name}'을(를) 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.`)) return;
    
    try {
      const deleteFn = {
        company: deleteCrmCompany,
        project: deleteCrmProject,
        contact: deleteCrmContact,
        call: deleteCallPlan
      }[type];
      
      await deleteFn(id);
      
      if (type === 'company' && id === selectedCompanyId) {
        setSelectedCompanyId(null);
      } else if (type === 'project' && id === selectedProjectId) {
        setSelectedProjectId(null);
      }
      
      await refreshData();
    } catch (err: any) {
      console.error('Delete error:', err);
      alert(`삭제 실패: ${err.message || 'Unknown error'}`);
    }
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  const totalExpectedValue = projects.reduce((acc, p) => acc + (Number(p?.expected_value) || 0), 0);

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="text-slate-500 text-sm font-semibold">CRM 데이터를 분석하는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] bg-slate-50 text-slate-900 font-sans overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      {/* 1. Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <div className="bg-[#0176d3] p-1.5 rounded-lg shadow-lg shadow-blue-100">
            <Zap size={20} className="text-white" fill="currentColor" />
          </div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">
            Sales<span className="text-[#0176d3]">.Hub</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {!selectedCompanyId ? (
            <>
              <div className="px-4 mb-4">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search accounts..." 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 pl-9 pr-4 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0176d3]/20"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2">Company Directory</p>
              {filteredCompanies.map(company => (
                <div 
                  key={company.id}
                  onClick={() => handleCompanyClick(company.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all text-slate-500 hover:bg-slate-50 hover:text-slate-800 group cursor-pointer"
                >
                  <div className="flex items-center gap-1">
                    <Building2 size={18} className="text-slate-400 group-hover:text-[#0176d3]" />
                    <span className="truncate max-w-[100px]">{company.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete('company', company.id, company.name); }}
                      className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-rose-50"
                    >
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300" />
                  </div>
                </div>
              ))}
              <button 
                onClick={() => openModal('company')}
                className="w-full mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-[#0176d3] bg-blue-50/50 border border-dashed border-blue-200 hover:bg-blue-50 transition-all group"
              >
                <Plus size={18} /> Add New Company
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setSelectedCompanyId(null)}
                className="w-full flex items-center gap-3 px-4 py-2 mb-4 rounded-xl text-xs font-black text-[#0176d3] hover:bg-blue-50 transition-all border border-blue-100"
              >
                <ChevronLeft size={16} /> Back to Companies
              </button>
              
              <div className="px-4 py-2 mb-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Active Account</p>
                <p className="text-sm font-black text-slate-800 truncate">{selectedCompany?.name}</p>
              </div>

              <NavItem icon={<LayoutDashboard size={18}/>} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSelectedProjectId(null); }} />
              <NavItem icon={<ClipboardList size={18}/>} label="Smart Call Plan" active={activeTab === 'call-plan'} onClick={() => setActiveTab('call-plan')} />
              <NavItem icon={<Users size={18}/>} label="Organization" active={activeTab === 'org'} onClick={() => setActiveTab('org')} />
              <NavItem icon={<FileText size={18}/>} label="Minutes" active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} />
            </>
          )}
        </nav>

      </aside>

      {/* 2. Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Header - Unified with Scanner/Search Hub Style */}
        <header className="mx-8 mt-8 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            {selectedCompanyId ? (
              <div className="flex items-center gap-4">
                {selectedProjectId ? (
                  <>
                    <button 
                      onClick={() => setSelectedProjectId(null)}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-[#0176d3] hover:border-[#0176d3] transition-all"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Project Intelligence</p>
                      <h2 className="text-2xl font-black text-slate-900 leading-tight">
                        {projectTimeline?.project?.title || 'Loading...'}
                      </h2>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#0176d3] rounded-lg shadow-md">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                        {selectedCompany?.name || 'Company Profile'}
                      </p>
                      <h2 className="text-2xl font-black text-slate-900 leading-tight">
                        {activeTab === 'dashboard' ? "Enterprise Account View" : 
                         activeTab === 'call-plan' ? "Strategic Discovery" : 
                         activeTab === 'org' ? "Organization View" : "Document Review"}
                      </h2>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-100 rounded-lg text-slate-400">
                  <ListIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Portfolio Overview</p>
                  <h2 className="text-2xl font-black text-slate-900 leading-tight">Account Selection</h2>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-5">
            <div className="relative group cursor-pointer">
              <Bell className="text-slate-400 group-hover:text-[#0176d3] transition-colors" size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-bold shadow-sm">3</span>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="flex items-center gap-3 bg-slate-50 pl-4 pr-2 py-1.5 rounded-xl border border-slate-100">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Admin Control</span>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0176d3] to-blue-400 flex items-center justify-center text-white font-black text-xs shadow-md">OP</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <AnimatePresence mode="wait">
              {!selectedCompanyId && (
                <motion.div
                  key="company-selection"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-4"
                >
                  {companies.map(company => (
                    <div 
                      key={company.id}
                      onClick={() => handleCompanyClick(company.id)}
                      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-[#0176d3]/20 transition-all text-left group flex flex-col items-start gap-4 relative overflow-hidden cursor-pointer"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:scale-110" />
                      <div className="p-3 bg-blue-50 text-[#0176d3] rounded-xl self-start group-hover:bg-[#0176d3] group-hover:text-white transition-colors relative">
                        <Building2 size={24} />
                      </div>
                      <div className="relative w-full">
                        <h3 className="text-lg font-black text-slate-800 mb-1 group-hover:text-[#0176d3] transition-colors">{company.name}</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Enter Account Dashboard</p>
                      </div>
                      <div className="mt-4 w-full flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[#0176d3] text-xs font-black opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all">
                          SELECT ACCOUNT <ChevronRight size={14} />
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete('company', company.id, company.name); }}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {selectedCompanyId && activeTab === 'dashboard' && !selectedProjectId && (
                <motion.div 
                  key="dashboard-main"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  {/* Stats Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="활성 프로젝트" value={projects.length} icon={KanbanSquare} color="indigo" />
                    <StatCard label="이번 달 미팅" value={callPlans.length} icon={Calendar} color="rose" />
                    <StatCard label="성공 사례" value="0" icon={CheckCircle2} color="emerald" />
                    <StatCard label="수주 예상 총액" value={`$${(totalExpectedValue / 1000).toFixed(1)}K`} icon={TrendingUp} color="blue" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Pipeline */}
                    <div className="lg:col-span-2 space-y-6">
                      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                         <TrendingUp size={18} className="text-indigo-600" /> Opportunity Pipeline
                          </h3>
                          <button 
                            onClick={() => openModal('project', { company_id: selectedCompanyId })}
                            className="text-xs font-bold text-[#0176d3] bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-[#0176d3] hover:text-white transition-all"
                          >
                            <Plus size={14} /> New Opp
                          </button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {projects.length > 0 ? projects.map(project => (
                              <div 
                                key={project.id} 
                                onClick={() => handleProjectClick(project.id)}
                                className="p-5 hover:bg-slate-50/50 transition-all flex items-center justify-between group cursor-pointer border-l-4 border-l-transparent hover:border-l-[#0176d3]"
                              >
                                <div>
                                  <h4 className="font-bold text-slate-800 group-hover:text-[#0176d3]">{project.title}</h4>
                                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 font-medium">
                                    <span>{project.crm_companies?.name || 'Unknown Company'}</span>
                                    <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                    <span className="font-bold text-slate-600">${((project.expected_value || 0) / 1000).toFixed(1)}K</span>
                                  </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#0176d3] border border-blue-100 uppercase">
                                    {project.stage || 'NEEDS'}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDelete('project', project.id, project.title); }}
                                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                    <ChevronRight size={16} className="text-slate-200 group-hover:text-[#0176d3] transition-colors" />
                                  </div>
                                </div>
                              </div>
                          )) : (
                            <div className="p-12 text-center text-slate-400 italic">No active opportunities found.</div>
                          )}
                        </div>
                      </section>
                    </div>

                    {/* Alerts & Actions */}
                    <div className="space-y-6">
                      <DashboardCard title="Intelligent Alerts" icon={<AlertCircle className="text-rose-500" size={18} />}>
                        <div className="space-y-4">
                          <AlertItem title="A사 부품 재고 급감" desc="센서 노드 EOL 리스크 감지됨" severity="high" />
                          <AlertItem title="B사 팔로업 필요" desc="2주간 파이프라인 정체" severity="medium" />
                        </div>
                      </DashboardCard>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'dashboard' && selectedProjectId && (
                <motion.div 
                  key="project-timeline"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {timelineLoading ? (
                    <div className="p-12 text-center text-slate-400">Loading timeline...</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left: Project Info & History */}
                      <div className="lg:col-span-2 space-y-6">
                        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                          <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                              <ClipboardList size={22} className="text-indigo-600" /> Activity History
                            </h3>
                            <button 
                              onClick={() => openModal('call', { company_id: selectedCompanyId, project_id: selectedProjectId })}
                              className="sfdc-button-primary scale-90 flex items-center gap-2"
                            >
                              <Plus size={16} /> 회의록 작성
                            </button>
                          </div>
                          
                          <div className="relative pl-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                            {projectTimeline?.history && projectTimeline.history.length > 0 ? projectTimeline.history.map((log: any, idx: number) => (
                              <div key={log.id || idx} className="mb-10 relative">
                                <div className="absolute left-[-21px] top-1.5 w-3 h-3 rounded-full bg-white border-2 border-[#0176d3] shadow-sm z-10"></div>
                                <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-blue-100 transition-all hover:shadow-md hover:shadow-blue-50/50 group">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <span className="text-[10px] font-black text-[#0176d3] uppercase tracking-widest bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                                        {safeFormatDate(log.visit_date)}
                                      </span>
                                      <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                        <Users size={14} className="text-slate-400" /> {log.crm_contacts?.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete('call', log.id, safeFormatDate(log.visit_date)); }}
                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                      <ChevronRight size={14} className="text-slate-300 group-hover:text-[#0176d3]" />
                                    </div>
                                  </div>
                                  <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                    {log.notes || '기술 미팅 및 샘플 제안 진행.'}
                                  </p>
                                </div>
                              </div>
                            )) : (
                              <div className="py-20 text-center text-slate-400 italic">기록된 미팅 활동이 없습니다.</div>
                            )}
                          </div>
                        </section>
                      </div>

                      {/* Right: Technical Context & Risk */}
                      <div className="space-y-6">
                        <DashboardCard title="Technical Specs (VOC)" icon={<Cpu className="text-slate-400" size={18} />}>
                          <div className="space-y-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1.5">Main CPU</p>
                              <p className="text-xs font-bold text-slate-800">Quad-Core 1.8GHz (i.MX8 Series)</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1.5">OS / Kernel</p>
                              <p className="text-xs font-bold text-slate-800">Linux Yocto v5.15</p>
                            </div>
                          </div>
                        </DashboardCard>

                        <DashboardCard title="Supply Chain Risk" icon={<ShieldCheck className="text-emerald-500" size={18} />}>
                          <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-center">
                            <Zap className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                            <p className="text-sm font-bold text-emerald-700">No Risk Found</p>
                            <p className="text-[10px] text-emerald-600 mt-1 uppercase font-black">Scanned: Just Now</p>
                          </div>
                        </DashboardCard>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'call-plan' && (
                <motion.div 
                  key="call-plan"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex p-1.5 bg-slate-200/50 rounded-2xl w-fit shadow-inner">
                    <StepButton label="Pre-Call (준비)" active={activeCallStep === 'pre'} onClick={() => setActiveCallStep('pre')} />
                    <StepButton label="During Meeting (현장)" active={activeCallStep === 'during'} onClick={() => setActiveCallStep('during')} />
                    <StepButton label="After Meeting (확약)" active={activeCallStep === 'after'} onClick={() => setActiveCallStep('after')} />
                  </div>

                  <SmartCallPlan activeStep={activeCallStep} />
                </motion.div>
              )}

              {activeTab === 'org' && (
                <motion.div 
                  key="org"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm text-center"
                >
                  <h3 className="text-xl font-black text-slate-800 mb-12">{selectedCompany?.name} Organization Chart</h3>
                  <div className="flex flex-col items-center gap-16">
                    {contacts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 w-full max-w-5xl">
                        {contacts.map((contact: any) => (
                          <OrgProfile 
                            key={contact.id}
                            name={contact.name} 
                            role={contact.position || 'Contact'} 
                            desc={contact.email || 'No email provided'} 
                            onDelete={() => handleDelete('contact', contact.id, contact.name)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="py-20 text-slate-400 italic">No contacts found for this account.</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* 3. CRUD Modals */}
      <AnimatePresence>
        {modalType && (
          <CrmModal 
            type={modalType} 
            data={modalData} 
            onClose={closeModal} 
            onSuccess={() => { refreshData(); closeModal(); }} 
            selectedCompanyId={selectedCompanyId}
            projects={projects}
            contacts={contacts}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Internal Sub-components ---

const CrmModal = ({ type, data, onClose, onSuccess, selectedCompanyId, projects, contacts }: any) => {
  const [formData, setFormData] = useState<any>(data || {});
  const [saving, setSaving] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (type === 'company') {
        const { createCrmCompany, updateCrmCompany } = await import('../services/crmService');
        // Ensure required fields like tech_stack are initialized
        const payload = { 
          ...formData, 
          tech_stack: formData.tech_stack || [],
          // Map business_area from form if it was set (for backward compatibility during refactor)
          industry: formData.industry || formData.business_area 
        };
        // Remove business_area before sending to DB if we're using industry
        delete payload.business_area;

        if (formData.id) await updateCrmCompany(formData.id, payload);
        else await createCrmCompany(payload);
      } else if (type === 'project') {
        const { createCrmProject, updateCrmProject } = await import('../services/crmService');
        const payload = { 
          ...formData, 
          company_id: selectedCompanyId,
          stage: formData.stage || 'NEEDS',
          expected_value: Number(formData.expected_value) || 0
        };
        if (formData.id) await updateCrmProject(formData.id, payload);
        else await createCrmProject(payload);
      } else if (type === 'contact') {
        const { createCrmContact, updateCrmContact } = await import('../services/crmService');
        const payload = { 
          ...formData, 
          company_id: selectedCompanyId,
          influence_level: formData.influence_level || 'CHAMPION'
        };
        if (formData.id) await updateCrmContact(formData.id, payload);
        else await createCrmContact(payload);
      } else if (type === 'call') {
        const { createCallPlan, updateCallPlan } = await import('../services/crmService');
        const payload = { ...formData, company_id: selectedCompanyId, visit_date: formData.visit_date || new Date().toISOString() };
        if (formData.id) await updateCallPlan(formData.id, payload);
        else await createCallPlan(payload);
      }
      onSuccess();
    } catch (err: any) {
      console.error('CRM Save Error Detail:', err);
      alert(`저장에 실패했습니다: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const title = {
    company: formData.id ? '업체 정보 수정' : '새 업체 등록',
    project: formData.id ? '기회/프로젝트 수정' : '새 영업 기회 등록',
    contact: formData.id ? '담당자 정보 수정' : '새 담당자 등록',
    call: formData.id ? '회의록/활동 수정' : '활동 및 회의록 등록'
  }[type as string] || 'CRM 관리';

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {type === 'company' && (
            <>
              <FormField label="업체명" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} required />
              <FormField label="산업 분야" value={formData.industry || ''} onChange={(v) => setFormData({...formData, industry: v})} placeholder="e.g. Automotive, Cloud, Consumer" />
            </>
          )}

          {type === 'project' && (
            <>
              <FormField label="프로젝트/기회 명칭" value={formData.title || ''} onChange={(v) => setFormData({...formData, title: v})} required />
              <div className="grid grid-cols-2 gap-4">
                <FormSelect 
                  label="영업 단계" 
                  value={formData.stage || 'NEEDS'} 
                  options={['NEEDS', 'DISCOVERY', 'PROPOSAL', 'DESIGN-IN', 'WIN', 'LOSS']} 
                  onChange={(v) => setFormData({...formData, stage: v})} 
                />
                <FormField label="예상 수주액 ($)" type="number" value={formData.expected_value || ''} onChange={(v) => setFormData({...formData, expected_value: v})} />
              </div>
            </>
          )}

          {type === 'contact' && (
            <>
              <FormField label="이름" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} required />
              <FormField label="직책/역할" value={formData.position || ''} onChange={(v) => setFormData({...formData, position: v})} />
              <FormField label="이메일" type="email" value={formData.email || ''} onChange={(v) => setFormData({...formData, email: v})} />
            </>
          )}

          {type === 'call' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormSelect 
                  label="관련 프로젝트" 
                  value={formData.project_id || ''} 
                  options={projects.map((p:any) => ({label: p.title, value: p.id}))} 
                  onChange={(v) => setFormData({...formData, project_id: v})} 
                />
                <FormSelect 
                  label="미팅 담당자" 
                  value={formData.contact_id || ''} 
                  options={contacts.map((c:any) => ({label: c.name, value: c.id}))} 
                  onChange={(v) => setFormData({...formData, contact_id: v})} 
                />
              </div>
              <FormField label="활동 일자" type="date" value={formData.visit_date ? formData.visit_date.split('T')[0] : new Date().toISOString().split('T')[0]} onChange={(v) => setFormData({...formData, visit_date: v})} />
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">활동 내용 / 회의록</label>
                <textarea 
                  rows={4} 
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0176d3]/20"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="미팅에서 논의된 핵심 사항을 기록하세요..."
                />
              </div>
            </>
          )}

          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3 rounded-xl text-sm font-black text-slate-400 hover:bg-slate-50 transition-all"
            >
              취소
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-black text-white bg-[#0176d3] shadow-lg shadow-blue-100 hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

const FormField = ({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string, value: string | number, onChange: (v: string) => void, type?: string, required?: boolean, placeholder?: string }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    <input 
      type={type}
      required={required}
      placeholder={placeholder}
      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0176d3]/20"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const FormSelect = ({ label, value, options, onChange }: { label: string, value: string, options: any[], onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    <select 
      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0176d3]/20 appearance-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">선택하세요</option>
      {options.map((opt: any) => (
        typeof opt === 'string' 
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={clsx(
      "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
      active ? 'bg-blue-50 text-[#0176d3] shadow-sm' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
    )}
  >
    {icon} {label}
  </button>
);

const StepButton = ({ label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={clsx(
      "px-6 py-2 rounded-xl text-xs font-black transition-all",
      active ? 'bg-white text-[#0176d3] shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'
    )}
  >
    {label}
  </button>
);

const StatCard = ({ label, value, icon: Icon, color }: any) => {
  const colors: any = {
    indigo: 'bg-[#0176d3] shadow-blue-100',
    rose: 'bg-rose-500 shadow-rose-100',
    emerald: 'bg-emerald-500 shadow-emerald-100',
    blue: 'bg-blue-600 shadow-blue-100'
  };
  
  return (
    <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
      <div className={clsx("p-3.5 rounded-2xl text-white shadow-lg", colors[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <h3 className="text-xl font-black text-slate-800 tabular-nums">{value}</h3>
      </div>
    </div>
  );
};

const DashboardCard = ({ title, icon, children }: any) => (
  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
      {icon}
      <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">{title}</h4>
    </div>
    {children}
  </div>
);

const AlertItem = ({ title, desc, severity }: any) => (
  <div className="flex items-center justify-between group cursor-pointer">
    <div className="flex items-center gap-3">
      <div className={clsx(
        "w-2 h-2 rounded-full",
        severity === 'high' ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'
      )}></div>
      <div>
        <p className="text-xs font-bold text-slate-700">{title}</p>
        <p className="text-[10px] text-slate-400">{desc}</p>
      </div>
    </div>
    <ChevronRight className="text-slate-200 group-hover:text-indigo-600 transition-colors" size={14} />
  </div>
);