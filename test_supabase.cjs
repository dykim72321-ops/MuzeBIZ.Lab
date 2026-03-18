const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://drnxydtrsjumjksqmdgi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybnh5ZHRyc2p1bWprc3FtZGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjUxMDUsImV4cCI6MjA4NTI0MTEwNX0.hYLhqkbrmk7tuSmL6yjCyIuNdX5R2hRNvs8RleXcwVs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuantHotItems() {
  console.log('Checking daily_discovery table...');
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: discoveryData, error: discoveryError } = await supabase
    .from('daily_discovery')
    .select('*')
    .gte('updated_at', twentyFourHoursAgo)
    .order('updated_at', { ascending: false })
    .limit(10);
    
  if (discoveryError) {
    console.error('Error fetching daily_discovery:', discoveryError);
    return;
  }
  
  console.log(`Found ${discoveryData.length} items in the last 24 hours.`);
  if (discoveryData.length > 0) {
    console.log('Sample item:', discoveryData[0]);
  } else {
    console.log('No recent hot items found! The python engine might not be running or failed.');
  }

  // Also check if edge function 'get-market-scanner' works
  const tickersToSync = discoveryData.length > 0 ? discoveryData.map(item => item.ticker) : ['AAPL', 'MSFT'];
  console.log(`\nTesting get-market-scanner with tickers: ${tickersToSync.join(', ')}`);
  
  const { data: realTimeData, error: syncError } = await supabase.functions.invoke('get-market-scanner', {
    body: { tickers: tickersToSync }
  });

  if (syncError) {
    console.error('Error invoking get-market-scanner:', syncError);
  } else {
    console.log('get-market-scanner result:', realTimeData);
  }
}

checkQuantHotItems();
