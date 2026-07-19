import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Tag } from '../types';

/** Typed CRUD + query operations for the `tags` table. */
export class TagRepo {
  private readonly db: SQLiteDBConnection;

  constructor(db: SQLiteDBConnection) {
    this.db = db;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Create a custom tag and return its generated id. */
  async create(data: Omit<Tag, 'id'>): Promise<number> {
    const result = await this.db.run(
      'INSERT INTO tags (name, color, is_custom) VALUES (?, ?, ?)',
      [data.name, data.color, data.is_custom],
    );
    return result.changes?.lastId ?? 0;
  }

  /** Partially update a tag. */
  private static VALID_COLUMNS = new Set(['name', 'color']);

  async update(id: number, data: Partial<Omit<Tag, 'id'>>): Promise<void> {
    const entries = Object.entries(data).filter(([col, v]) => v !== undefined && TagRepo.VALID_COLUMNS.has(col));
    if (entries.length === 0) return;
    const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await this.db.run(`UPDATE tags SET ${setClause} WHERE id = ?`, values);
  }

  /**
   * Delete a tag. Cash transactions that reference it will have their
   * tag_id set to NULL by the ON DELETE SET NULL FK.
   */
  async remove(id: number): Promise<void> {
    await this.db.run('DELETE FROM tags WHERE id = ?', [id]);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<Tag | undefined> {
    const result = await this.db.query('SELECT * FROM tags WHERE id = ?', [id]);
    return (result.values?.[0] as Tag | undefined);
  }

  async findAll(): Promise<Tag[]> {
    const result = await this.db.query('SELECT * FROM tags ORDER BY name ASC');
    return (result.values ?? []) as Tag[];
  }

  async findByName(name: string): Promise<Tag | undefined> {
    const result = await this.db.query(
      'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
      [name],
    );
    return (result.values?.[0] as Tag | undefined);
  }

  /** Return only the system-seeded (is_custom = 0) tags. */
  async findDefaults(): Promise<Tag[]> {
    const result = await this.db.query(
      'SELECT * FROM tags WHERE is_custom = 0 ORDER BY name ASC',
    );
    return (result.values ?? []) as Tag[];
  }

  /** Return only tags created by the user (is_custom = 1). */
  async findCustom(): Promise<Tag[]> {
    const result = await this.db.query(
      'SELECT * FROM tags WHERE is_custom = 1 ORDER BY name ASC',
    );
    return (result.values ?? []) as Tag[];
  }
}
