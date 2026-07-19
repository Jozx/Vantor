// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  AccountType,
  Currency,
  SecurityTransactionType,
  CashTransactionType,
  Account,
  Holding,
  SecurityTransaction,
  CashTransaction,
  Tag,
  FxRate,
  SecurityPrice,
  NetWorthSnapshot,
  Settings,
  DateRangeOpts,
} from './types';

// ─── Repositories ─────────────────────────────────────────────────────────────
export { AccountRepo } from './repos/AccountRepo';
export { HoldingRepo } from './repos/HoldingRepo';
export { SecurityLedgerRepo } from './repos/SecurityLedgerRepo';
export { CashLedgerRepo } from './repos/CashLedgerRepo';
export { TagRepo } from './repos/TagRepo';
export { MarketDataRepo } from './repos/MarketDataRepo';
export { NetWorthSnapshotRepo } from './repos/NetWorthSnapshotRepo';
export { SettingsRepo } from './repos/SettingsRepo';

// ─── Migration runner ─────────────────────────────────────────────────────────
export { runMigrations } from './migrate';

// ─── Repository factory ───────────────────────────────────────────────────────
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { AccountRepo } from './repos/AccountRepo';
import { HoldingRepo } from './repos/HoldingRepo';
import { SecurityLedgerRepo } from './repos/SecurityLedgerRepo';
import { CashLedgerRepo } from './repos/CashLedgerRepo';
import { TagRepo } from './repos/TagRepo';
import { MarketDataRepo } from './repos/MarketDataRepo';
import { NetWorthSnapshotRepo } from './repos/NetWorthSnapshotRepo';
import { SettingsRepo } from './repos/SettingsRepo';

/**
 * Create all repository instances bound to the given SQLite connection.
 *
 * @example
 * ```ts
 * import { getDb } from '@/db';
 * import { createRepos } from '@/db';
 *
 * const db = await getDb();
 * const { accounts, tags, settings } = createRepos(db);
 * const allTags = await tags.findAll();
 * ```
 *
 * Or use the convenience wrapper:
 * ```ts
 * import { getRepos } from '@/db';
 * const { accounts, tags } = await getRepos();
 * ```
 */
export function createRepos(db: SQLiteDBConnection) {
  return {
    accounts: new AccountRepo(db),
    holdings: new HoldingRepo(db),
    securityLedger: new SecurityLedgerRepo(db),
    cashLedger: new CashLedgerRepo(db),
    tags: new TagRepo(db),
    marketData: new MarketDataRepo(db),
    netWorthSnapshots: new NetWorthSnapshotRepo(db),
    settings: new SettingsRepo(db),
  } as const;
}

/** Typed union of all repository instances. */
export type Repos = ReturnType<typeof createRepos>;
