import { getRepos, getDb } from '@/db';
import type {
  Account,
  Holding,
  SecurityTransaction,
  CashTransaction,
  CashTransactionType,
  Tag,
  Settings,
} from '@/db';
import { displayTag } from '@/lib/utils';

export interface HoldingWithStats extends Holding {
  quantity: number;
  averageCost: number;
  totalCost: number;
}

// ─── Account Services ─────────────────────────────────────────────────────────

export async function getAccounts(): Promise<Account[]> {
  const repos = await getRepos();
  return repos.accounts.findAll();
}

export async function getAccountById(id: number): Promise<Account | undefined> {
  const repos = await getRepos();
  return repos.accounts.findById(id);
}

export async function createAccount(data: Omit<Account, 'id'>): Promise<number> {
  const repos = await getRepos();
  return repos.accounts.create(data);
}

export async function updateAccount(id: number, data: Partial<Omit<Account, 'id'>>): Promise<void> {
  const repos = await getRepos();
  return repos.accounts.update(id, data);
}

export async function deleteAccount(id: number): Promise<void> {
  const repos = await getRepos();
  return repos.accounts.remove(id);
}

// ─── Cash Ledger Services ─────────────────────────────────────────────────────

const VALID_CASH_TYPES: CashTransactionType[] = [
  'income', 'expense', 'deposit', 'withdrawal',
  'buy_debit', 'sell_credit', 'payment', 'charge', 'interest_accrual',
];

export async function getCashBalance(accountId: number): Promise<number> {
  const repos = await getRepos();
  return repos.cashLedger.runningBalance(accountId);
}

export async function getCashBalanceBatch(accountIds: number[]): Promise<Map<number, number>> {
  const repos = await getRepos();
  return repos.cashLedger.runningBalanceBatch(accountIds);
}

export async function getCashTransactions(accountId: number): Promise<CashTransaction[]> {
  const repos = await getRepos();
  return repos.cashLedger.findByAccountId(accountId);
}

export async function addCashTransaction(data: Omit<CashTransaction, 'id'>): Promise<number> {
  if (data.amount <= 0) throw new Error('Amount must be greater than zero');
  if (!data.occurred_at) throw new Error('Date is required');
  if (!VALID_CASH_TYPES.includes(data.type)) throw new Error(`Invalid transaction type: ${data.type}`);
  const repos = await getRepos();
  const account = await repos.accounts.findById(data.account_id);
  if (!account) throw new Error('Account not found');
  return repos.cashLedger.create(data);
}

export async function deleteCashTransaction(id: number): Promise<void> {
  const repos = await getRepos();
  return repos.cashLedger.remove(id);
}

// ─── Holdings & Trades Services ───────────────────────────────────────────────

export async function getHoldingsWithStats(accountId: number): Promise<HoldingWithStats[]> {
  const repos = await getRepos();
  const holdings = await repos.holdings.findByAccountId(accountId);

  const holdingIds = holdings.map((h) => h.id);
  const posMap = await repos.securityLedger.netPositionsBatch(holdingIds);

  return holdings.map((holding) => {
    const pos = posMap.get(holding.id) ?? null;
    const quantity = pos?.net_quantity ?? 0;
    const averageCost = pos?.average_cost ?? 0;
    const totalCost = quantity * averageCost;

    return {
      ...holding,
      quantity,
      averageCost,
      totalCost,
    };
  });
}

export async function getSecurityTransactions(accountId: number): Promise<SecurityTransaction[]> {
  const repos = await getRepos();
  return repos.securityLedger.findByAccountId(accountId);
}

/**
 * Record a security buy transaction.
 * Deducts cash from the broker account. Rejects if cash is insufficient.
 */
