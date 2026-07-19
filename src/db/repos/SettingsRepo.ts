import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Settings } from '../types';
import { encryptValue, decryptValue } from '@/lib/crypto';

/**
 * Typed read + update operations for the `settings` table.
 *
 * The settings table is a singleton: exactly one row with id = 1 is
 * seeded by the migration and is always present.  There is no create /
 * remove surface – use `get()` and `update()` only.
 */
export class SettingsRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Return the singleton settings row.
   * Throws if the row is somehow missing (migration should always seed it).
   */
  async get(): Promise<Settings> {
    const result = await this.db.query(
      'SELECT * FROM settings WHERE id = 1 LIMIT 1',
    );
    const row = result.values?.[0] as Settings | undefined;
    if (!row) {
      throw new Error(
        'Settings row is missing – ensure runMigrations() was called before getDb().',
      );
    }
    return {
      ...row,
      stock_api_key: await decryptValue(row.stock_api_key),
      fx_api_key: await decryptValue(row.fx_api_key),
    };
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Partially update the settings singleton.
   * Column names come from the typed key set of `Settings` (id excluded).
   * All values are parameterised – no string interpolation of caller data.
   */
  private static VALID_COLUMNS = new Set(['stock_api_key', 'fx_api_key', 'base_currency', 'theme']);

  async update(data: Partial<Omit<Settings, 'id'>>): Promise<void> {
    const entries = Object.entries(data).filter(([col, v]) => v !== undefined && SettingsRepo.VALID_COLUMNS.has(col));
    if (entries.length === 0) return;
    const encrypted = await Promise.all(
      entries.map(async ([col, v]) => {
        if ((col === 'stock_api_key' || col === 'fx_api_key') && typeof v === 'string') {
          return [col, await encryptValue(v)] as const;
        }
        return [col, v] as const;
      }),
    );
    const setClause = encrypted.map(([col]) => `${col} = ?`).join(', ');
    const values = encrypted.map(([, v]) => v);
    await this.db.run(
      `UPDATE settings SET ${setClause} WHERE id = 1`,
      values,
    );
  }

  // ── Typed field helpers ───────────────────────────────────────────────────

  async setStockApiKey(key: string): Promise<void> {
    await this.db.run('UPDATE settings SET stock_api_key = ? WHERE id = 1', [await encryptValue(key)]);
  }

  async setFxApiKey(key: string): Promise<void> {
    await this.db.run('UPDATE settings SET fx_api_key = ? WHERE id = 1', [await encryptValue(key)]);
  }

  async setBaseCurrency(currency: Settings['base_currency']): Promise<void> {
    await this.db.run('UPDATE settings SET base_currency = ? WHERE id = 1', [currency]);
  }
}
