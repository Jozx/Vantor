import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { FxRate, SecurityPrice } from '../types';

/**
 * Typed insert + query operations for the `fx_rates` and
 * `security_prices` tables.
 *
 * Both tables are append-only historical stores; "latest" lookups query
 * by the most-recent fetched_at timestamp.
 */
export class MarketDataRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── FX Rates ──────────────────────────────────────────────────────────────

  /** Insert a new FX rate snapshot and return its generated id. */
  async insertFxRate(data: Omit<FxRate, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      'INSERT INTO fx_rates (base, quote, rate, fetched_at) VALUES (?, ?, ?, ?)',
      [data.base, data.quote, data.rate, data.fetched_at],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  /**
   * Retrieve the most recently fetched rate for a currency pair.
   * Returns undefined when no rate has been stored yet.
   */
  async latestFxRate(base: string, quote: string): Promise<FxRate | undefined> {
    const result = await this.db.query(
      `SELECT * FROM fx_rates
        WHERE base = ? AND quote = ?
        ORDER BY fetched_at DESC
        LIMIT 1`,
      [base, quote],
    );
    return (result.values?.[0] as FxRate | undefined);
  }

  /**
   * All FX rate rows for a pair, newest first.
   * Useful for building a historical rate chart.
   */
  async fxRateHistory(base: string, quote: string): Promise<FxRate[]> {
    const result = await this.db.query(
      'SELECT * FROM fx_rates WHERE base = ? AND quote = ? ORDER BY fetched_at DESC',
      [base, quote],
    );
    return (result.values ?? []) as FxRate[];
  }

  /** Return the full fx_rates table, newest first. */
  async allFxRates(): Promise<FxRate[]> {
    const result = await this.db.query(
      'SELECT * FROM fx_rates ORDER BY fetched_at DESC',
    );
    return (result.values ?? []) as FxRate[];
  }

  // ── Security Prices ───────────────────────────────────────────────────────

  /** Insert a new security price snapshot and return its generated id. */
  async insertSecurityPrice(data: Omit<SecurityPrice, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      'INSERT INTO security_prices (symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?)',
      [data.symbol, data.price, data.currency, data.fetched_at],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  /** Most recently fetched price for a symbol. */
  async latestSecurityPrice(symbol: string): Promise<SecurityPrice | undefined> {
    const result = await this.db.query(
      `SELECT * FROM security_prices
        WHERE symbol = ?
        ORDER BY fetched_at DESC
        LIMIT 1`,
      [symbol],
    );
    return (result.values?.[0] as SecurityPrice | undefined);
  }

  /** Historical price rows for a symbol, newest first. */
  async securityPriceHistory(symbol: string): Promise<SecurityPrice[]> {
    const result = await this.db.query(
      'SELECT * FROM security_prices WHERE symbol = ? ORDER BY fetched_at DESC',
      [symbol],
    );
    return (result.values ?? []) as SecurityPrice[];
  }

  /** Return the full security_prices table, newest first. */
  async allSecurityPrices(): Promise<SecurityPrice[]> {
    const result = await this.db.query(
      'SELECT * FROM security_prices ORDER BY fetched_at DESC',
    );
    return (result.values ?? []) as SecurityPrice[];
  }

  /**
   * Convenience: return the latest price for every distinct symbol
   * that has at least one row in the table.
   */
  async latestPricesAll(): Promise<SecurityPrice[]> {
    const result = await this.db.query(
      `SELECT sp.*
         FROM security_prices sp
         INNER JOIN (
           SELECT symbol, MAX(fetched_at) AS max_at
             FROM security_prices
            GROUP BY symbol
         ) latest ON latest.symbol = sp.symbol AND latest.max_at = sp.fetched_at
        ORDER BY sp.symbol ASC`,
    );
    return (result.values ?? []) as SecurityPrice[];
  }
}