export async function buySecurity(
  accountId: number,
  symbol: string,
  quantity: number,
  price: number,
  commission: number,
  date: string,
  description?: string,
  market?: string,
): Promise<number> {
  const repos = await getRepos();
  const db = await getDb();

  if (!symbol || symbol.trim().length === 0) throw new Error('Symbol is required');
  if (quantity <= 0) throw new Error('Quantity must be greater than zero');
  if (price <= 0) throw new Error('Price must be greater than zero');
  if (commission < 0) throw new Error('Commission cannot be negative');

  const account = await repos.accounts.findById(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  if (account.type !== 'broker') {
    throw new Error('Can only buy securities in a broker account');
  }

  const totalCost = quantity * price + commission;

  // 1. Execute in a transaction
  await db.beginTransaction();
  try {
    // Find or create holding (inside transaction to prevent duplicates)
    const cleanSymbol = symbol.trim().toUpperCase();
    const allHoldings = await repos.holdings.findByAccountId(accountId);
    let holding = allHoldings.find((h) => h.symbol === cleanSymbol);

    if (!holding) {
      const holdingId = await repos.holdings.create({
        account_id: accountId,
        symbol: cleanSymbol,
        currency: account.currency,
        market: market ?? 'US',
      }, false);
      const newHolding = await repos.holdings.findById(holdingId);
      if (!newHolding) {
        throw new Error('Failed to create holding');
      }
      holding = newHolding;
    }

    // 3. Create security transaction
    const tradeId = await repos.securityLedger.create({
      holding_id: holding.id,
      type: 'buy',
      quantity,
      price,
      commission,
      occurred_at: date,
    }, false);

    // 4. Record buy_debit in cash ledger
    await repos.cashLedger.create({
      account_id: accountId,
      type: 'buy_debit',
      amount: totalCost,
      tag_id: null,
      description: description || `Bought ${quantity} ${cleanSymbol} @ ${price}`,
      occurred_at: date,
      related_security_transaction_id: tradeId,
    }, false);

    // 5. Verify cash balance is not negative (inside the transaction)
    const cashBalance = await repos.cashLedger.runningBalance(accountId);
    if (cashBalance < 0) {
      throw new Error('Insufficient cash for this security purchase');
    }

    await db.commitTransaction();
    return tradeId;
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

// ─── Credit Card Services ─────────────────────────────────────────────────────

/**
 * Compute the current debt balance for a credit card account.
 * Debt = opening_balance + Σ(charge) − Σ(payment).
 * Always returns a positive number representing how much is owed.
 */
export async function getCardDebtBalance(accountId: number): Promise<number> {
  const repos = await getRepos();
  const account = await repos.accounts.findById(accountId);
  if (!account || account.type !== 'credit_card') {
    throw new Error('Account is not a credit card');
  }

  const db = await getDb();
  const result = await db.query(
    `SELECT
       a.opening_balance +
       COALESCE(SUM(
         CASE ct.type
           WHEN 'charge'  THEN  ct.amount
           WHEN 'payment' THEN -ct.amount
           ELSE 0
         END
       ), 0) AS debt
       FROM accounts a
       LEFT JOIN cash_transactions ct ON ct.account_id = a.id
      WHERE a.id = ?
      GROUP BY a.id`,
    [accountId],
  );
  return Math.abs((result.values?.[0] as { debt?: number } | undefined)?.debt ?? 0);
}

/**
 * Charge a credit card account.
 * Rejects if debt balance + amount > credit_limit.
 * Inserts a charge cash_transaction with the given tag.
 */
export async function chargeCreditCard(
  cardAccountId: number,
  amount: number,
  tagId: number,
  description: string,
  date: string,
): Promise<number> {
  const repos = await getRepos();
  const db = await getDb();

  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (!tagId) throw new Error('Tag is required for credit card charges');
  if (!date) throw new Error('Date is required');

  const account = await repos.accounts.findById(cardAccountId);
  if (!account) throw new Error('Account not found');
  if (account.type !== 'credit_card') throw new Error('Account is not a credit card');
  if (!account.credit_limit || account.credit_limit <= 0) {
    throw new Error('This credit card has no credit limit set');
  }

  const currentDebt = await getCardDebtBalance(cardAccountId);
  if (currentDebt + amount > account.credit_limit) {
    throw new Error(
      `Charge would exceed credit limit. Available: ${(account.credit_limit - currentDebt).toLocaleString()}`,
    );
  }

  await db.beginTransaction();
  try {
    const txId = await repos.cashLedger.create({
      account_id: cardAccountId,
      type: 'charge',
      amount,
      tag_id: tagId,
      description: description || 'Credit card charge',
      occurred_at: date,
      related_security_transaction_id: null,
      linked_transaction_id: null,
    }, false);

    await db.commitTransaction();
    return txId;
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/**
 * Pay a credit card from a bank account.
 * One atomic operation: inserts a withdrawal on the bank account and a
 * payment on the card, linked via linked_transaction_id.
 * Bank withdrawal is rejected if it would go negative.
 */
export async function payCreditCard(
  fromBankAccountId: number,
  cardAccountId: number,
  amount: number,
  date: string,
): Promise<void> {
  const repos = await getRepos();
  const db = await getDb();

  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (!date) throw new Error('Date is required');

  const bankAccount = await repos.accounts.findById(fromBankAccountId);
  if (!bankAccount) throw new Error('Source bank account not found');
  if (bankAccount.type !== 'bank') throw new Error('Source account must be a bank account');

  const cardAccount = await repos.accounts.findById(cardAccountId);
  if (!cardAccount) throw new Error('Credit card account not found');
  if (cardAccount.type !== 'credit_card') throw new Error('Target account must be a credit card');

  await db.beginTransaction();
  try {
    // 1. Insert withdrawal on bank account
    const withdrawalId = await repos.cashLedger.create({
      account_id: fromBankAccountId,
      type: 'withdrawal',
      amount,
      tag_id: null,
      description: `Credit card payment to ${cardAccount.name}`,
      occurred_at: date,
      related_security_transaction_id: null,
      linked_transaction_id: null,
    }, false);

    // 2. Insert payment on credit card, linked to the withdrawal
    const paymentId = await repos.cashLedger.create({
      account_id: cardAccountId,
      type: 'payment',
      amount,
      tag_id: null,
      description: `Payment from ${bankAccount.name}`,
      occurred_at: date,
      related_security_transaction_id: null,
      linked_transaction_id: withdrawalId,
    }, false);

    // 3. Link the withdrawal back to the payment
    await repos.cashLedger.update(withdrawalId, { linked_transaction_id: paymentId }, false);

    // 4. Verify bank balance is not negative
    const bankBalance = await repos.cashLedger.runningBalance(fromBankAccountId);
    if (bankBalance < 0) {
      throw new Error('Insufficient funds in bank account for this payment');
    }

    await db.commitTransaction();
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

// ─── Account Transfer Service ─────────────────────────────────────────────────

/**
 * Transfer money between any two of the user's own accounts.
 * Inserts a linked withdrawal/deposit pair, source-balance guarded.
 * Excluded from cash flow (neither income nor expense).
 */
export async function transferBetweenAccounts(
  fromAccountId: number,
  toAccountId: number,
  amount: number,
  date: string,
  description?: string,
): Promise<void> {
  const repos = await getRepos();
  const db = await getDb();

  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (!date) throw new Error('Date is required');
  if (fromAccountId === toAccountId) throw new Error('Cannot transfer to the same account');

  const fromAccount = await repos.accounts.findById(fromAccountId);
  if (!fromAccount) throw new Error('Source account not found');
  const toAccount = await repos.accounts.findById(toAccountId);
  if (!toAccount) throw new Error('Destination account not found');

  await db.beginTransaction();
  try {
    // 1. Insert withdrawal on source account
    const withdrawalId = await repos.cashLedger.create({
      account_id: fromAccountId,
      type: 'withdrawal',
      amount,
      tag_id: null,
      description: description || `Transfer to ${toAccount.name}`,
      occurred_at: date,
      related_security_transaction_id: null,
      linked_transaction_id: null,
    }, false);

    // 2. Insert deposit on destination account, linked to the withdrawal
    const depositId = await repos.cashLedger.create({
      account_id: toAccountId,
      type: 'deposit',
      amount,
      tag_id: null,
      description: description || `Transfer from ${fromAccount.name}`,
      occurred_at: date,
      related_security_transaction_id: null,
      linked_transaction_id: withdrawalId,
    }, false);

    // 3. Link the withdrawal back to the deposit
    await repos.cashLedger.update(withdrawalId, { linked_transaction_id: depositId }, false);

    // 4. Verify source balance is not negative
    const fromBalance = await repos.cashLedger.runningBalance(fromAccountId);
    if (fromBalance < 0) {
      throw new Error('Insufficient funds in source account for this transfer');
    }

    await db.commitTransaction();
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

// ─── Tag Services ────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const repos = await getRepos();
  return repos.tags.findAll();
}

export async function createTag(data: { name: string; color: string }): Promise<number> {
  const repos = await getRepos();
  return repos.tags.create({ name: data.name, color: data.color, is_custom: 1 });
}

// ─── Settings Services ──────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const repos = await getRepos();
  return repos.settings.get();
}

export async function updateSettings(data: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const repos = await getRepos();
  await repos.settings.update(data);
}

// ─── Mutual Fund Accrual Engine ──────────────────────────────────────────────

/**
 * Run the mutual fund interest accrual engine.
 * For each mutual fund account where last_accrual_date < today:
 *  1. Compute elapsed days since last_accrual_date
 *  2. Apply dailyRate = (1 + yield_rate)^(1/365) - 1 compounded over those days
 *  3. Insert one interest_accrual cash transaction
 *  4. Update last_accrual_date to today
 *
 * The accrual amount is based on the running balance at last_accrual_date
 * (the balance before this accrual is applied).
 */
export async function runAccrualEngine(): Promise<void> {
  const repos = await getRepos();
  const db = await getDb();

  const mutualFunds = await repos.accounts.findByType('mutual_fund');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (const fund of mutualFunds) {
    if (fund.yield_rate == null || fund.yield_rate <= 0) continue;

    const lastAccrual = fund.last_accrual_date ?? fund.opening_date;
    if (!lastAccrual) continue;

    // Skip if already accrued today
    if (lastAccrual >= today) continue;

    // Compute elapsed days
    const lastDate = new Date(lastAccrual);
    const todayDate = new Date(today);
    const elapsedDays = Math.floor(
      (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (elapsedDays <= 0) continue;

    // Daily rate from annual yield: (1 + yield_rate)^(1/365) - 1
    const annualRate = fund.yield_rate / 100; // yield_rate stored as percentage
    const dailyRate = Math.pow(1 + annualRate, 1 / 365) - 1;

    // Get balance at the start of the accrual period
    const balanceAtStart = await repos.cashLedger.runningBalance(fund.id, lastAccrual);

    // Compound over elapsed days: accrued = balance * ((1 + dailyRate)^days - 1)
    const accruedAmount =
      balanceAtStart * (Math.pow(1 + dailyRate, elapsedDays) - 1);

    // Skip negligible accruals
    if (accruedAmount < 0.01) continue;

    // Insert accrual and update last_accrual_date in a transaction
    await db.beginTransaction();
    try {
      await repos.cashLedger.create({
        account_id: fund.id,
        type: 'interest_accrual',
        amount: Math.round(accruedAmount * 100) / 100, // round to 2 decimals
        tag_id: null,
        description: `Auto-accrual: ${fund.yield_rate}% p.a. over ${elapsedDays} days`,
        occurred_at: today,
        related_security_transaction_id: null,
      }, false);

      await repos.accounts.update(fund.id, { last_accrual_date: today }, false);

      await db.commitTransaction();
    } catch (e) {
      await db.rollbackTransaction();
      throw new Error(`Accrual engine failed for account "${fund.name}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }
}

// ─── Filtered Transaction Queries ────────────────────────────────────────────

export interface TransactionFilter {
  accountId?: number;
  tagId?: number;
  type?: CashTransactionType;
  from?: string;
  to?: string;
}

export interface CashTransactionWithAccount extends CashTransaction {
  account_name: string;
  account_type: string;
  account_currency: string;
  tag_name: string | null;
  tag_color: string | null;
}

export async function getAllCashTransactions(
  filter?: TransactionFilter,
): Promise<CashTransactionWithAccount[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.accountId) {
    conditions.push('ct.account_id = ?');
    params.push(filter.accountId);
  }
  if (filter?.tagId) {
    conditions.push('ct.tag_id = ?');
    params.push(filter.tagId);
  }
  if (filter?.type) {
    conditions.push('ct.type = ?');
    params.push(filter.type);
  }
  if (filter?.from) {
    conditions.push('ct.occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter?.to) {
    conditions.push('ct.occurred_at <= ?');
    params.push(filter.to);
  }

  const whereClause =
    conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const db = await getDb();
  const result = await db.query(
    `SELECT ct.*, a.name AS account_name, a.type AS account_type,
            a.currency AS account_currency,
            t.name AS tag_name, t.color AS tag_color
       FROM cash_transactions ct
       JOIN accounts a ON a.id = ct.account_id
  LEFT JOIN tags t ON t.id = ct.tag_id
      ${whereClause}
      ORDER BY ct.occurred_at DESC`,
    params,
  );

  return (result.values ?? []) as CashTransactionWithAccount[];
}

// ─── Cash Flow Sankey ────────────────────────────────────────────────────────

export interface CashFlowPeriod {
  mode: 'month' | 'year';
  month?: number; // 0-11, only used when mode='month'
  year: number;
}

export interface SankeyNode {
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export interface SankeyDiagramData {
  nodes: Array<{ name: string }>;
  links: Array<{ source: number; target: number; value: number }>;
  totalIncome: number;
  totalExpense: number;
  usedFallbackFx?: boolean;
}

function getPeriodBounds(period: CashFlowPeriod): { from: string; to: string } {
  if (period.mode === 'month') {
    const m = period.month ?? new Date().getMonth();
    const y = period.year;
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }
  // year mode
  return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
}

/**
 * Fetch the latest FX rate to convert `from` currency to `to` currency.
 * Returns 1.0 if currencies match or no rate is stored.
 */
async function getFxConversion(
  repos: Awaited<ReturnType<typeof getRepos>>,
  from: string,
  to: string,
): Promise<{ rate: number; isFallback: boolean }> {
  if (from === to) return { rate: 1, isFallback: false };
  const rate = await repos.marketData.latestFxRate(from, to);
  if (rate) return { rate: rate.rate, isFallback: false };
  return { rate: 1, isFallback: true };
}

/**
 * Build Recharts Sankey { nodes, links } from cash_transactions of type
 * income/expense in the given period, converted to base currency.
 */
export async function getCashFlowSankeyData(
  period: CashFlowPeriod,
): Promise<SankeyDiagramData> {
  const repos = await getRepos();
  const db = await getDb();
  const settings = await repos.settings.get();
  const baseCurrency = settings.base_currency;
  const { from, to } = getPeriodBounds(period);

  // Fetch income/expense transactions with tag + account info
  const result = await db.query(
    `SELECT ct.id, ct.type, ct.amount, ct.tag_id, ct.description,
            t.name AS tag_name, t.color AS tag_color,
            a.currency AS account_currency
       FROM cash_transactions ct
  LEFT JOIN tags t  ON t.id = ct.tag_id
       JOIN accounts a ON a.id = ct.account_id
      WHERE ct.type IN ('income', 'expense', 'charge')
        AND ct.occurred_at >= ? AND ct.occurred_at <= ?
      ORDER BY ct.occurred_at ASC`,
    [from, to],
  );

  const rows = (result.values ?? []) as {
    id: number;
    type: string;
    amount: number;
    tag_id: number | null;
    description: string;
    tag_name: string | null;
    tag_color: string | null;
    account_currency: string;
  }[];

  // Group by tag, converting to base currency
  const incomeByTag = new Map<string, { total: number; color: string }>();
  const expenseByTag = new Map<string, { total: number; color: string }>();

  // Batch-fetch all unique FX rates before the loop (fixes N+1)
  const uniqueCurrencies = new Set(rows.map((r) => r.account_currency));
  const fxRateCache = new Map<string, number>();
  let usedFallbackFx = false;
  await Promise.all(
    [...uniqueCurrencies].map(async (curr) => {
      const { rate, isFallback } = await getFxConversion(repos, curr, baseCurrency);
      fxRateCache.set(curr, rate);
      if (isFallback) usedFallbackFx = true;
    }),
  );

  for (const row of rows) {
    const conversion = fxRateCache.get(row.account_currency) ?? 1;
    const converted = row.amount * conversion;
    const isIncome = row.type === 'income';
    const map = isIncome ? incomeByTag : expenseByTag;
    const tagName = row.tag_name
      ? displayTag(row.tag_name, row.description)
      : 'Uncategorised';
    const tagColor = row.tag_color ?? '#6b7280';

    const existing = map.get(tagName);
    if (existing) {
      existing.total += converted;
    } else {
      map.set(tagName, { total: converted, color: tagColor });
    }
  }

  // Build nodes: income tags (left) → Total Income (center) → expense tags + balance (right)
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Centre node
  const totalIncomeIdx = nodes.length;
  nodes.push({ name: 'Total Income', color: '#10b981' });

  // Income tag nodes and links to centre (rounded)
  let roundedIncomeSum = 0;
  for (const [name, { total, color }] of incomeByTag) {
    const idx = nodes.length;
    const rounded = Math.round(total);
    roundedIncomeSum += rounded;
    nodes.push({ name, color });
    links.push({ source: idx, target: totalIncomeIdx, value: rounded });
  }

  // Expense tag nodes and links from centre (rounded)
  let roundedExpenseSum = 0;
  for (const [name, { total, color }] of expenseByTag) {
    const idx = nodes.length;
    const rounded = Math.round(total);
    roundedExpenseSum += rounded;
    nodes.push({ name, color });
    links.push({ source: totalIncomeIdx, target: idx, value: rounded });
  }

  // Balancing node (uses sum of rounded links for consistency)
  if (roundedIncomeSum >= roundedExpenseSum) {
    const savingsIdx = nodes.length;
    nodes.push({ name: 'Savings', color: '#3b82f6' });
    links.push({
      source: totalIncomeIdx,
      target: savingsIdx,
      value: roundedIncomeSum - roundedExpenseSum,
    });
  } else {
    const deficitIdx = nodes.length;
    nodes.push({ name: 'Deficit', color: '#ef4444' });
    links.push({
      source: deficitIdx,
      target: totalIncomeIdx,
      value: roundedExpenseSum - roundedIncomeSum,
    });
  }

  return { nodes, links, totalIncome: roundedIncomeSum, totalExpense: roundedExpenseSum, usedFallbackFx };
}

// ─── Net Worth Computation ───────────────────────────────────────────────────

export interface NetWorthResult {
  totalPyg: number;
  totalUsd: number;
  assetsPyg: number;
  liabilitiesPyg: number;
  assetsUsd: number;
  liabilitiesUsd: number;
  breakdown: Record<number, { name: string; type: string; currency: string; balance: number }>;
}

/**
 * Compute the total net worth across all accounts using real market data.
 *
 * - Bank & mutual_fund accounts: use cash balance (in native currency)
 * - Broker accounts: use cash balance + market value of holdings (quantity × latest price)
 * - Credit card accounts: subtract debt (opening_balance + charges − payments)
 *
 * Returns both the total in PYG and USD, plus a per-account breakdown.
 */
export async function computeNetWorth(): Promise<NetWorthResult> {
  const repos = await getRepos();
  const settings = await repos.settings.get();
  const baseCurrency = settings.base_currency;

  const accounts = await repos.accounts.findAll();
  const breakdown: NetWorthResult['breakdown'] = {};
  let totalPyg = 0;
  let totalUsd = 0;
  let assetsPyg = 0;
  let liabilitiesPyg = 0;
  let assetsUsd = 0;
  let liabilitiesUsd = 0;

  // Get FX rate to convert everything to base currency
  const getConversion = async (from: string, to: string): Promise<number> => {
    if (from === to) return 1;
    const rate = await repos.marketData.latestFxRate(from, to);
    return rate?.rate ?? 1;
  };

  for (const account of accounts) {
    let balance: number;
    const currency = account.currency;

    if (account.type === 'credit_card') {
      // Credit card debt is negative net worth
      const debt = await getCardDebtBalance(account.id);
      balance = -debt;
    } else if (account.type === 'broker') {
      // Broker: cash balance + market value of holdings
      const cashBalance = await repos.cashLedger.runningBalance(account.id);
      const holdings = await repos.holdings.findByAccountId(account.id);
      let marketValue = 0;

      for (const holding of holdings) {
        const pos = await repos.securityLedger.netPosition(holding.id);
        const quantity = pos?.net_quantity ?? 0;
        if (quantity <= 0) continue;

        const priceData = await repos.marketData.latestSecurityPrice(holding.symbol);
        const price = priceData?.price ?? 0;
        marketValue += quantity * price;
      }

      balance = cashBalance + marketValue;
    } else {
      // Bank or mutual_fund: just cash balance
      balance = await repos.cashLedger.runningBalance(account.id);
    }

    // Convert to base currency
    const conversion = await getConversion(currency, baseCurrency);
    const convertedBalance = balance * conversion;

    // Add to totals
    if (currency === 'PYG') {
      totalPyg += balance;
      if (balance >= 0) assetsPyg += balance;
      else liabilitiesPyg += Math.abs(balance);
    } else {
      totalUsd += balance;
      if (balance >= 0) assetsUsd += balance;
      else liabilitiesUsd += Math.abs(balance);
    }

    // If converting USD to PYG or vice versa, adjust totals
    if (baseCurrency === 'PYG' && currency === 'USD') {
      totalPyg += convertedBalance;
      if (convertedBalance >= 0) assetsPyg += convertedBalance;
      else liabilitiesPyg += Math.abs(convertedBalance);
    } else if (baseCurrency === 'USD' && currency === 'PYG') {
      totalUsd += convertedBalance;
      if (convertedBalance >= 0) assetsUsd += convertedBalance;
      else liabilitiesUsd += Math.abs(convertedBalance);
    }

    breakdown[account.id] = {
      name: account.name,
      type: account.type,
      currency,
      balance,
    };
  }

  return {
    totalPyg,
    totalUsd,
    assetsPyg,
    liabilitiesPyg,
    assetsUsd,
    liabilitiesUsd,
    breakdown,
  };
}

// ─── Record a security sell transaction. ─────────────────────────────────────
// Credits cash to the broker account. Rejects if holdings are insufficient.
export async function sellSecurity(
  accountId: number,
  symbol: string,
  quantity: number,
  price: number,
  commission: number,
  date: string,
  description?: string
): Promise<number> {
  const repos = await getRepos();
  const db = await getDb();

  if (!symbol || symbol.trim().length === 0) throw new Error('Symbol is required');
  if (quantity <= 0) throw new Error('Quantity must be greater than zero');
  if (price <= 0) throw new Error('Price must be greater than zero');
  if (commission < 0) throw new Error('Commission cannot be negative');

  const account = await repos.accounts.findById(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  if (account.type !== 'broker') {
    throw new Error('Can only sell securities in a broker account');
  }

  // 1. Find holding
  const cleanSymbol = symbol.trim().toUpperCase();
  const allHoldings = await repos.holdings.findByAccountId(accountId);
  const holding = allHoldings.find((h) => h.symbol === cleanSymbol);
  if (!holding) {
    throw new Error(`You do not hold any shares of ${cleanSymbol}`);
  }

  // 2. Check position integrity
  const pos = await repos.securityLedger.netPosition(holding.id);
  const currentQuantity = pos?.net_quantity ?? 0;
  if (quantity > currentQuantity) {
    throw new Error(`Insufficient shares of ${cleanSymbol} to sell`);
  }

  // 3. Execute in a transaction
  await db.beginTransaction();
  try {
    // 4. Create security transaction
    const tradeId = await repos.securityLedger.create({
      holding_id: holding.id,
      type: 'sell',
      quantity,
      price,
      commission,
      occurred_at: date,
    }, false);

    // 5. Record sell_credit in cash ledger
    const proceeds = quantity * price - commission;
    await repos.cashLedger.create({
      account_id: accountId,
      type: 'sell_credit',
      amount: proceeds,
      tag_id: null,
      description: description || `Sold ${quantity} ${cleanSymbol} @ ${price}`,
      occurred_at: date,
      related_security_transaction_id: tradeId,
    }, false);

    await db.commitTransaction();
    return tradeId;
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}
