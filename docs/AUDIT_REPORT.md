# Vantor — Comprehensive Audit Report

**Date:** 2026-07-18 (updated)
**Scope:** Phases 15–19 complete codebase. Four areas: Functional Correctness, UI/UX, Security, Best Practices / Code Quality
**Method:** Automated parallel sweep of all source files in `src/`, cross-referenced with `docs/ARCHITECTURE.md`

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-07-18 | Initial audit |
| 2026-07-18 | Fixed: 1.1, 1.4, 1.6, 1.7, 1.16, 2.1, 2.3, 2.4, 2.5, 2.6, 2.8, 3.1, 3.3, 4.1, 4.2, 4.3, 4.6, 4.7, 4.8, 4.9, dashboard card navigation |
| 2026-07-18 | New findings: 2.13 (AccountDetails useEffect/loadData duplication), 2.14 (select focus ring consistency) |
| 2026-07-18 | Fixed round 2: ~~1.2~~, ~~1.3~~, ~~2.2~~, ~~2.3~~, ~~2.4~~, ~~2.5~~, ~~3.1~~, ~~3.2~~ |

---

## 1. Functional Correctness Against Spec

### 1.1 PASS — Buy Flow: Negative-Cash Check Location

**File:** `src/services/financeService.ts:105-187`
**Status:** The buy flow is wrapped in a single SQLite transaction (BEGIN/COMMIT/ROLLBACK). The negative-cash check occurs after inserting the `buy_debit` but before COMMIT. If `runningBalance() < 0`, it throws, causing ROLLBACK. Correct pattern (insert-then-verify inside the transaction).

### ~~1.2 MEDIUM — No Input Validation on `addCashTransaction`~~ ✓ FIXED

**File:** `src/services/financeService.ts:63-70`
**Fix:** Added `VALID_CASH_TYPES` array and explicit type validation: `if (!VALID_CASH_TYPES.includes(data.type)) throw new Error(...)`. Verified with lint + tsc.

### ~~1.3 MEDIUM — FX Conversion Silent Fallback to 1:1~~ ✓ FIXED

**File:** `src/services/financeService.ts:624-632`
**Fix:** `getFxConversion()` now returns `{ rate, isFallback }` object. `getCashFlowSankeyData()` tracks fallback usage and returns `usedFallbackFx` flag. CashFlow.tsx displays an amber warning banner when fallback rates are used.

### 1.4 MEDIUM — `getCardDebtBalance` Uses Different Sign Convention Than `runningBalance`

**File:** `src/services/financeService.ts:196-221` vs `src/db/repos/CashLedgerRepo.ts:118-152`
**Description:** `runningBalance()` treats `charge` as negative and `payment` as positive. `getCardDebtBalance()` uses a separate SQL that treats charges as positive and payments as negative, wrapping the result in `Math.abs()`. The two functions can give different results for the same account. This works in practice because the UI uses `getCardDebtBalance()` for credit cards and `getCashBalance()` for others, but the inconsistency is fragile.
**Suggested Fix:** Document the convention clearly. Consider unifying into a single function with a parameter.

### 1.5 PASS — Average Cost Recalculation on Buy

**File:** `src/db/repos/SecurityLedgerRepo.ts:122-145`
**Status:** Correct. `average_cost = total buy cost / total buy quantity`. Sells do not affect average cost. Matches standard weighted-average cost basis.

### 1.6 PASS — Quantity-Only Reduction on Sell

**File:** `src/db/repos/SecurityLedgerRepo.ts:142`
**Status:** Correct. `net_quantity = buyQty - sellQty`. Average cost uses only buy totals.

### 1.7 PASS — Accrual Engine Formula

**File:** `src/services/financeService.ts:445-504`
**Status:** Formula is correct: `dailyRate = (1 + yield_rate/100)^(1/365) - 1`, compounded via `balance * ((1 + dailyRate)^days - 1)`.

### 1.8 PASS — Accrual Engine Double-Apply Protection

**File:** `src/services/financeService.ts:459`
**Status:** Correct. `if (lastAccrual >= today) continue;` prevents double-apply. `last_accrual_date` is updated atomically within the same transaction.

