import type { Stock } from '../types';

/**
 * Standardizes stock data from various potential sources (Alpha Vantage, Finnhub, Yahoo, etc.)
 * into a unified `Stock` interface.
 */

// Define loose types for external API responses to allow flexible mapping
interface ExternalQuote {
  c?: number; // Finnhub Current
  dp?: number; // Finnhub Percent
  v?: number; // Finnhub Volume
  "Global Quote"?: {
    "01. symbol"?: string;
    "05. price"?: string;
    "10. change percent"?: string;
    "06. volume"?: string;
  };
  symbol?: string; // Generic
  regularMarketPrice?: number; // Yahoo
  regularMarketChangePercent?: number; // Yahoo
  regularMarketVolume?: number; // Yahoo
}

export function normalizeStockData(ticker: string, rawData: ExternalQuote, source: 'Finnhub' | 'AlphaVantage' | 'Yahoo' = 'Finnhub'): Partial<Stock> {
  const normalized: Partial<Stock> = {
    id: ticker,
    ticker: ticker,
    name: ticker, // Placeholder, usually enriched later
    sector: "Unknown", // Placeholder
  };

  try {
    switch (source) {
      case 'Finnhub':
        normalized.price = Number(rawData.c || 0);
        normalized.changePercent = Number(rawData.dp || 0);
        normalized.volume = Number(rawData.v || 0);
        break;

      case 'AlphaVantage': {
        const quote = rawData["Global Quote"];
        if (quote) {
          normalized.price = parseFloat(quote["05. price"] || '0');
          normalized.changePercent = parseFloat((quote["10. change percent"] || '0').replace('%', ''));
          normalized.volume = parseInt(quote["06. volume"] || '0', 10);
        }
        break;
      }
      
      // Prep for future Yahoo integration
      case 'Yahoo':
        normalized.price = rawData.regularMarketPrice || 0;
        normalized.changePercent = rawData.regularMarketChangePercent || 0;
        normalized.volume = rawData.regularMarketVolume || 0;
        break;
    }
  } catch (err) {
    console.warn(`Error normalizing data for ${ticker} from ${source}:`, err);
  }

  // Anomaly Prevention: Basic Sanity Check
  if ((normalized.price || 0) < 0) normalized.price = 0;
  
  return normalized;
}

export function validateStockData(stock: Partial<Stock>): boolean {
  if (!stock.price || stock.price <= 0) return false;
  if (Math.abs(stock.changePercent || 0) > 500) return false; // Suspicious volatility check
  return true;
}
