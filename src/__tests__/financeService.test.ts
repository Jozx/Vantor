import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAccounts = [
  { id: 1, name: 'Bank PYG', type: 'bank', currency: 'PYG', institution: 'Banco', opening_balance: 1000000, opening_date: '2024-01-01', yield_rate: null, last_accrual_date: null, credit_limit: null },
  { id: 2, name: 'Card PYG', type: 'credit_card', currency: 'PYG', institution: 'Tarjeta', opening_balance: 0, opening_date: '2024-01-01', yield_rate: null, last_accrual_date: null, credit_limit: 5000000 },
];

const mockSettings = { id: 1, stock_api_key: '', fx_api_key: '', base_currency: 'PYG', theme: 'system' as const };

vi.mock('@/db', () => ({
  getRepos: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('@/services/marketService', () => ({
  getSecurityPrice: vi.fn().mockResolvedValue(null),
}));

import { computeNetWorth } from '@/services/financeService';
import { getRepos } from '@/db';

function buildMockRepos(overrides: {
  accounts?: typeof mockAccounts;
  cashBalances?: Record<number, number>;
} = {}) {
  const accounts = overrides.accounts ?? mockAccounts;
  const cashBalances = overrides.cashBalances ?? { 1: 1000000, 2: 0 };

  return {
    accounts: {
      findAll: vi.fn().mockResolvedValue(accounts),
      findById: vi.fn().mockImplementation((id: number) => Promise.resolve(accounts.find((a) => a.id === id))),
    },
    settings: {
      get: vi.fn().mockResolvedValue(mockSettings),
    },
    cashLedger: {
      runningBalance: vi.fn().mockImplementation((id: number) => Promise.resolve(cashBalances[id] ?? 0)),
      runningBalanceBatch: vi.fn().mockImplementation((ids: number[]) => {
        const result = new Map<number, number>();
        for (const id of ids) result.set(id, cashBalances[id] ?? 0);
        return Promise.resolve(result);
      }),
    },
    holdings: {
      findByAccountId: vi.fn().mockResolvedValue([]),
    },
    securityLedger: {
      netPosition: vi.fn().mockResolvedValue(null),
      netPositionsBatch: vi.fn().mockResolvedValue(new Map()),
    },
    marketData: {
      latestFxRate: vi.fn().mockResolvedValue(null),
      latestSecurityPrice: vi.fn().mockResolvedValue(null),
      latestPricesAll: vi.fn().mockResolvedValue([]),
    },
    netWorthSnapshots: {
      findByDate: vi.fn().mockResolvedValue(null),
      upsertByDate: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn().mockResolvedValue([]),
      latest: vi.fn().mockResolvedValue(null),
    },
    tags: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(1),
    },
  };
}

describe('computeNetWorth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subtracts credit card debt from net worth, not adds it', async () => {
    const repos = buildMockRepos({
      accounts: mockAccounts,
      cashBalances: { 1: 1000000, 2: 0 },
    });
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    // Mock getCardDebtBalance by intercepting the db.query call
    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ values: [{ debt: 500000 }] }),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const result = await computeNetWorth();

    // Bank: +1,000,000 PYG, Credit card: -500,000 PYG
    // Net worth should be 500,000, NOT 1,500,000
    expect(result.totalPyg).toBe(500000);
    expect(result.totalPyg).not.toBe(1500000);
  });

  it('tracks assets and liabilities separately', async () => {
    const repos = buildMockRepos({
      accounts: mockAccounts,
      cashBalances: { 1: 1000000, 2: 0 },
    });
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ values: [{ debt: 500000 }] }),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const result = await computeNetWorth();

    expect(result.assetsPyg).toBe(1000000);
    expect(result.liabilitiesPyg).toBe(500000);
    expect(result.totalPyg).toBe(result.assetsPyg - result.liabilitiesPyg);
  });

  it('bank + credit card: net worth = bankBalance - cardDebt', async () => {
    const bankBalance = 2000000;
    const cardDebt = 750000;

    const repos = buildMockRepos({
      accounts: [
        { ...mockAccounts[0], opening_balance: bankBalance },
        mockAccounts[1],
      ],
      cashBalances: { 1: bankBalance, 2: 0 },
    });
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ values: [{ debt: cardDebt }] }),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const result = await computeNetWorth();

    expect(result.totalPyg).toBe(bankBalance - cardDebt);
    expect(result.totalPyg).toBe(1250000);
  });

  it('handles zero credit card debt correctly', async () => {
    const repos = buildMockRepos({
      accounts: mockAccounts,
      cashBalances: { 1: 1000000, 2: 0 },
    });
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ values: [{ debt: 0 }] }),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const result = await computeNetWorth();

    expect(result.totalPyg).toBe(1000000);
    expect(result.liabilitiesPyg).toBe(0);
    expect(result.assetsPyg).toBe(1000000);
  });

  it('multiple credit cards sum their debts as liabilities', async () => {
    const accounts = [
      mockAccounts[0],
      { ...mockAccounts[1], id: 2, name: 'Card 1' },
      { ...mockAccounts[1], id: 3, name: 'Card 2' },
    ];
    const repos = buildMockRepos({
      accounts,
      cashBalances: { 1: 3000000, 2: 0, 3: 0 },
    });
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    let callCount = 0;
    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ values: [{ debt: callCount === 1 ? 500000 : 800000 }] });
        }
        return Promise.resolve({ values: [] });
      }),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const result = await computeNetWorth();

    expect(result.totalPyg).toBe(3000000 - 500000 - 800000);
    expect(result.liabilitiesPyg).toBe(1300000);
    expect(result.assetsPyg).toBe(3000000);
  });

  it('dual-currency totals are correct regardless of base_currency setting', async () => {
    const accounts = [
      { id: 1, name: 'Bank PYG', type: 'bank', currency: 'PYG', institution: 'Banco', opening_balance: 1000000, opening_date: '2024-01-01', yield_rate: null, last_accrual_date: null, credit_limit: null },
      { id: 2, name: 'Bank USD', type: 'bank', currency: 'USD', institution: 'Banco', opening_balance: 200, opening_date: '2024-01-01', yield_rate: null, last_accrual_date: null, credit_limit: null },
    ];

    // Mock with base_currency = 'USD' (the previously broken case)
    const settingsUsd = { id: 1, stock_api_key: '', fx_api_key: '', base_currency: 'USD', theme: 'system' as const };
    const repos = buildMockRepos({
      accounts,
      cashBalances: { 1: 1000000, 2: 200 },
    });
    repos.settings.get = vi.fn().mockResolvedValue(settingsUsd);

    // Mock FX rates: PYG→USD = 0.000143, USD→PYG = 7000
    repos.marketData.latestFxRate = vi.fn().mockImplementation((from: string, to: string) => {
      if (from === 'PYG' && to === 'USD') return Promise.resolve({ rate: 0.000143 });
      if (from === 'USD' && to === 'PYG') return Promise.resolve({ rate: 7000 });
      return Promise.resolve(null);
    });

    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ values: [] }),
      run: vi.fn(),
    });

    const result = await computeNetWorth();

    // PYG account: 1,000,000 PYG → 143 USD
    // USD account: 200 USD → 1,400,000 PYG
    expect(result.totalPyg).toBe(1000000 + 1400000);
    expect(result.totalUsd).toBeCloseTo(143 + 200, 0);
    expect(result.assetsPyg).toBe(result.totalPyg);
    expect(result.assetsUsd).toBeCloseTo(result.totalUsd, 0);
  });
});

