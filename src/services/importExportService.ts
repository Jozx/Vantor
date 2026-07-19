import { getRepos, getDb, withTransaction } from '@/db';
import { todayISO } from '@/lib/utils';
import Papa from 'papaparse';
import { zipSync, unzipSync } from 'fflate';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportManifest {
  tables: Record<string, number>;
  totalRows: number;
}

export interface ImportResult {
  success: boolean;
  manifest: ImportManifest;
  rowsImported: number;
}

// ─── Table Configuration ─────────────────────────────────────────────────────

interface TableConfig {
  columns: string[];
  exportColumns?: string[]; // columns to export (subset of columns; API keys stripped)
  insertSql: string;
}

const TABLES: Record<string, TableConfig> = {
  settings: {
    columns: ['id', 'stock_api_key', 'fx_api_key', 'base_currency', 'theme'],
    exportColumns: ['id', 'base_currency', 'theme'],
    insertSql:
      'INSERT INTO settings (id, stock_api_key, fx_api_key, base_currency, theme) VALUES (?, ?, ?, ?, ?)',
  },
  tags: {
    columns: ['id', 'name', 'color', 'is_custom'],
    insertSql: 'INSERT INTO tags (id, name, color, is_custom) VALUES (?, ?, ?, ?)',
  },
  accounts: {
    columns: [
      'id', 'name', 'type', 'currency', 'institution',
      'opening_balance', 'opening_date', 'yield_rate', 'last_accrual_date', 'credit_limit',
    ],
    insertSql:
      'INSERT INTO accounts (id, name, type, currency, institution, opening_balance, opening_date, yield_rate, last_accrual_date, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  },
  holdings: {
    columns: ['id', 'account_id', 'symbol', 'currency', 'market'],
    insertSql: 'INSERT INTO holdings (id, account_id, symbol, currency, market) VALUES (?, ?, ?, ?, ?)',
  },
  security_transactions: {
    columns: ['id', 'holding_id', 'type', 'quantity', 'price', 'commission', 'occurred_at', 'created_at'],
    insertSql:
      'INSERT INTO security_transactions (id, holding_id, type, quantity, price, commission, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  },
  cash_transactions: {
    columns: [
      'id', 'account_id', 'type', 'amount', 'tag_id',
      'description', 'occurred_at', 'related_security_transaction_id', 'linked_transaction_id', 'created_at',
    ],
    insertSql:
      'INSERT INTO cash_transactions (id, account_id, type, amount, tag_id, description, occurred_at, related_security_transaction_id, linked_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  },
  fx_rates: {
    columns: ['id', 'base', 'quote', 'rate', 'fetched_at'],
    insertSql: 'INSERT INTO fx_rates (id, base, quote, rate, fetched_at) VALUES (?, ?, ?, ?, ?)',
  },
  security_prices: {
    columns: ['id', 'symbol', 'price', 'currency', 'fetched_at'],
    insertSql:
      'INSERT INTO security_prices (id, symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?, ?)',
  },
  net_worth_snapshots: {
    columns: ['id', 'total_pyg', 'total_usd', 'breakdown_json', 'snapshot_date'],
    insertSql:
      'INSERT INTO net_worth_snapshots (id, total_pyg, total_usd, breakdown_json, snapshot_date) VALUES (?, ?, ?, ?, ?)',
  },
};

/** Tables in FK-safe import order (parents first). */
const TABLE_ORDER = [
  'settings',
  'tags',
  'accounts',
  'holdings',
  'security_transactions',
  'cash_transactions',
  'fx_rates',
  'security_prices',
  'net_worth_snapshots',
];

/** Columns that should be coerced to numbers during import. */
const NUMERIC_COLUMNS = new Set([
  'amount', 'quantity', 'price', 'commission',
  'opening_balance', 'yield_rate', 'credit_limit',
  'rate', 'total_pyg', 'total_usd', 'is_custom',
]);

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export all database tables as CSV files bundled into a ZIP Blob.
 * Each table becomes one CSV file named `<table>.csv`.
 */
export async function exportToZip(): Promise<Blob> {
  const repos = await getRepos();

  const tableData: Record<string, unknown[]> = {
    settings: [await repos.settings.get()],
    tags: await repos.tags.findAll(),
    accounts: await repos.accounts.findAll(),
    holdings: await repos.holdings.findAll(),
    security_transactions: await repos.securityLedger.findAll(),
    cash_transactions: await repos.cashLedger.findAll(),
    fx_rates: await repos.marketData.allFxRates(),
    security_prices: await repos.marketData.allSecurityPrices(),
    net_worth_snapshots: await repos.netWorthSnapshots.findAll(),
  };

  const csvFiles: Record<string, Uint8Array> = {};

  for (const tableName of TABLE_ORDER) {
    const config = TABLES[tableName];
    const rows = tableData[tableName] ?? [];

    // Build CSV with only the known columns (strip any extra fields)
    // Use exportColumns if available (e.g., to strip API keys from settings)
    const exportCols = config.exportColumns ?? config.columns;
    const mapped = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of exportCols) {
        obj[col] = (row as Record<string, unknown>)[col] ?? '';
      }
      return obj;
    });

    const csvString = Papa.unparse(mapped, {
      columns: exportCols,
      header: true,
    });

    csvFiles[tableName + '.csv'] = new TextEncoder().encode(csvString);
  }

  const zipped = zipSync(csvFiles, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

// ─── Import: Parse ───────────────────────────────────────────────────────────

/**
 * Parse a ZIP Blob into a manifest of table names → row counts.
 * Does NOT modify the database. Use `commitImport` after user confirms.
 */
export function parseImportZip(zipBlob: Blob): Promise<ImportManifest> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const zipData = new Uint8Array(reader.result as ArrayBuffer);
        const files = unzipSync(zipData);

        const manifest: ImportManifest = { tables: {}, totalRows: 0 };

        for (const tableName of TABLE_ORDER) {
          const filename = tableName + '.csv';
          const fileData = files[filename];
          if (!fileData) {
            reject(new Error(`Missing required file: ${filename}`));
            return;
          }

          const csvString = new TextDecoder().decode(fileData);
          const parsed = Papa.parse(csvString, {
            header: true,
            skipEmptyLines: true,
          });

          if (parsed.errors.length > 0) {
            reject(
              new Error(
                `CSV parse error in ${filename}: ${parsed.errors[0].message}`,
              ),
            );
            return;
          }

          const expectedCols = TABLES[tableName].exportColumns ?? TABLES[tableName].columns;
          const actualCols = parsed.meta.fields ?? [];
          const missing = expectedCols.filter((c) => !actualCols.includes(c));
          if (missing.length > 0) {
            reject(
              new Error(
                `Invalid format for ${filename}. Missing columns: ${missing.join(', ')}`,
              ),
            );
            return;
          }

          manifest.tables[tableName] = parsed.data.length;
          manifest.totalRows += parsed.data.length;
        }

        resolve(manifest);
      } catch (err) {
        reject(
          new Error(
            `Failed to read ZIP: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(zipBlob);
  });
}

// ─── Import: Commit ──────────────────────────────────────────────────────────

/**
 * Commit a parsed import ZIP to the database.
 * This clears all existing data and replaces it with the import data.
 * IDs are preserved so foreign key references remain valid.
 */
export async function commitImport(zipBlob: Blob): Promise<ImportResult> {
  const db = await getDb();

  // 1. Parse the ZIP
  const zipData = new Uint8Array(
    await zipBlob.arrayBuffer(),
  );
  const files = unzipSync(zipData);

  const manifest: ImportManifest = { tables: {}, totalRows: 0 };
  const parsedTables: Record<string, Record<string, unknown>[]> = {};

  for (const tableName of TABLE_ORDER) {
    const filename = tableName + '.csv';
    const fileData = files[filename];
    if (!fileData) {
      throw new Error(`Missing required file: ${filename}`);
    }

    const csvString = new TextDecoder().decode(fileData);
    const parsed = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      throw new Error(
        `CSV parse error in ${filename}: ${parsed.errors[0].message}`,
      );
    }

    parsedTables[tableName] = parsed.data as Record<string, unknown>[];
    manifest.tables[tableName] = parsed.data.length;
    manifest.totalRows += parsed.data.length;
  }

  // 2. Disable FK enforcement for the import transaction
  await db.execute('PRAGMA foreign_keys = OFF');

  try {
    await withTransaction(async () => {
      // 3. Delete all existing data (reverse FK order)
      const deleteOrder = [...TABLE_ORDER].reverse();
      for (const tableName of deleteOrder) {
        await db.execute(`DELETE FROM ${tableName}`);
      }

      // 4. Insert imported data with explicit IDs
      for (const tableName of TABLE_ORDER) {
        const config = TABLES[tableName];
        const rows = parsedTables[tableName] ?? [];
        if (rows.length === 0) continue;

        for (const row of rows) {
          // For settings, always overwrite API keys with empty strings
          // (they are stripped from exports and should not be imported)
          if (tableName === 'settings') {
            row.stock_api_key = '';
            row.fx_api_key = '';
          }
          // Coerce numeric columns from strings to numbers
          for (const key of Object.keys(row)) {
            if (NUMERIC_COLUMNS.has(key) && typeof row[key] === 'string') {
              const num = Number(row[key]);
              if (!isNaN(num)) row[key] = num;
            }
          }
          const exportCols = config.exportColumns ?? config.columns;
          const values = config.insertSql.match(/\?/g)!.map((_, i) => {
            const col = config.columns[i];
            if (col === undefined) return null; // missing column in export, use default
            const val = row[col];
            if (val === undefined || val === null) {
              return null;
            }
            // Only coerce truly empty strings to null for columns that weren't
            // in the original export CSV — columns we synthesise in code
            // (like stock_api_key) must keep their explicitly-set '' values.
            if (val === '' && exportCols.includes(col)) {
              return null;
            }
            return val;
          });
          await db.run(config.insertSql, values, false);
        }
      }

      // 5. Reset AUTOINCREMENT sequences
      for (const tableName of TABLE_ORDER) {
        const rows = parsedTables[tableName] ?? [];
        if (rows.length === 0) continue;

        const maxId = Math.max(
          ...rows.map((r) => Number(r.id) || 0),
        );

        // Use DELETE + INSERT instead of ON CONFLICT — sql.js doesn't
        // always expose the UNIQUE constraint on sqlite_sequence.name.
        await db.run(
          `DELETE FROM sqlite_sequence WHERE name = ?`,
          [tableName],
          false,
        );
        await db.run(
          `INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`,
          [tableName, maxId],
          false,
        );
      }
    });
  } finally {
    await db.execute('PRAGMA foreign_keys = ON');
  }

  return {
    success: true,
    manifest,
    rowsImported: manifest.totalRows,
  };
}

// ─── Download / Share Helpers ────────────────────────────────────────────────

/**
 * Trigger a download / share for the given Blob.
 *
 * On native (Android/iOS): writes the zip to the cache directory, then opens
 * the platform Share sheet so the user can save or send it.
 * On web: uses the <a download> browser trick.
 */
export async function triggerDownload(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
    );

    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      files: [result.uri],
    });
    return;
  }

  // Browser / web fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generate a backup filename with today's date.
 */
export function backupFilename(): string {
  const today = todayISO();
  return `vantor-backup-${today}.zip`;
}
