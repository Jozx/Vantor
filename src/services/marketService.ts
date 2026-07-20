import { getRepos, withTransaction } from '@/db';

// ─── API Endpoints ───────────────────────────────────────────────────────────

const FX_API_BASE = 'https://open.er-api.com/v6/latest';
const FINNHUB_BASE = 'https://finnhub.io/api/v1/quote';

// ─── Throttle Control ────────────────────────────────────────────────────────

let lastRefreshTime = 0;
const REFRESH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarketDataStatus {
  lastRefresh: Date | null;
  fxRatesCount: number;
  securityPricesCount: number;
  isRefreshing: boolean;
  error: string | null;
}

// ─── FX Rate Fetching ────────────────────────────────────────────────────────

async function fetchFxRatesFromApi(baseCurrency: string): Promise<Record<string, number>> {
  const response = await fetch(`${FX_API_BASE}/${baseCurrency}`);
  if (!response.ok) {
    throw new Error(`FX API error: ${response.status}`);
  }
  const data = await response.json();
  if (data.result !== 'success') {
    throw new Error('FX API returned failure');
  }
  return data.rates;
}

// ─── Stock Price Fetching (Finnhub) ──────────────────────────────────────────

/**
 * Fetch the current price for a single symbol via Finnhub.
 * Returns null on any error (network, 429 rate-limit, missing key, bad symbol)
 * so the caller can skip that symbol without crashing the whole refresh.
 */
async function fetchStockPriceFromFinnhub(
  symbol: string,
  apiKey: string,
): Promise<{ price: number; currency: string } | null> {
  try {
    const response = await fetch(
      `${FINNHUB_BASE}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
    );

    if (response.status === 429) {
      console.warn(`Finnhub rate-limited for ${symbol}, skipping`);
      return null;
    }
    if (!response.ok) {
      console.warn(`Finnhub API error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.warn(`Finnhub returned error for ${symbol}: ${data.error}`);
      return null;
    }

    const price = data.c; // current price
    if (typeof price !== 'number' || price <= 0) {
      console.warn(`Invalid or zero price from Finnhub for ${symbol}:`, price);
      return null;
    }

    return { price, currency: 'USD' };
  } catch (error) {
    console.error(`Finnhub fetch failed for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock prices in batches with concurrency control.
 * Finnhub's free tier allows ~60 calls/minute, so we batch 5 at a time
 * with a small delay between batches to avoid rate-limiting.
 */
async function fetchStockPricesBatch(
  symbols: string[],
  apiKey: string,
  concurrency = 5,
): Promise<Array<{ symbol: string; price: number; currency: string }>> {
  const results: Array<{ symbol: string; price: number; currency: string }> = [];

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (symbol) => {
        const data = await fetchStockPriceFromFinnhub(symbol, apiKey);
        return data ? { symbol: symbol.toUpperCase(), price: data.price, currency: data.currency } : null;
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    // Small delay between batches to respect rate limits
    if (i + concurrency < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

// ─── Main Refresh Function ───────────────────────────────────────────────────

export async function refreshMarketData(
  baseCurrency: string = 'USD',
): Promise<MarketDataStatus> {
  const repos = await getRepos();
  const now = new Date().toISOString();

  try {
    // 1. Fetch FX rates
    const rates = await fetchFxRatesFromApi(baseCurrency);
    const rateEntries = Object.entries(rates);

    // 2. Fetch stock prices via Finnhub (only if API key is configured)
    const settings = await repos.settings.get();
    const apiKey = settings.stock_api_key;

    const stockData: Array<{ symbol: string; price: number; currency: string }> = [];
    if (apiKey) {
      const allHoldings = await repos.holdings.findAll();
      const uniqueSymbols = [...new Set(allHoldings.map((h) => h.symbol))];
      stockData.push(...await fetchStockPricesBatch(uniqueSymbols, apiKey));
    }

    // 3. Persist all fetched data in a single transaction
    await withTransaction(async () => {
      // Store rates in both directions (e.g., USD→PYG and PYG→USD)
      for (const [quoteCurrency, rate] of rateEntries) {
        if (quoteCurrency === baseCurrency) continue;

        // Store base → quote
        await repos.marketData.insertFxRate({
          base: baseCurrency,
          quote: quoteCurrency,
          rate,
          fetched_at: now,
        }, false);

        // Store quote → base (inverse rate)
        if (rate > 0) {
          await repos.marketData.insertFxRate({
            base: quoteCurrency,
            quote: baseCurrency,
            rate: 1 / rate,
            fetched_at: now,
          }, false);
        }
      }

      for (const { symbol, price, currency } of stockData) {
        await repos.marketData.insertSecurityPrice({
          symbol,
          price,
          currency: currency as 'PYG' | 'USD',
          fetched_at: now,
        }, false);
      }
    });

    lastRefreshTime = Date.now();

    // Get counts
    const allRates = await repos.marketData.allFxRates();
    const allPrices = await repos.marketData.allSecurityPrices();

    return {
      lastRefresh: new Date(now),
      fxRatesCount: allRates.length,
      securityPricesCount: allPrices.length,
      isRefreshing: false,
      error: null,
    };
  } catch (error) {
    console.error('Market data refresh failed:', error);
    return {
      lastRefresh: null,
      fxRatesCount: 0,
      securityPricesCount: 0,
      isRefreshing: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Auto-Refresh (throttled) ────────────────────────────────────────────────

export async function autoRefreshMarketData(
  baseCurrency: string = 'USD',
): Promise<MarketDataStatus> {
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_THROTTLE_MS) {
    // Return cached status without refreshing
    const repos = await getRepos();
    const allRates = await repos.marketData.allFxRates();
    const allPrices = await repos.marketData.allSecurityPrices();
    const latestRate = allRates.length > 0 ? allRates[0] : null;

    return {
      lastRefresh: latestRate ? new Date(latestRate.fetched_at) : null,
      fxRatesCount: allRates.length,
      securityPricesCount: allPrices.length,
      isRefreshing: false,
      error: null,
    };
  }

  return refreshMarketData(baseCurrency);
}

// ─── Get Current Status ──────────────────────────────────────────────────────

export async function getMarketDataStatus(): Promise<MarketDataStatus> {
  const repos = await getRepos();
  const allRates = await repos.marketData.allFxRates();
  const allPrices = await repos.marketData.allSecurityPrices();
  const latestRate = allRates.length > 0 ? allRates[0] : null;

  return {
    lastRefresh: latestRate ? new Date(latestRate.fetched_at) : null,
    fxRatesCount: allRates.length,
    securityPricesCount: allPrices.length,
    isRefreshing: false,
    error: null,
  };
}

// ─── Get Security Price ──────────────────────────────────────────────────────

export async function getSecurityPrice(symbol: string): Promise<number | null> {
  const repos = await getRepos();
  const price = await repos.marketData.latestSecurityPrice(symbol);
  return price?.price ?? null;
}
