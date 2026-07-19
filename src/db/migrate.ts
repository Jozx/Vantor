import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

// ─── Version tracking ─────────────────────────────────────────────────────────

const SCHEMA_VERSION = 7;

// ─── DDL – tables are ordered so FK dependencies are always satisfied ─────────

const DDL_V1 = `
CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL UNIQUE,
  color     TEXT    NOT NULL DEFAULT '#6b7280',
  is_custom INTEGER NOT NULL DEFAULT 1 CHECK(is_custom IN (0, 1))
);

CREATE TABLE IF NOT EXISTS accounts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK(type IN ('bank','broker','mutual_fund')),
  currency          TEXT NOT NULL CHECK(currency IN ('PYG','USD')),
  institution       TEXT NOT NULL DEFAULT '',
  opening_balance   REAL NOT NULL DEFAULT 0,
  opening_date      TEXT NOT NULL,
  yield_rate        REAL,
  last_accrual_date TEXT
);

CREATE TABLE IF NOT EXISTS holdings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol     TEXT    NOT NULL,
  currency   TEXT    NOT NULL CHECK(currency IN ('PYG','USD'))
);

CREATE TABLE IF NOT EXISTS security_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  holding_id  INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK(type IN ('buy','sell')),
  quantity    REAL    NOT NULL,
  price       REAL    NOT NULL,
  commission  REAL    NOT NULL DEFAULT 0,
  occurred_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id                      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type                            TEXT    NOT NULL
                                    CHECK(type IN ('income','expense','deposit','withdrawal',
                                                   'interest_accrual','buy_debit','sell_credit')),
  amount                          REAL    NOT NULL,
  tag_id                          INTEGER REFERENCES tags(id) ON DELETE SET NULL,
  description                     TEXT    NOT NULL DEFAULT '',
  occurred_at                     TEXT    NOT NULL,
  related_security_transaction_id INTEGER REFERENCES security_transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  rate       REAL NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_prices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol     TEXT NOT NULL,
  price      REAL NOT NULL,
  currency   TEXT NOT NULL CHECK(currency IN ('PYG','USD')),
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  total_pyg      REAL NOT NULL,
  total_usd      REAL NOT NULL,
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  snapshot_date  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS settings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_api_key  TEXT NOT NULL DEFAULT '',
  fx_api_key     TEXT NOT NULL DEFAULT '',
  base_currency  TEXT NOT NULL DEFAULT 'PYG' CHECK(base_currency IN ('PYG','USD'))
);

CREATE INDEX IF NOT EXISTS idx_holdings_account
  ON holdings(account_id);

CREATE INDEX IF NOT EXISTS idx_security_transactions_holding
  ON security_transactions(holding_id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_account
  ON cash_transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_occurred
  ON cash_transactions(occurred_at);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_tag
  ON cash_transactions(tag_id);

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair
  ON fx_rates(base, quote);

CREATE INDEX IF NOT EXISTS idx_security_prices_symbol
  ON security_prices(symbol);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_date
  ON net_worth_snapshots(snapshot_date);
`;

const DDL_V2_ACCOUNTS = `
CREATE TABLE accounts_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK(type IN ('bank','broker','mutual_fund','credit_card')),
  currency          TEXT NOT NULL CHECK(currency IN ('PYG','USD')),
  institution       TEXT NOT NULL DEFAULT '',
  opening_balance   REAL NOT NULL DEFAULT 0,
  opening_date      TEXT NOT NULL,
  yield_rate        REAL,
  last_accrual_date TEXT
);
`;

const DDL_V2_HOLDINGS = `
CREATE TABLE holdings_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol     TEXT    NOT NULL,
  currency   TEXT    NOT NULL CHECK(currency IN ('PYG','USD')),
  market     TEXT    NOT NULL DEFAULT 'US'
);
`;

// ─── Seed data ────────────────────────────────────────────────────────────────

