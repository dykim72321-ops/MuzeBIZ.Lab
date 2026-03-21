
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  'http://127.0.0.1:54311',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
)

async function seed() {
  const { error } = await supabase.from('quant_signals').insert({
    ticker: 'AAPL',
    signal_date: new Date().toISOString().split('T')[0],
    dna_score: 95,
    rvol: 3.2,
    status: 'PENDING'
  })

  if (error) console.error(error)
  else console.log('✅ Seeded test signal')
}

seed()
