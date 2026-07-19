# Vantor — Audit Report

**Date:** 2026-07-18
**Scope:** Full codebase re-audit after two rounds of fixes. All services, repos, pages, components, config.
**Method:** Parallel sweep of every source file, cross-referencing findings across layers.

---

## 1. Functional Correctness

### 1.1 CRITICAL — `AccountRepo.VALID_COLUMNS` Missing Columns Silently Drops Accrual Updates

**File:** `src/db/repos/AccountRepo.ts:42`
**Description:** `VALID_COLUMNS` only contains `['name', 'type', 'currency', 'opening_balance']`. Five real columns are excluded: `institution`, `yield_rate`, `last_accrual_date`, `credit_limit`, `opening_date`. Any `update()` call with these fields is silently dropped.
**Impact:** `financeService.ts:513` calls `repos.accounts.update(fund.id, { last_accrual_date: today }, false)`. Since `last_accrual_date` is not in `VALID_COLUMNS`, the update is a no-op. The accrual engine inserts `interest_accrual` transactions but never records that it ran, causing **duplicate accruals on every app launch**.
**Fix:** Expand to: `new Set(['name', 'type', 'currency', 'institution', 'opening_balance', 'opening_date', 'yield_rate', 'last_accrual_date', 'credit_limit'])`.

### 1.2 CRITICAL — `HoldingRepo.VALID_COLUMNS` Contains Phantom Columns

**File:** `src/db/repos/HoldingRepo.ts:25`
**Description:** `VALID_COLUMNS` contains `['account_id', 'symbol', 'quantity', 'average_cost']`. The `holdings` table columns are `id, account_id, symbol, currency, market`. `quantity` and `average_cost` do not exist — they are computed at the service layer. Meanwhile `currency` and `market` are real columns missing from the set.
**Fix:** Change to `new Set(['account_id', 'symbol', 'currency', 'market'])`.

### 1.3 CRITICAL — `SCHEMA_VERSION = 5` But Migration Code Goes to v6

**File:** `src/db/migrate.ts:5`
**Description:** `SCHEMA_VERSION` is `5`, but lines 301-307 contain a v5→v6 migration block that creates performance indexes. The guard at line 188 (`if (currentVersion >= SCHEMA_VERSION) return`) short-circuits when `user_version` reaches 5, so the v6 indexes (`idx_security_transactions_occurred`, `idx_cash_transactions_type`, `idx_accounts_type`) are **never created** on existing databases.
**Fix:** Change line 5 to `const SCHEMA_VERSION = 6`.

### 1.4 CRITICAL — `computeNetWorth` Cross-Currency Totals Are Always Incomplete

**File:** `src/services/financeService.ts:840-860`
**Description:** When `baseCurrency === 'PYG'`, `totalPyg` sums all accounts (correct). But `totalUsd` only sums raw USD account balances — PYG accounts are never converted into USD for `totalUsd`. The same mirror problem exists when `base = 'USD'`. The non-base-currency total is always incomplete.
**Fix:** When computing totals, always convert every account to both base and non-base currency using batch FX rates.

### 1.5 HIGH — N+1 Queries in `computeNetWorth` for Holdings

**File:** `src/services/financeService.ts:820-828`
**Description:** For every holding in every broker account, two individual queries are issued: `netPosition(holding.id)` and `latestSecurityPrice(holding.symbol)`. Batch methods exist (`netPositionsBatch` at line 90, `latestSecurityPriceBatch` pattern in MarketDataRepo) but are not used here.
**Fix:** Batch-fetch all positions and prices before the loop.

### 1.6 HIGH — `sellSecurity` Position Check Outside Transaction (Race Condition)

**File:** `src/services/financeService.ts:917-924`
**Description:** The net position check (`quantity > currentQuantity`) happens at line 917, **before** `beginTransaction()` at line 924. Two concurrent sells for the same holding could both pass the check and both insert, resulting in overselling.
**Fix:** Move the position check inside the transaction block.

### 1.7 HIGH — `chargeCreditCard` Limit Check Outside Transaction (Race Condition)

