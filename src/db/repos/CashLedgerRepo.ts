import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { CashTransaction, CashTransactionType, DateRangeOpts } from '../types';

/**
 * Typed CRUD + query operations for the `cash_transactions` table.
 * This is the unified cash ledger for all account types.
 */
export class CashLedgerRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Insert a cash ledger entry and return its generated id. */
  async create(data: Omit<CashTransaction, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO cash_transactions
         (account_id, type, amount, tag_id, description,
          occurred_at, related_security_transaction_id, linked_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.account_id,
        data.type,
        data.amount,
        data.tag_id ?? null,
        data.description,
        data.occurred_at,
        data.related_security_transaction_id ?? null,
        data.linked_transaction_id ?? null,
      ],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  private static VALID_COLUMNS = new Set(['account_id', 'type', 'amount', 'occurred_at', 'description', 'tag_id', 'linked_transaction_id']);

  /** Partially update a cash_transaction row. */
  async update(
    id: number,
    data: Partial<Omit<CashTransaction, 'id'>>,
    transaction = true,
  ): Promise<void> {
    const entries = Object.entries(data).filter(([col, v]) => v !== undefined && CashLedgerRepo.VALID_COLUMNS.has(col));
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(`UPDATE cash_transactions SET ${setClause} WHERE id = ?`, values, transaction);
  }

  async remove(id: number, transaction = true): Promise<void> {
    await this.db.run('DELETE FROM cash_transactions WHERE id = ?', [id], transaction);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<CashTransaction | undefined> {
    const result = await this.db.query(
      'SELECT * FROM cash_transactions WHERE id = ?',
      [id],
    );
    return (result.values?.[0] as CashTransaction | undefined);
  }

  /**
   * Batch-fetch running balances for multiple accounts in a single query.
   * Returns a Map<accountId, balance>.
   */
  async runningBalanceBatch(accountIds: number[]): Promise<Map<number, number>> {
    if (accountIds.length === 0) return new Map();
    const placeholders = accountIds.map(() => '?').join(', ');
    const result = await this.db.query(
      `SELECT
         a.id AS account_id,
         a.opening_balance +
         COALESCE(SUM(
           CASE ct.type
             WHEN 'income'            THEN  ct.amount
             WHEN 'deposit'           THEN  ct.amount
             WHEN 'interest_accrual'  THEN  ct.amount
             WHEN 'sell_credit'       THEN  ct.amount
             WHEN 'payment'           THEN  ct.amount
             WHEN 'expense'           THEN -ct.amount
             WHEN 'withdrawal'        THEN -ct.amount
             WHEN 'buy_debit'         THEN -ct.amount
             WHEN 'charge'            THEN -ct.amount
             ELSE 0
           END
         ), 0) AS balance
         FROM accounts a
         LEFT JOIN cash_transactions ct ON ct.account_id = a.id
        WHERE a.id IN (${placeholders})
        GROUP BY a.id`,
      accountIds,
    );
    const map = new Map<number, number>();
    for (const row of (result.values ?? []) as Array<{ account_id: number; balance: number }>) {
      map.set(row.account_id, row.balance ?? 0);
    }
    return map;
  }

  async findAll(opts?: DateRangeOpts): Promise<CashTransaction[]> {
    const { sql, params } = buildFilter(
      'SELECT * FROM cash_transactions',
      [],
      opts,
      'ORDER BY occurred_at DESC',
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as CashTransaction[];
  }

  /** All cash entries for a given account, newest first. */
  async findByAccountId(
    accountId: number,
    opts?: DateRangeOpts,
  ): Promise<CashTransaction[]> {
    const { sql, params } = buildFilter(
      'SELECT * FROM cash_transactions',
      [{ col: 'account_id', value: accountId }],
      opts,
      'ORDER BY occurred_at DESC',
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as CashTransaction[];
  }

  async findByTagId(tagId: number): Promise<CashTransaction[]> {
    const result = await this.db.query(
      'SELECT * FROM cash_transactions WHERE tag_id = ? ORDER BY occurred_at DESC',
      [tagId],
    );
    return (result.values ?? []) as CashTransaction[];
  }

  async findByType(
    type: CashTransactionType,
    opts?: DateRangeOpts,
  ): Promise<CashTransaction[]> {
    const { sql, params } = buildFilter(
      'SELECT * FROM cash_transactions',
      [{ col: 'type', value: type }],
      opts,
      'ORDER BY occurred_at DESC',
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as CashTransaction[];
  }

  /**
   * Running balance for an account up to (and including) a given date.
   * Balance = opening_balance + Σ (signed amounts)
   * where income / deposit / interest_accrual / sell_credit are positive
   * and expense / withdrawal / buy_debit are negative.
   */
  async runningBalance(
    accountId: number,
    upToDate?: string,
  ): Promise<number> {
    const dateClause = upToDate ? 'AND ct.occurred_at <= ?' : '';
    const params: unknown[] = upToDate ? [upToDate] : [];

    const result = await this.db.query(
      `SELECT
         a.opening_balance +
         COALESCE(SUM(
           CASE ct.type
             WHEN 'income'            THEN  ct.amount
             WHEN 'deposit'           THEN  ct.amount
             WHEN 'interest_accrual'  THEN  ct.amount
             WHEN 'sell_credit'       THEN  ct.amount
             WHEN 'payment'           THEN  ct.amount
             WHEN 'expense'           THEN -ct.amount
             WHEN 'withdrawal'        THEN -ct.amount
             WHEN 'buy_debit'         THEN -ct.amount
             WHEN 'charge'            THEN -ct.amount
             ELSE 0
           END
         ), 0) AS balance
         FROM accounts a
         LEFT JOIN cash_transactions ct
                ON ct.account_id = a.id ${dateClause}
        WHERE a.id = ?
        GROUP BY a.id`,
      [...params, accountId],
    );
    return (
      (result.values?.[0] as { balance?: number } | undefined)?.balance ?? 0
    );
  }
}

// ─── Private helper ───────────────────────────────────────────────────────────

interface EqFilter {
  col: string;
  value: unknown;
}

function buildFilter(
  baseQuery: string,
  eqFilters: EqFilter[],
  opts: DateRangeOpts | undefined,
  orderClause: string,
): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const { col, value } of eqFilters) {
    conditions.push(`${col} = ?`);
    params.push(value);
  }
  if (opts?.from) {
    conditions.push('occurred_at >= ?');
    params.push(opts.from);
  }
  if (opts?.to) {
    conditions.push('occurred_at <= ?');
    params.push(opts.to);
  }

  const whereClause =
    conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  return { sql: `${baseQuery}${whereClause} ${orderClause}`, params };
}
