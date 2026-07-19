import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getCashBalance,
} from '@/services/financeService';
import type { Account, AccountType, Currency } from '@/db';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatMoney, accountTypeConfig } from '@/lib/utils';
import {
  Plus,
  Trash2,
  Edit2,
  Building,
  Calendar,
  X,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface AccountWithBalance extends Account {
  balance: number;
}

type AccountsProps = {
  filterType?: AccountType | AccountType[];
};

const allTypes: AccountType[] = ['bank', 'broker', 'mutual_fund', 'credit_card'];

export default function Accounts({ filterType }: AccountsProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const visibleTypes: AccountType[] = filterType
    ? Array.isArray(filterType) ? filterType : [filterType]
    : allTypes;

  // Accordion state
  const [expandedTypes, setExpandedTypes] = useState<Set<AccountType>>(
    new Set(visibleTypes)
  );

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [institution, setInstitution] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().split('T')[0]);
  const [yieldRate, setYieldRate] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  const fetchAccounts = async () => {
    const data = await getAccounts();
    const accountsWithBalances = await Promise.all(
      data.map(async (acc) => {
        const balance = await getCashBalance(acc.id);
        return { ...acc, balance };
      })
    );
    return accountsWithBalances;
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      setAccounts(await fetchAccounts());
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAccounts();
        if (cancelled) return;
        setAccounts(data);
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError('Failed to fetch accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleType = (t: AccountType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setType('bank');
    setCurrency('USD');
    setInstitution('');
    setOpeningBalance('0');
    setOpeningDate(new Date().toISOString().split('T')[0]);
    setYieldRate('');
    setCreditLimit('');
    setError('');
  };

  const handleOpenCreateModal = () => {
    resetForm();
    if (filterType) {
      const t = Array.isArray(filterType) ? filterType[0] : filterType;
      setType(t);
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: Account) => {
    setEditId(acc.id);
    setName(acc.name);
    setType(acc.type);
    setCurrency(acc.currency);
    setInstitution(acc.institution);
    setOpeningBalance(acc.opening_balance.toString());
    setOpeningDate(acc.opening_date);
    setYieldRate(acc.yield_rate !== null ? acc.yield_rate.toString() : '');
    setCreditLimit(acc.credit_limit !== null ? acc.credit_limit.toString() : '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Account name is required');
      return;
    }
    if (!openingDate) {
      setError('Opening date is required');
      return;
    }

    const parsedBalance = parseFloat(openingBalance);
    if (isNaN(parsedBalance)) {
      setError('Opening balance must be a valid number');
      return;
    }

    let parsedYield: number | null = null;
    if (type === 'mutual_fund') {
      if (yieldRate.trim()) {
        parsedYield = parseFloat(yieldRate);
        if (isNaN(parsedYield)) {
          setError('Yield rate must be a valid number');
          return;
        }
      } else {
        parsedYield = 0;
      }
    }

    try {
      const accountData = {
        name: name.trim(),
        type,
        currency,
        institution: institution.trim(),
        opening_balance: parsedBalance,
        opening_date: openingDate,
        yield_rate: parsedYield,
        last_accrual_date: type === 'mutual_fund' ? openingDate : null,
        credit_limit: type === 'credit_card' ? (parseFloat(creditLimit) || null) : null,
      };

      if (editId !== null) {
        await updateAccount(editId, accountData);
      } else {
        await createAccount(accountData);
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save account');
    }
  };

  const handleDelete = async (id: number, accountName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${accountName}"?\n\nThis action cannot be undone. All associated transactions and holdings will be permanently removed.`
    );
    if (!confirmed) return;
    try {
      await deleteAccount(id);
      loadData();
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to delete account');
    }
  };

  const groupedAccounts = {
    bank: accounts.filter((a) => a.type === 'bank'),
    broker: accounts.filter((a) => a.type === 'broker'),
    mutual_fund: accounts.filter((a) => a.type === 'mutual_fund'),
    credit_card: accounts.filter((a) => a.type === 'credit_card'),
  };

  const typeDetails = accountTypeConfig;

  const pageTitle = filterType
    ? Array.isArray(filterType)
      ? typeDetails[filterType[0]]?.label ?? 'Accounts'
      : typeDetails[filterType]?.label ?? 'Accounts'
    : 'All Accounts';

  const groupTotal = (type: AccountType) =>
    groupedAccounts[type].reduce((sum, a) => sum + a.balance, 0);

  const currencyTotals = (type: AccountType): Record<Currency, number> => {
    const totals: Record<Currency, number> = { PYG: 0, USD: 0 };
    for (const a of groupedAccounts[type]) {
      totals[a.currency] += a.balance;
    }
    return totals;
  };

  const hasMixedCurrencies = (type: AccountType) => {
    const currencies = new Set(groupedAccounts[type].map((a) => a.currency));
    return currencies.size > 1;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{pageTitle}</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {filterType ? 'View and manage your accounts.' : 'Manage your bank, investment, and credit card accounts.'}
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className={cn(
            buttonVariants({ variant: 'default' }),
            'gap-2 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer shadow-lg'
          )}
        >
          <Plus className="h-4.5 w-4.5" />
          Add Account
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50" />
          <p className="text-zinc-500 dark:text-zinc-400 mt-4 font-medium">Loading accounts...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleTypes.map((accType) => {
            const list = groupedAccounts[accType];
            const details = typeDetails[accType];
            const TypeIcon = details.icon;
            const isExpanded = expandedTypes.has(accType);

            return (
              <div key={accType} className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
                {/* Accordion Header */}
                <button
                  onClick={() => toggleType(accType)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('p-1.5 rounded-lg shrink-0', details.colorClass)}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-bold">{details.label}</h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {list.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {list.length > 0 && (
                      hasMixedCurrencies(accType) ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {Object.entries(currencyTotals(accType))
                            .filter(([, v]) => v !== 0)
                            .map(([cur, total]) => (
                              <span key={cur} className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight">
                                {formatMoney(total, cur as Currency)}
                              </span>
                            ))
                          }
                        </div>
                      ) : (
                        <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
                          {formatMoney(groupTotal(accType), list[0]?.currency ?? 'PYG')}
                        </span>
                      )
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-zinc-400" />
                    )}
                  </div>
                </button>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-zinc-100 dark:border-zinc-800/50 pt-4">
                    {list.length === 0 ? (
                      <div className="p-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
                        <p className="text-zinc-400 text-sm">No accounts in this category.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {list.map((acc) => (
                          <div
                            key={acc.id}
                            className="bg-zinc-50/50 dark:bg-zinc-950/30 rounded-xl border border-zinc-100 dark:border-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-800 transition-all duration-200 flex flex-col justify-between overflow-hidden group"
                          >
                            <div className="p-5 space-y-3">
                              <div className="flex justify-between items-start gap-3">
                                <div>
                                  <h3 className="font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-primary transition-colors">
                                    {acc.name}
                                  </h3>
                                  <span className="text-xs font-medium text-zinc-400 flex items-center gap-1 mt-0.5">
                                    <Building className="h-3 w-3" />
                                    {acc.institution || 'No Institution'}
                                  </span>
                                </div>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 shrink-0">
                                  {acc.currency}
                                </span>
                              </div>

                              <div>
                                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block">
                                  {acc.type === 'credit_card' ? 'Debt Balance' : 'Running Balance'}
                                </span>
                                <span className={cn(
                                  'text-xl font-extrabold',
                                  acc.type === 'credit_card' && acc.balance < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-zinc-900 dark:text-zinc-50'
                                )}>
                                  {acc.type === 'credit_card'
                                    ? formatMoney(Math.abs(acc.balance), acc.currency)
                                    : formatMoney(acc.balance, acc.currency)}
                                </span>
                                {acc.type === 'credit_card' && acc.credit_limit != null && (
                                  <span className="text-xs text-zinc-400 mt-0.5 block">
                                    Available: {formatMoney(acc.credit_limit - Math.abs(acc.balance), acc.currency)}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 text-xs text-zinc-400">
                                <Calendar className="h-3 w-3" />
                                Opened {acc.opening_date}
                                {acc.type === 'mutual_fund' && acc.yield_rate != null && (
                                  <span className="ml-2 text-emerald-500 font-semibold">{acc.yield_rate}% yield</span>
                                )}
                              </div>
                            </div>

                            <div className="bg-white/50 dark:bg-zinc-900/20 border-t border-zinc-100 dark:border-zinc-900 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                              <Link
                                to={`/accounts/${acc.id}`}
                                className={cn(
                                  buttonVariants({ variant: 'outline', size: 'sm' }),
                                  'gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold'
                                )}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Add Transaction
                              </Link>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleOpenEditModal(acc)}
                                  className="p-2.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Edit account"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(acc.id, acc.name)}
                                  className="p-2.5 text-rose-500 hover:text-rose-700 dark:text-rose-400/80 dark:hover:text-rose-400 border border-rose-200/20 dark:border-rose-900/30 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Delete account"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200/50 dark:border-zinc-800/50 flex justify-between items-center">
              <h3 className="font-extrabold text-zinc-900 dark:text-zinc-50 text-lg">
                {editId !== null ? 'Edit Account' : 'Create Account'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Savings, Personal Trading"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    Account Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  >
                    <option value="bank">Bank Account</option>
                    <option value="broker">Brokerage</option>
                    <option value="mutual_fund">Mutual Fund</option>
                    <option value="credit_card">Credit Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="PYG">PYG (Gs.)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Financial Institution
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chase Bank, Itau"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    {type === 'credit_card' ? 'Opening Debt' : type === 'broker' ? 'Opening Cash' : 'Opening Balance'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    Opening Date
                  </label>
                  <input
                    type="date"
                    required
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  />
                </div>
              </div>

              {type === 'mutual_fund' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    Annual Yield Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 5.25"
                    value={yieldRate}
                    onChange={(e) => setYieldRate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  />
                </div>
              )}

              {type === 'credit_card' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                    Credit Limit
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 10000000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-zinc-200/50 dark:border-zinc-800/50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(
                    buttonVariants({ variant: 'default' }),
                    'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer'
                  )}
                >
                  {editId !== null ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
