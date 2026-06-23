import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
if (!process.env.VITE_SUPABASE_URL) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: pos } = await supabase.from('active_positions').select('*');
  console.log("Active Positions:", pos);
  
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  console.log("Checking daily_discovery since:", twentyFourHoursAgo);
  const { data: disc } = await supabase.from('daily_discovery')
    .select('ticker, dna_score, updated_at')
    .gte('updated_at', twentyFourHoursAgo)
    .order('dna_score', { ascending: false })
    .limit(10);
  console.log("Recent Daily Discoveries:", disc);
  
  const { data: allDisc } = await supabase.from('daily_discovery')
    .select('ticker, dna_score, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log("All Daily Discoveries (latest 5):", allDisc);
}

check();
