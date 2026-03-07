import { supabase } from '../lib/supabase';
import type { 
  CrmCompany, 
  CrmContact, 
  CrmProject, 
  CallPlan, 
  SourcedPart, 
  DesignIn 
} from '../types/crm';

/**
 * CRM Service - Handles all data operations for B2B Sales Intelligence
 */

// --- Companies ---
export const getCrmCompanies = async () => {
  const { data, error } = await supabase
    .from('crm_companies')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as CrmCompany[];
};

export const createCrmCompany = async (company: Partial<CrmCompany>) => {
  const { data, error } = await supabase
    .from('crm_companies')
    .insert(company)
    .select()
    .single();
  if (error) throw error;
  return data as CrmCompany;
};

export const updateCrmCompany = async (id: string, updates: Partial<CrmCompany>) => {
  const { data, error } = await supabase
    .from('crm_companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmCompany;
};

export const deleteCrmCompany = async (id: string) => {
  const { error } = await supabase.from('crm_companies').delete().eq('id', id);
  if (error) throw error;
  return true;
};

// --- Contacts ---
export const getCrmContacts = async (companyId?: string) => {
  let query = supabase.from('crm_contacts').select('*');
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query.order('name');
  if (error) throw error;
  return data as CrmContact[];
};

export const createCrmContact = async (contact: Partial<CrmContact>) => {
  const { data, error } = await supabase
    .from('crm_contacts')
    .insert(contact)
    .select()
    .single();
  if (error) throw error;
  return data as CrmContact;
};

export const updateCrmContact = async (id: string, updates: Partial<CrmContact>) => {
  const { data, error } = await supabase
    .from('crm_contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmContact;
};

export const deleteCrmContact = async (id: string) => {
  const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
  if (error) throw error;
  return true;
};

// --- Projects ---
export const getCrmProjects = async () => {
  const { data, error } = await supabase
    .from('crm_projects')
    .select('*, crm_companies(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (CrmProject & { crm_companies: { name: string } })[];
};

export const createCrmProject = async (project: Partial<CrmProject>) => {
  const { data, error } = await supabase
    .from('crm_projects')
    .insert(project)
    .select()
    .single();
  if (error) throw error;
  return data as CrmProject;
};

export const updateCrmProject = async (id: string, updates: Partial<CrmProject>) => {
  const { data, error } = await supabase
    .from('crm_projects')
    .update({ 
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmProject;
};

export const deleteCrmProject = async (id: string) => {
  const { error } = await supabase.from('crm_projects').delete().eq('id', id);
  if (error) throw error;
  return true;
};

// --- Call Plans ---
export const getCallPlans = async (companyId?: string) => {
  let query = supabase.from('crm_call_plans').select('*, crm_contacts(name), crm_projects(title)');
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query.order('visit_date', { ascending: false });
  if (error) throw error;
  return data as (CallPlan & { crm_contacts: { name: string }, crm_projects: { title: string } })[];
};

export const getCallPlansByProject = async (projectId: string) => {
  const { data, error } = await supabase
    .from('crm_call_plans')
    .select('*, crm_contacts(name)')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return data as (CallPlan & { crm_contacts: { name: string } })[];
};

export const createCallPlan = async (callPlan: Partial<CallPlan>) => {
  const { data, error } = await supabase
    .from('crm_call_plans')
    .insert(callPlan)
    .select()
    .single();
  if (error) throw error;
  return data as CallPlan;
};

export const updateCallPlan = async (id: string, updates: Partial<CallPlan>) => {
  const { data, error } = await supabase
    .from('crm_call_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CallPlan;
};

export const deleteCallPlan = async (id: string) => {
  const { error } = await supabase.from('crm_call_plans').delete().eq('id', id);
  if (error) throw error;
  return true;
};

// --- Project Intelligence & Timeline ---
export const getProjectTimeline = async (projectId: string) => {
  // Aggregate all related data for a project comprehensive view
  const [project, callPlans, sourcing] = await Promise.all([
    supabase.from('crm_projects').select('*, crm_companies(*)').eq('id', projectId).single(),
    getCallPlansByProject(projectId),
    supabase.from('crm_sourced_parts').select('*').eq('project_id', projectId)
  ]);

  return {
    project: project.data,
    history: callPlans,
    sourcingRisk: sourcing.data
  };
};

// --- Vector Intelligence ---
export const searchSimilarTechLogs = async (embedding: number[], match_threshold = 0.5, match_count = 5) => {
  const { data, error } = await supabase.rpc('match_crm_call_plans', {
    query_embedding: embedding,
    match_threshold,
    match_count,
  });
  if (error) throw error;
  return data;
};

// --- Sourcing Bridge ---
export const syncSourcedPart = async (sourcedPart: Partial<SourcedPart>) => {
  const { data, error } = await supabase
    .from('crm_sourced_parts')
    .insert(sourcedPart)
    .select()
    .single();
  if (error) throw error;
  return data as SourcedPart;
};

// --- Design-in History ---
export const getDesignInHistory = async (companyId?: string) => {
  let query = supabase.from('crm_design_in_history').select('*');
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data as DesignIn[];
};

export const createDesignIn = async (designIn: Partial<DesignIn>) => {
  const { data, error } = await supabase
    .from('crm_design_in_history')
    .insert(designIn)
    .select()
    .single();
  if (error) throw error;
  return data as DesignIn;
};
