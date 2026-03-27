import * as fs from 'fs';
import * as path from 'path';
import YahooFinance from 'yahoo-finance2';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const yahooFinance = new YahooFinance();

/**
 * Historical Data Downloader
 * Downloads 2 years of daily candles using Yahoo Finance.
 */

const TICKERS = [
  'SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL', 'OCGN', 'BNGO', 'CTXR',
  'CLOV', 'BB', 'AMC', 'GME', 'NKLA', 'OPEN', 'LCID', 'SOFI'
];

const OUTPUT_DIR = path.join(__dirname, '../data/backtest');

async function downloadData() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 2); // 2 years ago

  for (const ticker of TICKERS) {
    console.log(`[DOWNLOAD] Fetching ${ticker} from Yahoo Finance...`);
    try {
      const result = await (yahooFinance as any).chart(ticker, {
        period1,
        interval: '1d'
      }) as any;

      if (result && result.quotes && result.quotes.length > 0) {
        const candles = result.quotes.map((q: any) => ({
          date: q.date.toISOString(),
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume
        })).filter(c => c.open !== null && c.close !== null);

        fs.writeFileSync(
          path.join(OUTPUT_DIR, `${ticker}.json`),
          JSON.stringify(candles, null, 2)
        );
        console.log(`   ✅ Saved ${candles.length} candles.`);
      } else {
        console.warn(`   ⚠️ No data for ${ticker}`);
      }
    } catch (err) {
      console.error(`   ❌ Failed for ${ticker}:`, err);
    }

    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n[COMPLETE] All data downloaded to /data/backtest');
}

downloadData();