### 1.9 PASS — Buy/Sell Atomicity

**Status:** Both `buySecurity()` and `sellSecurity()` use `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` wrapping all inserts. Both insert security + cash transactions within the same transaction. Correct.

### 1.10 PASS — Balances Are Never Set Directly

**Status:** All balances are derived from ledger queries (`runningBalance`, `netPosition`). No denormalized balance column exists. `opening_balance` is the only directly-set value, and it is the initial seed for derivation.

### 1.11 PASS — Sankey Balancing/Deficit Logic

**File:** `src/services/financeService.ts:712-731`
**Status:** Savings or Deficit node ensures diagram balances. Correct.

### ~~1.12 LOW — QuickTransaction Shows `opening_balance` Instead of Current Balance~~ ✓ FIXED

**File:** `src/components/QuickTransaction.tsx:342-346`
**Fix:** Already uses `balanceMap.get(selectedAccount.id) ?? 0` from `getCashBalanceBatch()`. Verified: balance display is correct.

---

## 2. UI/UX

### 2.1 HIGH — Desktop Sidebar Navigation Hidden

**File:** `src/App.tsx:171`
**Description:** The hamburger menu that opens the sidebar (containing Transactions, Cash Flow, DB Health) is `sm:hidden` — it disappears on desktop. There is no desktop sidebar. On tablet/desktop, these three sections are effectively inaccessible.
**Suggested Fix:** Show a persistent sidebar on `sm:` breakpoint, or add these items to the bottom tab bar.

### ~~2.2 MEDIUM — Touch Targets Below 44px Minimum~~ ✓ FIXED

| Element | File:Line | Before | After |
|---------|-----------|--------|-------|
| Export button | `Home.tsx` | 28px (`size: 'sm'`) | 44px (`min-h-[44px]`) |
| Import button | `Home.tsx` | 28px (`size: 'sm'`) | 44px (`min-h-[44px]`) |
| Sell Position button | `AccountDetails.tsx` | 24px (`size: 'xs'`) | 44px (`size: 'sm'` + `min-h-[44px]`) |
| Account Edit button | `Accounts.tsx:411` | 36px | 44px |
| Account Delete button | `Accounts.tsx:418` | 36px | 44px |

Remaining below 44px: bottom tab items (~36px), theme toggle (32px). These are icon-only in fixed containers where size increase is constrained by layout.

### ~~2.3 LOW — CashFlow Summary Uses Abbreviated Format Without Currency Symbol~~ ✓ FIXED

**File:** `src/pages/CashFlow.tsx:213-241`
**Fix:** Summary cards (Income, Expenses, Net) now use `formatMoney(value, baseCurrency)` instead of `formatAmount(value) + baseCurrency`. Sankey tooltip still uses `formatAmount()` for compact representation (appropriate for diagram nodes).

### ~~2.4 LOW — Transactions Page Lacks Summary Context~~ ✓ FIXED

**File:** `src/pages/Transactions.tsx:156-176`
**Fix:** Subtitle now dynamically reflects active filters: shows account name, transaction type, tag name, and/or date range. Falls back to "All cash transactions across your accounts" when no filters are active.

### ~~2.5 MEDIUM — AccountDetails useEffect/loadData Duplication~~ ✓ FIXED

**File:** `src/pages/AccountDetails.tsx:97-172`
**Fix:** Refactored `loadData` to accept an optional `AbortSignal`. The `useEffect` now creates an `AbortController`, calls `loadData(controller.signal)`, and aborts on cleanup. Single source of truth, no duplication. Lint rule `react-hooks/set-state-in-effect` suppressed inline (false positive — setState happens async, not synchronously).

### 2.6 PASS — Currency Formatting

`formatMoney()` in `src/lib/utils.ts` correctly handles PYG (no decimals, `Gs.` prefix) and USD (2 decimals, `$` prefix) via `Intl.NumberFormat`.

### 2.7 PASS — Empty/Loading/Error States

