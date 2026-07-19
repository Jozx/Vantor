import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { NetWorthSnapshot, DateRangeOpts } from '../types';

/** Typed CRUD + query operations for the `net_worth_snapshots` table. */
export class NetWorthSnapshotRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Insert a new snapshot and return its generated id. */
  async create(data: Omit<NetWorthSnapshot, 'id'>): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO net_worth_snapshots
         (total_pyg, total_usd, breakdown_json, snapshot_date)
       VALUES (?, ?, ?, ?)`,
      [data.total_pyg, data.total_usd, data.breakdown_json, data.snapshot_date],
    );
    return result.changes?.lastId ?? 0;
  }

  /**
   * Insert or replace the snapshot for a given date.
   * Uses UPSERT so callers can call this idempotently during daily recalculation.
   */
  async upsertByDate(data: Omit<NetWorthSnapshot, 'id'>): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO net_worth_snapshots
         (total_pyg, total_usd, breakdown_json, snapshot_date)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(snapshot_date) DO UPDATE SET
         total_pyg      = excluded.total_pyg,
         total_usd      = excluded.total_usd,
         breakdown_json = excluded.breakdown_json`,
      [data.total_pyg, data.total_usd, data.breakdown_json, data.snapshot_date],
    );
    return result.changes?.lastId ?? 0;
  }

  private static VALID_COLUMNS = new Set(['total_pyg', 'total_usd', 'breakdown_json', 'snapshot_date']);

  /** Partially update a snapshot row. */
  async update(
    id: number,
    data: Partial<Omit<NetWorthSnapshot, 'id'>>,
  ): Promise<void> {
    const entries = Object.entries(data).filter(([col, v]) => v !== undefined && NetWorthSnapshotRepo.VALID_COLUMNS.has(col));
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(
      `UPDATE net_worth_snapshots SET ${setClause} WHERE id = ?`,
      values,
    );
  }

  async remove(id: number): Promise<void> {
    await this.db.run('DELETE FROM net_worth_snapshots WHERE id = ?', [id]);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<NetWorthSnapshot | undefined> {
    const result = await this.db.query(
      'SELECT * FROM net_worth_snapshots WHERE id = ?',
      [id],
    );
    return (result.values?.[0] as NetWorthSnapshot | undefined);
  }

  async findByDate(date: string): Promise<NetWorthSnapshot | undefined> {
    const result = await this.db.query(
      'SELECT * FROM net_worth_snapshots WHERE snapshot_date = ? LIMIT 1',
      [date],
    );
    return (result.values?.[0] as NetWorthSnapshot | undefined);
  }

  /** All snapshots, newest first, optionally constrained to a date window. */
  async findAll(opts?: DateRangeOpts): Promise<NetWorthSnapshot[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.from) {
      conditions.push('snapshot_date >= ?');
      params.push(opts.from);
    }
    if (opts?.to) {
      conditions.push('snapshot_date <= ?');
      params.push(opts.to);
    }

    const whereClause =
      conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query(
      `SELECT * FROM net_worth_snapshots${whereClause} ORDER BY snapshot_date DESC`,
      params,
    );
    return (result.values ?? []) as NetWorthSnapshot[];
  }

  /** The single most recent snapshot. */
  async latest(): Promise<NetWorthSnapshot | undefined> {
    const result = await this.db.query(
      'SELECT * FROM net_worth_snapshots ORDER BY snapshot_date DESC LIMIT 1',
    );
    return (result.values?.[0] as NetWorthSnapshot | undefined);
  }

  /** Number of snapshots stored. */
  async count(): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) AS cnt FROM net_worth_snapshots',
    );
    return (result.values?.[0] as { cnt?: number } | undefined)?.cnt ?? 0;
  }
}