**File:** `src/services/financeService.ts:261-268`
**Description:** The balance+limit check (`currentDebt + amount > credit_limit`) happens outside the transaction (which begins at line 268). Two concurrent charges could both pass the limit check.
**Fix:** Move the limit check inside the transaction block.

### 1.8 HIGH — `buySecurity` Holding Find-or-Create Needs `IMMEDIATE` Transaction

**File:** `src/services/financeService.ts:149-153`
**Description:** The find-or-create logic reads `findByAccountId` then creates if not found. With SQLite's default `DEFERRED` transaction, two concurrent buys for the same symbol could both read "no holding" before either writes, creating duplicate holdings.
**Fix:** Use `db.execute('BEGIN IMMEDIATE TRANSACTION')` for buy/sell operations.

### 1.9 MEDIUM — UTC Date Computation Mismatch

**Files:** `src/services/financeService.ts:467`, `src/components/QuickTransaction.tsx:45,89`, `src/services/netWorthService.ts:21`
**Description:** `new Date().toISOString().split('T')[0]` computes the date in UTC, not the user's local timezone. For users in timezones ahead of UTC (e.g., UTC-5 Paraguay), at 10 PM local the computed "today" is already tomorrow. The accrual engine would accrue for a date that hasn't started locally.
**Fix:** Use `new Date(new Date().toLocaleDateString('en-CA'))` or a local date helper.

### 1.10 MEDIUM — `netWorthService` 24h Throttle Can Suppress Daily Snapshots

**File:** `src/services/netWorthService.ts:31-36`
**Description:** The throttle compares `Date.now()` against the previous snapshot's midnight-UTC timestamp. If the last snapshot was at 11:59 PM UTC and the next call is at 12:01 AM UTC the next day, only 2 minutes elapsed — the throttle blocks the computation even though a new calendar day has started.
**Fix:** Compare calendar dates, not elapsed milliseconds.

### 1.11 MEDIUM — `dbPendingPromise` Never Cleared on Rejection

**File:** `src/db.ts:136-138`
**Description:** If the initialization promise rejects, `dbPendingPromise = null` (line 137) is never reached. Every subsequent call to `getDb()` returns the same rejected promise, making the connection unrecoverable.
**Fix:** Wrap in `try/finally` to ensure cleanup: `try { result = await dbPendingPromise; } finally { dbPendingPromise = null; }`.

### 1.12 MEDIUM — Transaction Rollback Failure Swallows Original Error

**Files:** `src/services/financeService.ts:195-198, 283-286, 351-354, 419-422, 516-519, 950-953`
**Description:** Every `catch` block does `await db.rollbackTransaction(); throw e`. If `rollbackTransaction()` itself throws, the original exception is lost.
**Fix:** Use `catch` + `finally` pattern, or wrap rollback in its own try/catch.

### 1.13 LOW — `SankeyDiagramData.nodes` Type Drops `color` Property

**File:** `src/services/financeService.ts:607`
**Description:** `nodes` is typed as `Array<{ name: string }>` but the function pushes objects with `color`. Consumers cannot access `color` without type assertion.
**Fix:** Add `color?: string` to the node type.

### 1.14 LOW — `VALID_CASH_TYPES` Duplicated with Sankey Hardcoded Types

**File:** `src/services/financeService.ts:48-51, 663`
**Description:** `VALID_CASH_TYPES` array exists but the Sankey query hardcodes `ct.type IN ('income', 'expense', 'charge')` separately. If a new type is added, both locations need independent updates.
**Fix:** Reference `VALID_CASH_TYPES` or a shared constant.

---

## 2. UI/UX

### 2.1 HIGH — CashFlow "This Month" Shows Wrong Month After Interaction

**File:** `src/pages/CashFlow.tsx:76, 86-92`
**Description:** When `periodMode` is `'thisMonth'`, the period uses `selectedMonth` state. If the user switches to "Specific Month", picks a different month (e.g., March), then switches back to "This Month", `selectedMonth` remains at the previously selected value. "This Month" shows March data instead of the actual current month.
**Fix:** Reset `selectedMonth` when switching to `thisMonth`, or compute the month directly from `new Date()` in the `period` memo when `periodMode === 'thisMonth'`.

