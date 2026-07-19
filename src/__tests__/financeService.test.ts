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
    },
    holdings: {
      findByAccountId: vi.fn().mockResolvedValue([]),
    },
    securityLedger: {
      netPosition: vi.fn().mockResolvedValue(null),
    },
    marketData: {
      latestFxRate: vi.fn().mockResolvedValue(null),
      latestSecurityPrice: vi.fn().mockResolvedValue(null),
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
});
