import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SecurityTransaction, DateRangeOpts } from '../types';

/**
 * Typed CRUD + query operations for the `security_transactions` table.
 * Covers trade-level data (buy / sell rows); cash side is in CashLedgerRepo.
 */
export class SecurityLedgerRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Record a trade and return its generated id. */
  async create(data: Omit<SecurityTransaction, 'id'>, transaction = true): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO security_transactions
         (holding_id, type, quantity, price, commission, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.holding_id,
        data.type,
        data.quantity,
        data.price,
        data.commission,
        data.occurred_at,
      ],
      transaction,
    );
    return result.changes?.lastId ?? 0;
  }

  /** Partially update a security_transaction row. */
  async update(
    id: number,
    data: Partial<Omit<SecurityTransaction, 'id'>>,
    transaction = true,
  ): Promise<void> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(
      `UPDATE security_transactions SET ${setClause} WHERE id = ?`,
      values,
      transaction,
    );
  }

  /** Delete a trade row (cascades via FK to related cash_transactions). */
  async remove(id: number, transaction = true): Promise<void> {
    await this.db.run('DELETE FROM security_transactions WHERE id = ?', [id], transaction);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<SecurityTransaction | undefined> {
    const result = await this.db.query(
      'SELECT * FROM security_transactions WHERE id = ?',
      [id],
    );
    return (result.values?.[0] as SecurityTransaction | undefined);
  }

  async findAll(opts?: DateRangeOpts): Promise<SecurityTransaction[]> {
    const { sql, params } = buildDateFilter(
      'SELECT * FROM security_transactions',
      'occurred_at',
      opts,
      'ORDER BY occurred_at DESC',
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as SecurityTransaction[];
  }

  /** All trades for a specific holding, newest first. */
  async findByHoldingId(
    holdingId: number,
    opts?: DateRangeOpts,
  ): Promise<SecurityTransaction[]> {
    const { sql, params } = buildDateFilter(
      'SELECT * FROM security_transactions WHERE holding_id = ?',
      'occurred_at',
      opts,
      'ORDER BY occurred_at DESC',
      [holdingId],
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as SecurityTransaction[];
  }

  /**
   * All trades that belong to any holding in a given account.
   * Joins through the holdings table.
   */
  async findByAccountId(
    accountId: number,
    opts?: DateRangeOpts,
  ): Promise<SecurityTransaction[]> {
    const { sql, params } = buildDateFilter(
      `SELECT st.*
         FROM security_transactions st
         JOIN holdings h ON h.id = st.holding_id
        WHERE h.account_id = ?`,
      'st.occurred_at',
      opts,
      'ORDER BY st.occurred_at DESC',
      [accountId],
    );
    const result = await this.db.query(sql, params);
    return (result.values ?? []) as SecurityTransaction[];
  }

  /**
   * Net position summary for a holding:
   * net_quantity  = sum buy.quantity − sum sell.quantity
   * average_cost  = total buy cost / total buy quantity
   *
   * Sells do NOT affect average cost — they only reduce net_quantity.
   * Returns null if the holding has no trades.
   */
  async netPosition(
    holdingId: number,
  ): Promise<{ net_quantity: number; average_cost: number } | null> {
    const result = await this.db.query(
      `SELECT
         SUM(CASE WHEN type = 'buy'  THEN quantity ELSE 0 END)                       AS buy_quantity,
         SUM(CASE WHEN type = 'buy'  THEN quantity * price + commission ELSE 0 END)  AS buy_cost,
         SUM(CASE WHEN type = 'sell' THEN quantity ELSE 0 END)                       AS sell_quantity
         FROM security_transactions
        WHERE holding_id = ?`,
      [holdingId],
    );
    const row = result.values?.[0] as
      | { buy_quantity: number | null; buy_cost: number | null; sell_quantity: number | null }
      | undefined;
    if (!row) return null;
    const buyQty = row.buy_quantity ?? 0;
    const buyCost = row.buy_cost ?? 0;
    const sellQty = row.sell_quantity ?? 0;
    if (buyQty === 0 && sellQty === 0) return null;
    const net_quantity = buyQty - sellQty;
    const average_cost = buyQty > 0 ? buyCost / buyQty : 0;
    return { net_quantity, average_cost };
  }

  /**
   * Batch net positions for multiple holdings in a single query.
   * Returns a Map from holding_id → { net_quantity, average_cost }.
   */
  async netPositionsBatch(
    holdingIds: number[],
  ): Promise<Map<number, { net_quantity: number; average_cost: number }>> {
    if (holdingIds.length === 0) return new Map();
    const placeholders = holdingIds.map(() => '?').join(', ');
    const result = await this.db.query(
      `SELECT
         holding_id,
         SUM(CASE WHEN type = 'buy'  THEN quantity ELSE 0 END)                       AS buy_quantity,
         SUM(CASE WHEN type = 'buy'  THEN quantity * price + commission ELSE 0 END)  AS buy_cost,
         SUM(CASE WHEN type = 'sell' THEN quantity ELSE 0 END)                       AS sell_quantity
         FROM security_transactions
        WHERE holding_id IN (${placeholders})
        GROUP BY holding_id`,
      holdingIds,
    );
    const map = new Map<number, { net_quantity: number; average_cost: number }>();
    for (const row of (result.values ?? []) as Array<{
      holding_id: number;
      buy_quantity: number | null;
      buy_cost: number | null;
      sell_quantity: number | null;
    }>) {
      const buyQty = row.buy_quantity ?? 0;
      const buyCost = row.buy_cost ?? 0;
      const sellQty = row.sell_quantity ?? 0;
      if (buyQty === 0 && sellQty === 0) continue;
      map.set(row.holding_id, {
        net_quantity: buyQty - sellQty,
        average_cost: buyQty > 0 ? buyCost / buyQty : 0,
      });
    }
    return map;
  }
}

// ─── Private helper ───────────────────────────────────────────────────────────

function buildDateFilter(
  baseQuery: string,
  dateColumn: string,
  opts: DateRangeOpts | undefined,
  orderClause: string,
  leadingParams: unknown[] = [],
): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [...leadingParams];

  if (opts?.from) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(opts.from);
  }
  if (opts?.to) {
    conditions.push(`${dateColumn} <= ?`);
    params.push(opts.to);
  }

  const whereClause =
    conditions.length > 0
      ? (baseQuery.toLowerCase().includes('where') ? ' AND ' : ' WHERE ') +
        conditions.join(' AND ')
      : '';

  return { sql: `${baseQuery}${whereClause} ${orderClause}`, params };
}