### 2.2 HIGH — Settings Error Messages Display in Green (Same as Success)

**File:** `src/pages/Settings.tsx:66-67, 213`
**Description:** Error messages from `handleSave` are displayed with `text-emerald-600 dark:text-emerald-400`, identical to success messages. "Failed to save" appears as green text. The refresh message color check uses `includes('failed')` which is case-sensitive and fragile.
**Fix:** Use `text-rose-600 dark:text-rose-400` for error messages. Use `type` state instead of string matching.

### 2.3 HIGH — Settings Initial Load Failure Leaves Spinner With No Error

**File:** `src/pages/Settings.tsx:46-47`
**Description:** If `getSettings()` or `getMarketDataStatus()` fails, the error is only logged to console. The `finally` block sets loading to false but no error state is set. The page shows an empty state with no error message or retry option.
**Fix:** Add error state handling in the catch block.

### 2.4 HIGH — AccountDetails Non-Numeric Account ID Gives Silent Blank Page

**File:** `src/pages/AccountDetails.tsx:44`
**Description:** `parseInt(id || '0')` gives `0` for non-numeric params. `loadData()` returns early when `accountId` is falsy (0), leaving the page in a perpetual loading state with no error message for routes like `/accounts/abc`.
**Fix:** Check for NaN after parseInt and set an error message.

### 2.5 HIGH — Home Chart Grid Lines Invisible in Dark Mode

**File:** `src/pages/Home.tsx:392`
**Description:** `CartesianGrid` has hardcoded light-mode stroke `stroke="#e4e4e7"`. In dark mode, the grid lines are nearly invisible against the dark background.
**Fix:** Use conditional stroke based on theme.

### 2.6 MEDIUM — Transactions Filter Changes: No Loading Indicator, No Race Protection

**File:** `src/pages/Transactions.tsx:83-87`
**Description:** Filter changes trigger re-fetch with no loading indicator. No `cancelled` flag means rapid filter changes can complete out of order, showing stale data from an earlier request.
**Fix:** Add loading state for filter-triggered re-fetches. Add `cancelled` flag in the filter effect.

### 2.7 MEDIUM — AccountDetails Sequential Price Fetching (N+1)

**File:** `src/pages/AccountDetails.tsx:138-144`
**Description:** Market prices are fetched sequentially with individual `await` calls in a `for...of` loop. For many holdings, this is very slow.
**Fix:** Use `Promise.allSettled()`.

### 2.8 MEDIUM — Sankey Diagram Fixed 800px Width (Not Responsive)

**File:** `src/pages/CashFlow.tsx:255`
**Description:** `<Sankey width={800}>` overflows on mobile screens.
**Fix:** Use a responsive container or measure parent width.

### 2.9 MEDIUM — `importExportService` Row-by-Row Inserts Without Batching

**File:** `src/services/importExportService.ts:300`
**Description:** Each row is inserted with an individual `db.run()` call. For large imports, this creates thousands of round-trips.
**Fix:** Use batch inserts with parameterized `INSERT INTO ... VALUES (...), (...), (...)`.

### 2.10 MEDIUM — Non-Migrations Not Atomic

**File:** `src/db/migrate.ts:207-227, 237-292`
**Description:** Table recreation in v1→v2 and v3→v4 migrations drop and recreate tables without wrapping the sequence in a transaction. A crash between `DROP TABLE` and `RENAME` permanently loses data.
**Fix:** Wrap each migration step in a transaction.

### 2.11 LOW — QuickTransaction Redundant Ternary (Dead Code)

**File:** `src/components/QuickTransaction.tsx:131-133`
**Description:** Both branches of the ternary execute identical logic: `accounts.find((a) => a.id === fromAccountId)`.
**Fix:** Simplify to a single expression.

