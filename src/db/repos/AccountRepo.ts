import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Account, AccountType } from '../types';

/** Typed CRUD + query operations for the `accounts` table. */
export class AccountRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Insert a new account and return its generated id. */
  async create(data: Omit<Account, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO accounts
         (name, type, currency, institution, opening_balance, opening_date,
          yield_rate, last_accrual_date, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.type,
        data.currency,
        data.institution,
        data.opening_balance,
        data.opening_date,
        data.yield_rate ?? null,
        data.last_accrual_date ?? null,
        data.credit_limit ?? null,
      ],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  /**
   * Partially update an account row.
   * Column names come from the typed key set of `Account` – values are
   * always parameterised.
   */
  async update(id: number, data: Partial<Omit<Account, 'id'>>, transaction = true): Promise<void> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(`UPDATE accounts SET ${setClause} WHERE id = ?`, values, transaction);
  }

  /** Hard-delete an account (cascades to holdings and cash_transactions). */
  async remove(id: number, transaction = true): Promise<void> {
    await this.db.run('DELETE FROM accounts WHERE id = ?', [id], transaction);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<Account | undefined> {
    const result = await this.db.query('SELECT * FROM accounts WHERE id = ?', [id]);
    return (result.values?.[0] as Account | undefined);
  }

  async findAll(): Promise<Account[]> {
    const result = await this.db.query('SELECT * FROM accounts ORDER BY name ASC');
    return (result.values ?? []) as Account[];
  }

  async findByType(type: AccountType): Promise<Account[]> {
    const result = await this.db.query(
      'SELECT * FROM accounts WHERE type = ? ORDER BY name ASC',
      [type],
    );
    return (result.values ?? []) as Account[];
  }
}
