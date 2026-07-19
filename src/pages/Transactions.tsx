import { useEffect, useState, useMemo, useRef } from 'react';
import {
  getAllCashTransactions,
  getAccounts,
  getTags,
} from '@/services/financeService';
import type { CashTransactionWithAccount } from '@/services/financeService';
import type { Account, CashTransactionType, Tag } from '@/db';
import { cn, formatMoney, displayTag } from '@/lib/utils';
import {
  Calendar,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
} from 'lucide-react';

type SortField = 'occurred_at' | 'amount' | 'type' | 'account_name' | 'tag_name';
type SortDir = 'asc' | 'desc';

export default function Transactions() {
  const [transactions, setTransactions] = useState<CashTransactionWithAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterAccount, setFilterAccount] = useState<number | ''>('');
  const [filterTag, setFilterTag] = useState<number | ''>('');
  const [filterType, setFilterType] = useState<CashTransactionType | ''>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('occurred_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const mountedRef = useRef(false);

  const loadTransactions = async () => {
    try {
      const txs = await getAllCashTransactions({
        accountId: filterAccount !== '' ? Number(filterAccount) : undefined,
        tagId: filterTag !== '' ? Number(filterTag) : undefined,
        type: filterType || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setTransactions(txs);
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to load transactions');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, allTags] = await Promise.all([getAccounts(), getTags()]);
        if (cancelled) return;
        setAccounts(accs);
        setTags(allTags);
        const txs = await getAllCashTransactions();
        if (cancelled) return;
        setTransactions(txs);
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError('Failed to load data');
      } finally {
        if (!cancelled) {
          setLoading(false);
          mountedRef.current = true;
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reload when filters change (skip on initial mount)
  useEffect(() => {
    if (!mountedRef.current) return;
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAccount, filterTag, filterType, filterFrom, filterTo]);

  const sorted = useMemo(() => {
    const arr = [...transactions];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'occurred_at':
          cmp = a.occurred_at.localeCompare(b.occurred_at);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'account_name':
          cmp = a.account_name.localeCompare(b.account_name);
          break;
        case 'tag_name':
          cmp = (a.tag_name ?? '').localeCompare(b.tag_name ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [transactions, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-zinc-900 dark:text-zinc-100" />
      : <ArrowDown className="h-3 w-3 text-zinc-900 dark:text-zinc-100" />;
  };

  const hasActiveFilters = filterAccount !== '' || filterTag !== '' || filterType !== '' || filterFrom !== '' || filterTo !== '';

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50"></div>
        <p className="text-zinc-500 dark:text-zinc-400 mt-4 font-medium">Loading transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Transactions</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {(() => {
            const parts: string[] = [];
            if (filterAccount) {
              const acc = accounts.find((a) => a.id === filterAccount);
              if (acc) parts.push(acc.name);
            }
            if (filterType) parts.push(filterType.replace('_', ' '));
            if (filterTag) {
              const tag = tags.find((t) => t.id === filterTag);
              if (tag) parts.push(tag.name);
            }
            if (filterFrom || filterTo) {
              const range = [filterFrom, filterTo].filter(Boolean).join(' to ');
              parts.push(range);
            }
            if (parts.length === 0) return 'All cash transactions across your accounts';
            return parts.join(' · ');
          })()}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Filters
          </h3>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterAccount('');
                setFilterTag('');
                setFilterType('');
                setFilterFrom('');
                setFilterTo('');
              }}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 ml-auto cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Account
            </label>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            >
              <option value="">All accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Tag
            </label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as CashTransactionType | '')}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            >
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="interest_accrual">Interest Accrual</option>
              <option value="buy_debit">Buy (Debit)</option>
              <option value="sell_credit">Sell (Credit)</option>
              <option value="charge">Charge</option>
              <option value="payment">Payment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              From
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              To
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            />
          </div>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-200/40 dark:border-zinc-800/40 flex justify-between items-center">
          <h4 className="font-bold text-zinc-800 dark:text-zinc-200">Transaction History</h4>
          <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-500">
            {sorted.length} entries
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            {hasActiveFilters ? 'No transactions match your filters.' : 'No transactions recorded yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-50/20 dark:bg-zinc-950/5 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <th
                    className="px-6 py-3 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('occurred_at')}
                  >
                    <span className="flex items-center gap-1">
                      Date {renderSortIcon("occurred_at")}
                    </span>
                  </th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('type')}
                  >
                    <span className="flex items-center gap-1">
                      Type {renderSortIcon("type")}
                    </span>
                  </th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('tag_name')}
                  >
                    <span className="flex items-center gap-1">
                      Tag {renderSortIcon("tag_name")}
                    </span>
                  </th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('account_name')}
                  >
                    <span className="flex items-center gap-1">
                      Account {renderSortIcon("account_name")}
                    </span>
                  </th>
                  <th className="px-6 py-3">Description</th>
                  <th
                    className="px-6 py-3 text-right cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('amount')}
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Amount {renderSortIcon("amount")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/30 dark:divide-zinc-800/30">
                {sorted.map((tx) => {
                  const isPositive = [
                    'income',
                    'deposit',
                    'interest_accrual',
                    'sell_credit',
                  ].includes(tx.type);
                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                      <td className="px-6 py-4 text-xs text-zinc-400 flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar className="h-3.5 w-3.5" />
                        {tx.occurred_at}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-xs font-bold px-2 py-0.5 rounded-full capitalize',
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          )}
                        >
                          {tx.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {tx.tag_name ? (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: (tx.tag_color ?? '#6b7280') + '20', color: tx.tag_color ?? '#6b7280' }}
                          >
                            {displayTag(tx.tag_name, tx.description)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          {tx.account_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate">
                        {tx.description}
                      </td>
                      <td
                        className={cn(
                          'px-6 py-4 text-right font-bold',
                          isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {isPositive ? '+' : '-'}{formatMoney(tx.amount, tx.account_currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
