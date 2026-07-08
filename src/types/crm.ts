export type InfluenceLevel = 'CHAMPION' | 'BLOCKER' | 'INFLUENCER' | 'USER';
export type ProjectStage = 'NEEDS' | 'SAMPLE' | 'TEST' | 'NEGOTIATION' | 'WIN' | 'DROP';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DesignInStatus = 'DESIGNED_IN' | 'PROTOTYPE';

export interface TechStackItem {
  category: string;
  brand: string;
  model?: string;
  notes?: string;
}

export interface CrmCompany {
  id: string;
  name: string;
  industry?: string;
  address?: string;
  tech_stack: TechStackItem[];
  dart_code?: string;
  created_at: string;
  updated_at: string;
}

export interface CrmContact {
  id: string;
  company_id: string;
  name: string;
  department?: string;
  position?: string;
  influence_level: InfluenceLevel;
  preferences: Record<string, unknown>;
  contact_history?: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectVelocity {
  stage_durations: Record<ProjectStage, number>; // days in each stage
  last_stage_change: string;
}

export interface CrmProject {
  id: string;
  title: string;
  company_id: string;
  contact_id?: string;
  stage: ProjectStage;
  target_product?: string;
  competitor_product?: string;
  expected_value: number;
  velocity_data: ProjectVelocity;
  customer_dna_alert_level: 'NORMAL' | 'WARNING' | 'CRITICAL';
  next_followup_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DesignIn {
  id: string;
  company_id: string;
  part_number: string;
  application_name?: string;
  status: DesignInStatus;
  notes?: string;
  created_at: string;
}

export interface TechnicalLogItem {
  question: string;
  answer: string;
  date: string;
  tags?: string[];
}

export interface CallPlan {
  id: string;
  company_id: string;
  contact_id: string;
  visit_date: string;
  technical_log: TechnicalLogItem[];
  checklist: string[];
  defense_logic: Record<string, string>;
  is_quick_log: boolean;
  notes?: string;
  embedding?: number[];
  created_at: string;
}

export interface SourcedPart {
  id: string;
  call_plan_id: string;
  part_number: string;
  risk_level: RiskLevel;
  created_at: string;
}