| Page | Empty | Loading | Error |
|------|-------|---------|-------|
| Home | YES | YES | YES |
| Accounts | YES | YES | YES |
| AccountDetails | YES | YES | YES |
| Transactions | YES | YES | YES |
| CashFlow | YES | YES | YES |
| Health | N/A | YES | YES |

---

## 3. Security

### ~~3.1 MEDIUM — No Future-Dated Transaction Validation~~ ✓ FIXED

**File:** `src/pages/AccountDetails.tsx` (charge, payment, cash transaction forms)
**Fix:** Added inline amber warning ("This date is in the future.") below all three date inputs when the selected date exceeds today. Non-blocking — warns but allows submission.

### ~~3.2 MEDIUM — Dynamic SET Clause Column Names Not Runtime-Validated~~ ✓ FIXED

**Files:** All 7 repo `update()` methods
**Fix:** Each repo now has a `private static VALID_COLUMNS = new Set([...])` allowlist. The `Object.entries(data).filter()` now checks `[col, v] => v !== undefined && Repo.VALID_COLUMNS.has(col)`. Unknown column names are silently dropped. Repos fixed: AccountRepo, HoldingRepo, TagRepo, CashLedgerRepo, SecurityLedgerRepo, NetWorthSnapshotRepo, SettingsRepo.

### 3.3 LOW — `DELETE FROM ${tableName}` String Interpolation

**File:** `src/services/importExportService.ts:257`
**Description:** Table name comes from the hardcoded `TABLE_ORDER` constant, never from user input. Not exploitable. Noted for defense-in-depth.
**Suggested Fix:** Optional allowlist check against `TABLE_ORDER`.

### 3.4 PASS — All SQL Is Parameterized

Grep for string-concatenated query values found zero instances. All user-provided values use `?` placeholders. Column names in dynamic SET clauses are TypeScript-constrained.

### 3.5 PASS — API Keys Not Logged

No `console.log` statements in production code. All 20 `console.error` calls log only error objects, never API keys or secrets.

### 3.6 PASS — API Keys Not in Build Artifacts

API keys are stored only in the SQLite database at runtime. Never embedded in source code, environment variables, or bundled files.

### 3.7 PASS — Export Contains Only User Data

No debug data, seed data, or sample data is exported beyond what exists in the database.

### 3.8 PASS — Data-at-Rest Encryption (Phase 19)

- `capacitor.config.ts`: `androidIsEncryption: true` ✓
- `src/db.ts:31-35`: Passphrase generated via `crypto.getRandomValues(new Uint8Array(32))` — cryptographically random 256-bit ✓
- `src/db.ts:90-92`: Stored via `sqliteConnection.setEncryptionSecret()` which uses Android Keystore ✓
- `src/db.ts:84-85`: Browser mode documented as unencrypted in code comments ✓
- `docs/ARCHITECTURE.md`: Encryption section documents browser-mode limitation ✓
- Verified on emulator: pulled `.db` file has SQLCipher header (`8e12 9bfb`), not standard SQLite header ✓

---

## 4. Best Practices / Code Quality

### 4.1 MEDIUM — Direct DB Calls Bypassing Repository Layer

**File:** `src/services/financeService.ts`
**Description:** Three functions use `db.query()` directly for multi-table JOINs:
- `getCardDebtBalance()` (line 204)
- `getAllCashTransactions()` (line 555)
- `getCashFlowSankeyData()` (line 637)

These queries are not expressible through single-table repository methods, but they break architectural separation.
**Suggested Fix:** Move these queries into `CashLedgerRepo` as named methods (e.g., `findAllWithJoins(filter)`, `findForSankeyPeriod(from, to)`).

### 4.2 MEDIUM — Transaction Boundaries Not Supported by Repository Abstraction

**Files:** All service files that use `BEGIN/COMMIT/ROLLBACK`
**Description:** Every multi-step atomic operation (`buySecurity`, `sellSecurity`, `payCreditCard`, `transferBetweenAccounts`, `chargeCreditCard`, `runAccrualEngine`, `commitImport`) calls `db.execute('BEGIN/COMMIT/ROLLBACK')` directly. The repository layer has no transaction utility.
**Suggested Fix:** Add a `db.transaction(fn)` utility to the repository layer.