### 2.12 LOW — CashFlow `mountedRef` Set But Never Read

**File:** `src/pages/CashFlow.tsx:94`
**Description:** `mountedRef` is declared and set to `true` but never read anywhere.
**Fix:** Remove it.

### 2.13 LOW — Health.tsx `animate-pulse` Never Stops

**File:** `src/pages/Health.tsx:64`
**Description:** The `Database` icon pulses indefinitely even after connection status resolves.
**Fix:** Stop pulsing once status is determined.

### 2.14 LOW — Accounts.tsx `resetForm` Clears Page-Level Error

**File:** `src/pages/Accounts.tsx:119`
**Description:** `resetForm()` calls `setError('')`, clearing any displayed load error when the create modal opens.
**Fix:** Don't clear page-level error in resetForm.

### 2.15 LOW — Accounts.tsx `openingBalance` Inconsistent Initial State

**File:** `src/pages/Accounts.tsx:57 vs 115`
**Description:** Initial state is `''` but `resetForm()` sets it to `'0'`. After form reset, the field shows `"0"` instead of empty.
**Fix:** Make both use the same initial value.

---

## 3. Security

### 3.1 LOW — SQL Table Name Interpolation (Defense-in-Depth)

**File:** `src/services/importExportService.ts:268`
**Description:** `DELETE FROM ${tableName}` interpolates a string directly into SQL. Source is the hardcoded `TABLE_ORDER` constant, so no active vulnerability. Fragile if future developers add user-controlled values.
**Status:** Acceptable risk. Noted for defense-in-depth.

---

## 4. Accessibility

### 4.1 HIGH — No `aria-current="page"` on Active Nav Links

**File:** `src/App.tsx:110-112, 193-195, 223-225`
**Description:** Active navigation links in the mobile Sidebar, DesktopSidebar, and BottomTabs use visual highlighting but none set `aria-current="page"`. Screen readers cannot determine which page is active.

### 4.2 HIGH — QuickTransaction Modal Missing ARIA and Keyboard Support

**File:** `src/components/QuickTransaction.tsx:253`
**Description:** The modal has no `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby`. No focus trapping. No Escape key handler. Keyboard users can Tab behind the overlay.

### 4.3 MEDIUM — Multiple Forms Missing `label`/`htmlFor` Associations

**Files:** `src/components/QuickTransaction.tsx` (all form controls), `src/pages/AccountDetails.tsx`, `src/pages/Accounts.tsx`, `src/pages/Settings.tsx`
**Description:** Form inputs and selects have visual labels but no `id`/`htmlFor` associations, breaking programmatic label linkage for screen readers and autofill.

### 4.4 MEDIUM — Sort Column Headers Not Keyboard Accessible

**File:** `src/pages/Transactions.tsx:306-346`
**Description:** Sortable `<th>` elements have `onClick` but no keyboard event handler and no `role="button"` indicator.

### 4.5 LOW — Theme Toggle Missing `aria-label`

**File:** `src/App.tsx:63-69`
**Description:** The `ThemeToggle` button has a `title` attribute but no `aria-label`. Title is not reliably announced by screen readers.

### 4.6 LOW — Bottom Tabs Visible on Desktop

**File:** `src/App.tsx:219`
**Description:** `BottomTabs` is always visible at `sm+` breakpoints where the `DesktopSidebar` also provides navigation. The `sm:pb-6` removes padding but the fixed bottom bar still overlaps content.
**Fix:** Hide `BottomTabs` on `sm+` screens.

---

## 5. Code Quality

### 5.1 MEDIUM — 5 `eslint-disable` Comments

| File | Rule | Reason |
|------|------|--------|
| `CashFlow.tsx` | `@typescript-eslint/no-explicit-any` | Recharts Sankey node casting |
| `Transactions.tsx` | `react-hooks/exhaustive-deps` | Filter-change effect |
| `ThemeProvider.tsx` | `react-hooks/exhaustive-deps` | Mount-only effect |
| `AccountDetails.tsx` | `react-hooks/set-state-in-effect` | Async loadData in useEffect |
| `AccountDetails.tsx` | `react-hooks/exhaustive-deps` | accountId-only dep |

