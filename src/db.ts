import { SQLiteConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { runMigrations } from './db/migrate';
import { createRepos } from './db/index';
export type {
  AccountType,
  Currency,
  CashTransactionType,
  Account,
  Holding,
  SecurityTransaction,
  CashTransaction,
  Tag,
  Settings,
} from './db/types';

let dbInstance: SQLiteDBConnection | null = null;
let sqliteConnection: SQLiteConnection | null = null;
let reposInstance: ReturnType<typeof createRepos> | null = null;
let reposPendingPromise: Promise<ReturnType<typeof createRepos>> | null = null;
let dbPendingPromise: Promise<SQLiteDBConnection> | null = null;

/**
 * Generate a cryptographically random 256-bit hex passphrase.
 */
function generatePassphrase(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Return (or lazily open) the singleton SQLite connection for `vantor.db`.
 *
 * On the very first call the connection is opened and `runMigrations()` is
 * executed, which creates all tables and seeds reference data exactly once
 * (tracked via PRAGMA user_version).  Subsequent calls return the cached
 * connection immediately.
 *
 * On native (Android/iOS) when `androidIsEncryption` / `iosIsEncryption` is
 * enabled in capacitor.config.ts, the database is opened with SQLCipher
 * 256-bit AES encryption.  A random passphrase is generated once and stored
 * in the platform secure store (Android Keystore / iOS Keychain) via the
 * plugin's own `setEncryptionSecret`.
 *
 * ⚠ Browser (jeep-sqlite / IndexedDB) does NOT support SQLCipher encryption.
 * The database remains unencrypted when running in a browser.
 */
export async function getDb(): Promise<SQLiteDBConnection> {
  if (dbInstance) {
    return dbInstance;
  }

  // Guard against concurrent callers: all await the same in-flight promise.
  if (dbPendingPromise) {
    return dbPendingPromise;
  }

  dbPendingPromise = (async () => {

  if (!sqliteConnection) {
    sqliteConnection = new SQLiteConnection(CapacitorSQLite);
  }

  const platform = Capacitor.getPlatform();
  const isNative = platform === 'android' || platform === 'ios';

  if (platform === 'web') {
    // jeep-sqlite must already be in the DOM – see main.tsx bootstrap.
    const jeepSqliteEl = document.querySelector('jeep-sqlite');
    if (!jeepSqliteEl) {
      throw new Error(
        'jeep-sqlite element is not present in the DOM. ' +
          'Ensure main.tsx has completed its web initialisation before calling getDb().',
      );
    }
    await sqliteConnection.initWebStore();
  }

  const dbName = 'finance.db';

  const isConn = await sqliteConnection.isConnection(dbName, false);
  if (isConn.result) {
    dbInstance = await sqliteConnection.retrieveConnection(dbName, false);
  } else {
    let encrypted = false;
    let mode = 'no-encryption';

    if (isNative) {
      const configEncrypted = (await sqliteConnection.isInConfigEncryption()).result;
      if (configEncrypted) {
        const secretStored = (await sqliteConnection.isSecretStored()).result;
        if (!secretStored) {
          await sqliteConnection.setEncryptionSecret(generatePassphrase());
        }

        const dbExists = (await sqliteConnection.isDatabase(dbName)).result;
        if (dbExists) {
          const alreadyEncrypted = (await sqliteConnection.isDatabaseEncrypted(dbName)).result;
          if (!alreadyEncrypted) {
            encrypted = true;
            mode = 'encryption';
          } else {
            encrypted = true;
            mode = 'secret';
          }
        } else {
          encrypted = true;
          mode = 'secret';
        }
      }
    }

    dbInstance = await sqliteConnection.createConnection(
      dbName,
      encrypted,
      mode,
      1, // schema version (Capacitor layer – our own versioning uses PRAGMA user_version)
      false, // readonly
    );
  }

  if (!dbInstance) {
    throw new Error('Failed to create SQLite connection for vantor.db');
  }

  await dbInstance.open();

  // Run pending migrations (no-op after the first successful run).
  await runMigrations(dbInstance);

  return dbInstance;
  })();

  try {
    const result = await dbPendingPromise;
    return result;
  } finally {
    dbPendingPromise = null;
  }
}

/**
 * Convenience wrapper: open the DB and return all typed repository instances
 * in a single call.
 *
 * @example
 * ```ts
 * const { accounts, tags, settings } = await getRepos();
 * const allTags = await tags.findAll();
 * ```
 */
export async function getRepos() {
  if (reposInstance) return reposInstance;
  if (reposPendingPromise) return reposPendingPromise;
  reposPendingPromise = (async () => {
    const db = await getDb();
    reposInstance = createRepos(db);
    return reposInstance;
  })();
  try {
    const result = await reposPendingPromise;
    return result;
  } finally {
    reposPendingPromise = null;
  }
}