const DEFAULT_TAGS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Food', color: '#f59e0b' },
  { name: 'Car', color: '#3b82f6' },
  { name: 'Gas', color: '#f97316' },
  { name: 'Salary', color: '#10b981' },
  { name: 'Investment', color: '#8b5cf6' },
  { name: 'Housing', color: '#ec4899' },
  { name: 'Entertainment', color: '#f43f5e' },
  { name: 'Health', color: '#14b8a6' },
  { name: 'Education', color: '#6366f1' },
  { name: 'Shopping', color: '#d946ef' },
  { name: 'Other', color: '#6b7280' },
];

async function seedDefaultTags(db: SQLiteDBConnection): Promise<void> {
  for (const tag of DEFAULT_TAGS) {
    await db.run('INSERT OR IGNORE INTO tags (name, color, is_custom) VALUES (?, ?, 0)', [
      tag.name,
      tag.color,
    ]);
  }
}

async function seedDefaultSettings(db: SQLiteDBConnection): Promise<void> {
  // Ensure the singleton settings row always exists (id = 1).
  // Note: theme column is added in v5, so v1 seed omits it.
  await db.run(
    "INSERT OR IGNORE INTO settings (id, stock_api_key, fx_api_key, base_currency) VALUES (1, '', '', 'PYG')",
    [],
  );
}

// ─── Public migration runner ───────────────────────────────────────────────────

/**
 * Run all pending migrations and seed required reference data.
 * Safe to call on every app start – is a no-op when the DB is already
 * up to date (checked via PRAGMA user_version).
 */