### 5.2 MEDIUM — Test Coverage ~15%

Only 4 of 26+ exported functions are tested (partially). Zero coverage for: `netWorthService`, `marketService`, `importExportService`, `migrate`, all 8 repos, `utils`. Critical untested functions: `buySecurity`, `sellSecurity`, `chargeCreditCard`, `payCreditCard`, `transferBetweenAccounts`, `runAccrualEngine`, `addCashTransaction`.

### 5.3 LOW — `oxlint` DevDependency Unused

**File:** `package.json:52`
**Description:** `oxlint` is installed but no script runs it. The `lint` script uses `eslint`.

### 5.4 LOW — `autoprefixer`/`postcss` Redundant With Tailwind v4

**File:** `package.json:45,53`
**Description:** With `@tailwindcss/vite` plugin, autoprefixer is built in and PostCSS is not needed separately.

### 5.5 LOW — Missing `test:coverage` Script

**Description:** No script for running test coverage. Given low coverage, this is a gap.

### 5.6 LOW — `db.ts` Database Name Inconsistency

**File:** `src/db.ts:81 vs 125`
**Description:** Line 81 uses `'finance.db'` but the error message at line 125 says `'vantor.db'`. Cosmetic but misleading during debugging.

### 5.7 LOW — `types.ts` `linked_transaction_id` Type Inconsistency

**File:** `src/db/types.ts:72`
**Description:** `linked_transaction_id?: number | null` has `?` (optional) in addition to `null`. All other nullable FKs use just `number | null` without `?`. The DB always returns `null`, never `undefined`.

### 5.8 LOW — `types.ts` Stale JSDoc for `opening_balance`

**File:** `src/db/types.ts:29`
**Description:** Comment says "For credit_card, it's the credit limit" but credit cards now have a separate `credit_limit` column.

### 5.9 LOW — Settings Typed Setter Helpers Redundant

**File:** `src/db/repos/SettingsRepo.ts:59-69`
**Description:** `setStockApiKey()`, `setFxApiKey()`, `setBaseCurrency()` duplicate the generic `update()` method. `setTheme()` is missing despite being a valid column.

### 5.10 LOW — `NetWorthSnapshotRepo.update()` Never Called

**File:** `src/db/repos/NetWorthSnapshotRepo.ts:46-58`
**Description:** `upsertByDate()` is the idempotent write path. The generic `update()` has no callers.

### 5.11 LOW — No React Error Boundary

**File:** `src/App.tsx:293-316`
**Description:** No React error boundary wraps the routes. A render error in any page crashes the entire app with a white screen.

---

## Summary — Prioritized Fix List

### Critical (data corruption / broken features)

| # | Finding | File | Fix Complexity |
|---|---------|------|---------------|
| 1.1 | AccountRepo `VALID_COLUMNS` missing columns — accrual duplicates | `AccountRepo.ts:42` | Low — expand set |
| 1.2 | HoldingRepo `VALID_COLUMNS` has phantom columns | `HoldingRepo.ts:25` | Low — fix set |
| 1.3 | `SCHEMA_VERSION = 5` — v6 indexes never created | `migrate.ts:5` | Low — change to 6 |
| 1.4 | `computeNetWorth` cross-currency totals incomplete | `financeService.ts:840-860` | Medium — add dual conversion |

### High (race conditions / wrong data / broken UX)