### 4.3 LOW — `idx_cash_transactions_linked` Created But Never Queried

**File:** `src/db/migrate.ts:288`
**Description:** The index on `linked_transaction_id` is created in migration v4, but no repository method or service function ever queries `WHERE linked_transaction_id = ?`.
**Suggested Fix:** Keep for future use, or remove if not planned.

### 4.4 LOW — `eslint-disable` Comments

| File | Rule Disabled |
|------|---------------|
| `CashFlow.tsx` | `@typescript-eslint/no-explicit-any` (Recharts Sankey node casting) |
| `Transactions.tsx` | `react-hooks/exhaustive-deps` (filter-change effect) |
| `ThemeProvider.tsx` | `react-hooks/exhaustive-deps` (mount-only effect) |
| `AccountDetails.tsx` | `react-hooks/set-state-in-effect` (async loadData in useEffect) |
| `AccountDetails.tsx` | `react-hooks/exhaustive-deps` (accountId-only dep) |

### 4.5 PASS — No TODO/FIXME/HACK/XXX Comments

All source files searched. Codebase is clean of deferred work markers.

### 4.6 PASS — No Unused Imports

All imports across all files are actively referenced.

### 4.7 PASS — `pnpm audit` Clean

```
No known vulnerabilities found
```

### 4.8 PASS — No Suspicious Dependencies

All packages are legitimate and well-known. No typosquatted names. No postinstall scripts.

### 4.9 PASS — ARCHITECTURE.md Encryption Documentation

`docs/ARCHITECTURE.md` documents the encryption design, how it works, and the browser-mode limitation. The in-app Health page also shows encryption status.

---

## Summary — Prioritized Fix List

### High (fix before next feature work)

| # | Finding | File | Fix Complexity |
|---|---------|------|---------------|
| 2.1 | Desktop sidebar navigation hidden | `App.tsx:171` | Medium — redesign nav |

### Medium (address in next sprint)

| # | Finding | File | Fix Complexity |
|---|---------|------|---------------|
| ~~1.2~~ | ~~No type validation on addCashTransaction~~ | ~~`financeService.ts:48`~~ | ~~Low~~ ✓ |
| ~~1.3~~ | ~~FX fallback silent~~ | ~~`financeService.ts:613-621`~~ | ~~Low~~ ✓ |
| 1.4 | Credit card sign convention inconsistency | `financeService.ts` | Low — document |
| ~~2.2~~ | ~~Touch targets below 44px~~ | ~~Multiple~~ | ~~Low~~ ✓ |
| ~~2.5~~ | ~~AccountDetails useEffect/loadData duplication~~ | ~~`AccountDetails.tsx`~~ | ~~Low~~ ✓ |
| ~~3.1~~ | ~~No future-dated transaction validation~~ | ~~`financeService.ts`~~ | ~~Low~~ ✓ |
| ~~3.2~~ | ~~Unvalidated column names in SET~~ | ~~7 repos~~ | ~~Low~~ ✓ |
| 4.1 | Raw SQL bypasses repo layer | `financeService.ts` | Medium |
| 4.2 | Transaction boundaries not in repo | All services | Medium |

### Low (tech debt / nice-to-have)

| # | Finding | File |
|---|---------|------|
| ~~1.12~~ | ~~QuickTransaction shows opening_balance~~ | ~~`QuickTransaction.tsx:329`~~ ✓ |
| ~~2.3~~ | ~~CashFlow abbreviated format inconsistency~~ | ~~`CashFlow.tsx:69-73`~~ ✓ |
| ~~2.4~~ | ~~Transactions page lacks summary~~ | ~~`Transactions.tsx:156`~~ ✓ |
| 3.3 | `DELETE FROM ${tableName}` interpolation | `importExportService.ts:257` |
| 4.3 | Unused `linked_transaction_id` index | `migrate.ts:288` |
| 4.4 | `eslint-disable` comments (5 total) | Various |