// ─── Regression: Symbol validation (3.3) ──────────────────────────────────────

describe('buySecurity / sellSecurity symbol validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buySecurity rejects empty symbol', async () => {
    const repos = buildMockRepos();
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { buySecurity } = await import('@/services/financeService');

    await expect(
      buySecurity(1, '', 10, 100, 0, '2024-01-01'),
    ).rejects.toThrow('Symbol is required');

    await expect(
      buySecurity(1, '   ', 10, 100, 0, '2024-01-01'),
    ).rejects.toThrow('Symbol is required');
  });

  it('sellSecurity rejects empty symbol', async () => {
    const repos = buildMockRepos();
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { sellSecurity } = await import('@/services/financeService');

    await expect(
      sellSecurity(1, '', 10, 100, 0, '2024-01-01'),
    ).rejects.toThrow('Symbol is required');

    await expect(
      sellSecurity(1, '   ', 10, 100, 0, '2024-01-01'),
    ).rejects.toThrow('Symbol is required');
  });
});

// ─── Regression: Sankey rounding consistency (1.4) ────────────────────────────

describe('Sankey rounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('totalIncome and totalExpense equal sum of rounded links', async () => {
    const repos = buildMockRepos();
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const dbQuery = vi.fn()
      // First call: Sankey query returns 3 transactions
      .mockResolvedValueOnce({
        values: [
          { id: 1, type: 'income', amount: 1500, tag_id: 1, description: 'Salary', tag_name: 'Salary', tag_color: '#10b981', account_currency: 'PYG' },
          { id: 2, type: 'income', amount: 250, tag_id: 2, description: 'Freelance', tag_name: 'Freelance', tag_color: '#3b82f6', account_currency: 'PYG' },
          { id: 3, type: 'expense', amount: 800, tag_id: 3, description: 'Rent', tag_name: 'Rent', tag_color: '#ef4444', account_currency: 'PYG' },
          { id: 4, type: 'expense', amount: 300, tag_id: 4, description: 'Food', tag_name: 'Food', tag_color: '#f59e0b', account_currency: 'PYG' },
        ],
      });

    const { getDb } = await import('@/db');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: dbQuery,
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    });

    const { getCashFlowSankeyData } = await import('@/services/financeService');
    const result = await getCashFlowSankeyData({ mode: 'month', month: 0, year: 2024 });

    // Round each link value individually
    const linkSum = result.links
      .filter((l) => l.source === 0)
      .reduce((sum, l) => sum + l.value, 0);

    // TotalIncome should match sum of income links
    expect(result.totalIncome).toBe(linkSum);

    // All values are integers (no fractional links)
    for (const link of result.links) {
      expect(Number.isInteger(link.value)).toBe(true);
    }
  });
});

// ─── Regression: runningBalanceBatch (4.2) ────────────────────────────────────

describe('runningBalanceBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct balances for multiple accounts', async () => {
    const repos = buildMockRepos();
    (repos.cashLedger as Record<string, ReturnType<typeof vi.fn>>).runningBalanceBatch = vi.fn().mockResolvedValue(
      new Map([[1, 1000000], [2, 500000]])
    );
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getCashBalanceBatch } = await import('@/services/financeService');
    const result = await getCashBalanceBatch([1, 2]);

    expect(result.get(1)).toBe(1000000);
    expect(result.get(2)).toBe(500000);
    expect(result.size).toBe(2);
  });

  it('returns empty map for empty input', async () => {
    const repos = buildMockRepos();
    (repos.cashLedger as Record<string, ReturnType<typeof vi.fn>>).runningBalanceBatch = vi.fn().mockResolvedValue(new Map());
    (getRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { getCashBalanceBatch } = await import('@/services/financeService');
    const result = await getCashBalanceBatch([]);

    expect(result.size).toBe(0);
  });
});
