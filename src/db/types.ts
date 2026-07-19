// ─── Primitive / union types ──────────────────────────────────────────────────

export type AccountType = 'bank' | 'broker' | 'mutual_fund' | 'credit_card';
export type Currency = 'PYG' | 'USD';
export type SecurityTransactionType = 'buy' | 'sell';
export type CashTransactionType =
  | 'income'
  | 'expense'
  | 'deposit'
  | 'withdrawal'
  | 'interest_accrual'
  | 'buy_debit'
  | 'sell_credit'
  | 'charge'
  | 'payment';

// ─── Entity interfaces ────────────────────────────────────────────────────────

/**
 * Represents a financial account (bank, broker, or mutual-fund).
 * Dates are ISO-8601 strings (YYYY-MM-DD).
 */
export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: Currency;
  institution: string;
  /** For broker accounts this is the opening cash balance. For credit_card, it's the credit limit. */
  opening_balance: number;
  opening_date: string;
  /** Annualised yield rate – mutual_fund only, null otherwise. */
  yield_rate: number | null;
  /** Date of the last accrual run – mutual_fund only, null otherwise. */
  last_accrual_date: string | null;
  /** Credit limit – credit_card only, null otherwise. */
  credit_limit: number | null;
}

/** One row per security position inside a broker account. */
export interface Holding {
  id: number;
  account_id: number;
  symbol: string;
  currency: Currency;
  market: string;
}

/** Individual buy / sell trade on a holding. */
export interface SecurityTransaction {
  id: number;
  holding_id: number;
  type: SecurityTransactionType;
  quantity: number;
  price: number;
  commission: number;
  occurred_at: string; // ISO datetime
  created_at?: string; // audit timestamp (DB-managed)
}

/** Cash ledger entry – covers all account types. */
export interface CashTransaction {
  id: number;
  account_id: number;
  type: CashTransactionType;
  amount: number;
  tag_id: number | null;
  description: string;
  occurred_at: string; // ISO datetime
  /** Set for buy_debit / sell_credit rows; links back to the trade. */
  related_security_transaction_id: number | null;
  /** Links paired transfers: credit card payment↔withdrawal, or account-to-account transfers. */
  linked_transaction_id?: number | null;
  created_at?: string; // audit timestamp (DB-managed)
}

export interface Tag {
  id: number;
  name: string;
  /** CSS hex colour, e.g. '#f59e0b'. */
  color: string;
  /** 0 = system default, 1 = user-created. */
  is_custom: 0 | 1;
}

/** Snapshot of a foreign-exchange rate at a point in time. */
export interface FxRate {
  id: number;
  base: string;
  quote: string;
  rate: number;
  fetched_at: string; // ISO datetime
}

/** Snapshot of a security's price at a point in time. */
export interface SecurityPrice {
  id: number;
  symbol: string;
  price: number;
  currency: Currency;
  fetched_at: string; // ISO datetime
}

/** Periodic net-worth snapshot for charting / reporting. */
export interface NetWorthSnapshot {
  id: number;
  total_pyg: number;
  total_usd: number;
  /** JSON-encoded per-account breakdown. */
  breakdown_json: string;
  snapshot_date: string; // YYYY-MM-DD
}

/** Singleton app settings row (always id = 1). */
export interface Settings {
  id: number;
  stock_api_key: string;
  fx_api_key: string;
  base_currency: Currency;
  theme: 'light' | 'dark' | 'system';
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export interface DateRangeOpts {
  /** Inclusive lower bound – ISO date or datetime. */
  from?: string;
  /** Inclusive upper bound – ISO date or datetime. */
  to?: string;
}
