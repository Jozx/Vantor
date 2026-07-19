import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Holding } from '../types';

/** Typed CRUD + query operations for the `holdings` table. */
export class HoldingRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Insert a new holding and return its generated id. */
  async create(data: Omit<Holding, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      'INSERT INTO holdings (account_id, symbol, currency, market) VALUES (?, ?, ?, ?)',
      [data.account_id, data.symbol, data.currency, data.market ?? 'US'],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  /** Partially update a holding row. */
  async update(id: number, data: Partial<Omit<Holding, 'id'>>, transaction = true): Promise<void> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(`UPDATE holdings SET ${setClause} WHERE id = ?`, values, transaction);
  }

  /** Delete a holding (cascades to security_transactions). */
  async remove(id: number, transaction = true): Promise<void> {
    await this.db.run('DELETE FROM holdings WHERE id = ?', [id], transaction);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<Holding | undefined> {
    const result = await this.db.query('SELECT * FROM holdings WHERE id = ?', [id]);
    return (result.values?.[0] as Holding | undefined);
  }

  async findAll(): Promise<Holding[]> {
    const result = await this.db.query('SELECT * FROM holdings ORDER BY symbol ASC');
    return (result.values ?? []) as Holding[];
  }

  async findByAccountId(accountId: number): Promise<Holding[]> {
    const result = await this.db.query(
      'SELECT * FROM holdings WHERE account_id = ? ORDER BY symbol ASC',
      [accountId],
    );
    return (result.values ?? []) as Holding[];
  }

  /** Returns all holdings across all accounts that match the given symbol. */
  async findBySymbol(symbol: string): Promise<Holding[]> {
    const result = await this.db.query(
      'SELECT * FROM holdings WHERE symbol = ? ORDER BY account_id ASC',
      [symbol],
    );
    return (result.values ?? []) as Holding[];
  }
}