| # | Finding | File | Fix Complexity |
|---|---------|------|---------------|
| 1.5 | N+1 queries in `computeNetWorth` | `financeService.ts:820-828` | Medium — batch |
| 1.6 | `sellSecurity` position check outside transaction | `financeService.ts:917-924` | Low — move inside |
| 1.7 | `chargeCreditCard` limit check outside transaction | `financeService.ts:261-268` | Low — move inside |
| 1.8 | `buySecurity` needs IMMEDIATE transaction | `financeService.ts:149` | Low — change BEGIN |
| 2.1 | CashFlow "This Month" shows wrong month | `CashFlow.tsx:76` | Low — reset state |
| 2.2 | Settings error messages in green | `Settings.tsx:66` | Low — change color |
| 2.3 | Settings load failure → stuck spinner | `Settings.tsx:46` | Low — add error state |
| 2.4 | AccountDetails non-numeric ID → blank page | `AccountDetails.tsx:44` | Low — add NaN check |
| 2.5 | Home chart grid invisible in dark mode | `Home.tsx:392` | Low — theme stroke |
| 4.1 | No `aria-current="page"` on nav links | `App.tsx` | Low — add attribute |
| 4.2 | QuickTransaction modal missing ARIA/keyboard | `QuickTransaction.tsx:253` | Medium — add dialog attrs, focus trap, Escape |
| 1.11 | `dbPendingPromise` never cleared on rejection | `db.ts:136` | Low — try/finally |

### Medium (performance / UX gaps / code quality)

| # | Finding | File | Fix Complexity |
|---|---------|------|---------------|
| 1.9 | UTC date computation mismatch | Multiple | Low — local date helper |
| 1.10 | netWorthService 24h throttle suppresses snapshots | `netWorthService.ts:31` | Low — compare dates |
| 1.12 | Rollback failure swallows original error | `financeService.ts` (6 places) | Low — try/catch around rollback |
| 2.6 | Transactions filter changes no loading/race protection | `Transactions.tsx:83` | Medium |
| 2.7 | AccountDetails sequential price fetching | `AccountDetails.tsx:138` | Low — Promise.allSettled |
| 2.8 | Sankey fixed 800px width | `CashFlow.tsx:255` | Low — responsive |
| 2.9 | Row-by-row imports without batching | `importExportService.ts:300` | Medium — batch insert |
| 2.10 | Non-atomic migrations | `migrate.ts:207-227` | Low — wrap in tx |
| 4.3 | Forms missing label/htmlFor | Multiple | Low — add id/htmlFor |
| 5.1 | 5 eslint-disable comments | Various | Low |
| 5.2 | Test coverage ~15% | `__tests__/` | High — Phase 12 |
| 1.13 | Sankey node type drops color | `financeService.ts:607` | Low |
| 1.14 | VALID_CASH_TYPES duplicated | `financeService.ts:48,663` | Low — share constant |

### Low (tech debt / minor)

| # | Finding | File |
|---|---------|------|
| 1.14 | VALID_CASH_TYPES duplicated with Sankey | `financeService.ts:48,663` |
| 2.11 | QuickTransaction redundant ternary | `QuickTransaction.tsx:131` |
| 2.12 | CashFlow mountedRef unused | `CashFlow.tsx:94` |
| 2.13 | Health animate-pulse never stops | `Health.tsx:64` |
| 2.14 | Accounts resetForm clears error | `Accounts.tsx:119` |
| 2.15 | Accounts openingBalance inconsistent init | `Accounts.tsx:57` |
| 4.4 | Sort headers not keyboard accessible | `Transactions.tsx:306` |
| 4.5 | Theme toggle missing aria-label | `App.tsx:63` |
| 4.6 | Bottom tabs visible on desktop | `App.tsx:219` |
| 5.3 | oxlint unused devDependency | `package.json:52` |
| 5.4 | autoprefixer/postcss redundant | `package.json:45,53` |
| 5.5 | No test:coverage script | `package.json` |
| 5.6 | db.ts name inconsistency | `db.ts:81,125` |
| 5.7 | types.ts nullable `?` inconsistency | `types.ts:72` |
| 5.8 | types.ts stale JSDoc | `types.ts:29` |
| 5.9 | Settings typed setters redundant | `SettingsRepo.ts:59` |
| 5.10 | NetWorthSnapshotRepo.update() unused | `NetWorthSnapshotRepo.ts:46` |
| 5.11 | No React error boundary | `App.tsx:293` |
| 3.1 | SQL table name interpolation | `importExportService.ts:268` |
