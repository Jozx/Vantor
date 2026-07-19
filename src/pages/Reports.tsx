import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAccounts,
  getCashBalanceBatch,
  getHoldingsWithStats,
} from '@/services/financeService';
import type { Account, AccountType } from '@/db';
import { getRepos } from '@/db';
import { cn, formatMoney, accountTypeConfig } from '@/lib/utils';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Wallet,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

type ReportType = AccountType;

interface ReportLine {
  label: string;
  amount: number;
  color: 'emerald' | 'rose' | 'blue' | 'zinc';
  icon: typeof ArrowUpRight;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

export default function Reports() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportType, setReportType] = useState<ReportType>('bank');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthYear().month);
  const [selectedYear, setSelectedYear] = useState(currentMonthYear().year);
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [reportAccounts, setReportAccounts] = useState<Account[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccounts();
        if (!cancelled) setAccounts(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Failed to load accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Compute date range for selected month
  const dateRange = (() => {
    const y = selectedYear;
    const m = selectedMonth;
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  })();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      setLines([]);
      try {
        const repos = await getRepos();
        const typeAccounts = accounts.filter((a) => a.type === reportType);
        if (!cancelled) setReportAccounts(typeAccounts);

        const { from, to } = dateRange;
        const result: ReportLine[] = [];

        if (reportType === 'bank') {
          // Bank: deposits, withdrawals, expenses, income
          let totalIncome = 0;
          let totalExpenses = 0;
          let totalDeposits = 0;
          let totalWithdrawals = 0;
          for (const acc of typeAccounts) {
            const txs = await repos.cashLedger.findByAccountId(acc.id, { from, to });
            for (const tx of txs) {
              if (tx.type === 'income') totalIncome += tx.amount;
              else if (tx.type === 'expense') totalExpenses += tx.amount;
              else if (tx.type === 'deposit') totalDeposits += tx.amount;
              else if (tx.type === 'withdrawal') totalWithdrawals += tx.amount;
            }
          }
          result.push(
            { label: 'Income', amount: totalIncome, color: 'emerald', icon: ArrowDownRight },
            { label: 'Expenses', amount: -totalExpenses, color: 'rose', icon: ArrowUpRight },
            { label: 'Deposits', amount: totalDeposits, color: 'blue', icon: ArrowDownRight },
            { label: 'Withdrawals', amount: -totalWithdrawals, color: 'rose', icon: ArrowUpRight },
          );
        } else if (reportType === 'mutual_fund') {
          // Mutual fund: deposits, withdrawals, interest accruals
          let totalDeposits = 0;
          let totalWithdrawals = 0;
          let totalInterest = 0;
          for (const acc of typeAccounts) {
            const txs = await repos.cashLedger.findByAccountId(acc.id, { from, to });
            for (const tx of txs) {
              if (tx.type === 'deposit') totalDeposits += tx.amount;
              else if (tx.type === 'withdrawal') totalWithdrawals += tx.amount;
              else if (tx.type === 'interest_accrual') totalInterest += tx.amount;
            }
          }
          result.push(
            { label: 'Deposits', amount: totalDeposits, color: 'emerald', icon: ArrowDownRight },
            { label: 'Withdrawals', amount: -totalWithdrawals, color: 'rose', icon: ArrowUpRight },
            { label: 'Interest Accrued', amount: totalInterest, color: 'emerald', icon: Wallet },
          );
        } else if (reportType === 'broker') {
          // Broker: cash deposits, withdrawals, buys, sells
          let totalDeposits = 0;
          let totalWithdrawals = 0;
          let totalBuys = 0;
          let totalSells = 0;
          for (const acc of typeAccounts) {
            const txs = await repos.cashLedger.findByAccountId(acc.id, { from, to });
            for (const tx of txs) {
              if (tx.type === 'deposit') totalDeposits += tx.amount;
              else if (tx.type === 'withdrawal') totalWithdrawals += tx.amount;
              else if (tx.type === 'buy_debit') totalBuys += tx.amount;
              else if (tx.type === 'sell_credit') totalSells += tx.amount;
            }
          }
          // Cash balance for all broker accounts
          const balances = await getCashBalanceBatch(typeAccounts.map((a) => a.id));
          const totalCash = typeAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

          // Holdings market value
          let totalHoldingsValue = 0;
          for (const acc of typeAccounts) {
            const holdings = await getHoldingsWithStats(acc.id);
            for (const h of holdings) {
              if (h.quantity <= 0) continue;
              const price = (await repos.marketData.latestSecurityPrice(h.symbol))?.price ?? 0;
              totalHoldingsValue += h.quantity * price;
            }
          }

          result.push(
            { label: 'Available Cash', amount: totalCash, color: 'blue', icon: Wallet },
            { label: 'Holdings Value', amount: totalHoldingsValue, color: 'emerald', icon: TrendingUp },
            { label: 'Cash Deposited', amount: totalDeposits, color: 'emerald', icon: ArrowDownRight },
            { label: 'Cash Withdrawn', amount: -totalWithdrawals, color: 'rose', icon: ArrowUpRight },
            { label: 'Securities Bought', amount: -totalBuys, color: 'rose', icon: ArrowUpRight },
            { label: 'Securities Sold', amount: totalSells, color: 'emerald', icon: ArrowDownRight },
          );
        } else if (reportType === 'credit_card') {
          // Credit card: charges, payments
          let totalCharges = 0;
          let totalPayments = 0;
          for (const acc of typeAccounts) {
            const txs = await repos.cashLedger.findByAccountId(acc.id, { from, to });
            for (const tx of txs) {
              if (tx.type === 'charge') totalCharges += tx.amount;
              else if (tx.type === 'payment') totalPayments += tx.amount;
            }
          }
          const totalLimit = typeAccounts.reduce((s, a) => s + (a.credit_limit ?? 0), 0);
          const totalDebt = totalCharges - totalPayments;
          const available = totalLimit - totalDebt;

          result.push(
            { label: 'Charges This Month', amount: totalCharges, color: 'rose', icon: ArrowUpRight },
            { label: 'Payments Made', amount: totalPayments, color: 'emerald', icon: ArrowDownRight },
            { label: 'Net Change', amount: -(totalCharges - totalPayments), color: totalCharges > totalPayments ? 'rose' : 'emerald', icon: ArrowLeftRight },
            { label: 'Available Credit', amount: available, color: 'blue', icon: Wallet },
          );
        }

        if (!cancelled) setLines(result);
      } catch (err) {
        console.error('Report generation failed:', err);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, selectedMonth, selectedYear, accounts, loading]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ArrowLeftRight className="h-8 w-8 animate-spin text-zinc-400 mb-3" />
        <span className="text-zinc-500 dark:text-zinc-400 font-medium">Loading accounts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentMonthYear().year - i);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-24 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Monthly account statements
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4">
        {/* Account Type */}
        <div className="flex gap-2">
          {(['bank', 'mutual_fund', 'broker', 'credit_card'] as ReportType[]).map((t) => {
            const cfg = accountTypeConfig[t];
            const Icon = cfg.icon;
            const count = accounts.filter((a) => a.type === t).length;
            return (
              <button
                key={t}
                onClick={() => setReportType(t)}
                disabled={count === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer',
                  reportType === t
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 border-zinc-900 dark:border-zinc-50'
                    : 'bg-white dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  count === 0 && 'opacity-40 cursor-not-allowed'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Month / Year */}
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="appearance-none bg-white dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-white dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Report Content */}
      {reportLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <ArrowLeftRight className="h-6 w-6 animate-spin text-zinc-400 mb-2" />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Generating report...</span>
        </div>
      ) : reportAccounts.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">
          No accounts of this type. Create one first.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Report Header */}
          <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {accountTypeConfig[reportType].label} — {MONTHS[selectedMonth]} {selectedYear}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {reportAccounts.length} account{reportAccounts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className={cn(
                'p-2 rounded-lg',
                accountTypeConfig[reportType].colorClass
              )}>
                {(() => { const Icon = accountTypeConfig[reportType].icon; return <Icon className="h-5 w-5" />; })()}
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-3">
              {lines.map((line) => {
                const Icon = line.icon;
                const colorMap = {
                  emerald: 'text-emerald-600 dark:text-emerald-400',
                  rose: 'text-rose-600 dark:text-rose-400',
                  blue: 'text-blue-600 dark:text-blue-400',
                  zinc: 'text-zinc-600 dark:text-zinc-400',
                };
                return (
                  <div key={line.label} className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('h-4 w-4', colorMap[line.color])} />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{line.label}</span>
                    </div>
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      line.amount >= 0
                        ? 'text-zinc-900 dark:text-zinc-50'
                        : 'text-rose-600 dark:text-rose-400'
                    )}>
                      {line.amount >= 0 ? '+' : ''}{formatMoney(Math.abs(line.amount), reportAccounts[0]?.currency ?? 'PYG')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Account Breakdown */}
          {reportAccounts.length > 1 && (
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Per Account</h4>
              <div className="space-y-2">
                {reportAccounts.map((acc) => (
                  <Link
                    key={acc.id}
                    to={`/accounts/${acc.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{acc.name}</span>
                    <span className="text-xs text-zinc-400">{acc.currency} · {acc.institution || '—'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