export async function runMigrations(db: SQLiteDBConnection): Promise<void> {
  // FK enforcement must be re-enabled per connection in SQLite.
  await db.execute('PRAGMA foreign_keys = ON;');

  const versionResult = await db.query('PRAGMA user_version;');
  const currentVersion =
    (versionResult.values?.[0] as { user_version?: number } | undefined)?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  // ── v0 → v1 : initial schema ────────────────────────────────────────────────
  if (currentVersion < 1) {
    // All DDL is idempotent (CREATE … IF NOT EXISTS).
    await db.execute(DDL_V1);

    // Seed reference data – INSERT OR IGNORE makes these idempotent too.
    await seedDefaultTags(db);
    await seedDefaultSettings(db);

    // Commit the version number last.  If anything above threw, user_version
    // stays 0 so the migration retries on next launch.
    await db.execute('PRAGMA user_version = 1;');
  }

  // ── v1 → v2 : add credit_card type + market field on holdings ──────────────
  if (currentVersion < 2) {
    await db.execute('PRAGMA foreign_keys = OFF;');

    // Recreate accounts table with credit_card in the CHECK constraint.
    await db.execute(DDL_V2_ACCOUNTS);
    await db.execute('INSERT INTO accounts_new SELECT * FROM accounts;');
    await db.execute('DROP TABLE accounts;');
    await db.execute('ALTER TABLE accounts_new RENAME TO accounts;');

    // Recreate holdings table with market column.
    await db.execute(DDL_V2_HOLDINGS);
    await db.execute('INSERT INTO holdings_new SELECT id, account_id, symbol, currency, \'US\' FROM holdings;');
    await db.execute('DROP TABLE holdings;');
    await db.execute('ALTER TABLE holdings_new RENAME TO holdings;');

    // Recreate indexes that were dropped with the table recreation.
    await db.execute('CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);');

    await db.execute('PRAGMA foreign_keys = ON;');
    await db.execute('PRAGMA user_version = 2;');
  }

  // ── v2 → v3 : add more default tags ─────────────────────────────────────────
  if (currentVersion < 3) {
    await seedDefaultTags(db);
    await db.execute('PRAGMA user_version = 3;');
  }

  // ── v3 → v4 : add credit_limit + linked_transaction_id + charge/payment types
  if (currentVersion < 4) {
    await db.execute('PRAGMA foreign_keys = OFF;');

    // Recreate accounts with credit_limit column
    await db.execute(`
      CREATE TABLE accounts_v4 (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        name              TEXT NOT NULL,
        type              TEXT NOT NULL CHECK(type IN ('bank','broker','mutual_fund','credit_card')),
        currency          TEXT NOT NULL CHECK(currency IN ('PYG','USD')),
        institution       TEXT NOT NULL DEFAULT '',
        opening_balance   REAL NOT NULL DEFAULT 0,
        opening_date      TEXT NOT NULL,
        yield_rate        REAL,
        last_accrual_date TEXT,
        credit_limit      REAL
      );
    `);
    await db.execute(
      `INSERT INTO accounts_v4 (id, name, type, currency, institution, opening_balance, opening_date, yield_rate, last_accrual_date)
       SELECT id, name, type, currency, institution, opening_balance, opening_date, yield_rate, last_accrual_date FROM accounts;`,
    );
    await db.execute('DROP TABLE accounts;');
    await db.execute('ALTER TABLE accounts_v4 RENAME TO accounts;');

    // Recreate cash_transactions with linked_transaction_id + expanded type CHECK
    await db.execute(`
      CREATE TABLE cash_transactions_v4 (
        id                              INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id                      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type                            TEXT    NOT NULL
                                          CHECK(type IN ('income','expense','deposit','withdrawal',
                                                         'interest_accrual','buy_debit','sell_credit',
                                                         'charge','payment')),
        amount                          REAL    NOT NULL,
        tag_id                          INTEGER REFERENCES tags(id) ON DELETE SET NULL,
        description                     TEXT    NOT NULL DEFAULT '',
        occurred_at                     TEXT    NOT NULL,
        related_security_transaction_id INTEGER REFERENCES security_transactions(id) ON DELETE SET NULL,
        linked_transaction_id           INTEGER REFERENCES cash_transactions(id) ON DELETE SET NULL
      );
    `);
    await db.execute(
      `INSERT INTO cash_transactions_v4 (id, account_id, type, amount, tag_id, description, occurred_at, related_security_transaction_id)
       SELECT id, account_id, type, amount, tag_id, description, occurred_at, related_security_transaction_id FROM cash_transactions;`,
    );
    await db.execute('DROP TABLE cash_transactions;');
    await db.execute('ALTER TABLE cash_transactions_v4 RENAME TO cash_transactions;');

    // Recreate indexes dropped with table recreation
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cash_transactions_account ON cash_transactions(account_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cash_transactions_occurred ON cash_transactions(occurred_at);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cash_transactions_tag ON cash_transactions(tag_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cash_transactions_linked ON cash_transactions(linked_transaction_id);');

    await db.execute('PRAGMA foreign_keys = ON;');
    await db.execute('PRAGMA user_version = 4;');
  }

  // ── v4 → v5 : add theme column to settings ──────────────────────────────────
  if (currentVersion < 5) {
    await db.execute("ALTER TABLE settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system' CHECK(theme IN ('light', 'dark', 'system'))");
    await db.execute('PRAGMA user_version = 5;');
  }

  // ── v5 → v6 : add missing performance indexes ──────────────────────────────
  if (currentVersion < 6) {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_security_transactions_occurred ON security_transactions(occurred_at);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_cash_transactions_type ON cash_transactions(type);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);');
    await db.execute('PRAGMA user_version = 6;');
  }

  // ── v6 → v7 : add audit created_at timestamps ─────────────────────────────
  if (currentVersion < 7) {
    await db.execute("ALTER TABLE cash_transactions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    await db.execute("ALTER TABLE security_transactions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    await db.execute("UPDATE cash_transactions SET created_at = occurred_at WHERE created_at = ''");
    await db.execute("UPDATE security_transactions SET created_at = occurred_at WHERE created_at = ''");
    await db.execute('PRAGMA user_version = 7;');
  }
}
