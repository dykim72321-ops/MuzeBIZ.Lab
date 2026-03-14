export interface ComponentPart {
  id: string;
  mpn: string;
  manufacturer: string;
  distributor: string;
  source_type: string;
  stock: number;
  price: number;
  price_history: number[];
  basePrice?: number;
  currency: string;
  delivery: string;
  condition: string;
  date_code: string;
  is_eol: boolean;
  risk_level: string;
  lifecycle?: string;
  is_alternative?: boolean;
  is_qc_enabled?: boolean;
  datasheet?: string;
  description?: string;
  product_url?: string;
  is_locked?: boolean;
  is_processing?: boolean;
  risk_score?: number;
  market_notes?: string;
  specs?: Record<string, string>;
}

export interface IntelData {
  inventoryData: { name: string; value: number }[];
  riskData: { name: string; value: number }[];
  priceData: { name: string; price: number; fullName: string; currency: string }[];
  priceStats: { min: number; max: number; avg: number; spread: number; count: number; currency: string } | null;
}

export type JourneyPhase = 'IDLE' | 'SCOUTING' | 'RESULTS';

export type ViewMode = 'grid' | 'table';
export type SortField = 'price' | 'stock' | 'distributor' | 'none';
export type SortOrder = 'asc' | 'desc';
