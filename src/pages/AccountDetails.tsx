import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getAccountById,
  getCashBalance,
  getCashTransactions,
  addCashTransaction,
  deleteCashTransactionValidated,
  deleteLinkedTransaction,
  deleteTrade,
  editCashTransaction,
  getHoldingsWithStats,
  getSecurityTransactions,
  buySecurity,
  sellSecurity,
  getTags,
  createTag,
  chargeCreditCard,
  payCreditCard,
  getCardDebtBalance,
  getAccounts,
  getSettings,
} from '@/services/financeService';
import { getSecurityPrice } from '@/services/marketService';
import type { HoldingWithStats } from '@/services/financeService';
import type { Account, CashTransaction, SecurityTransaction, CashTransactionType, Tag } from '@/db';
import { buttonVariants } from '@/components/ui/button';
import AmountInput from '@/components/AmountInput';
import { cn, formatMoney, displayTag, todayISO } from '@/lib/utils';
import {
  ArrowLeft,
  CircleDollarSign,
  TrendingUp,
  Landmark,
  Trash2,
  Pencil,
  Calendar,
  AlertCircle,
  Briefcase,
  History,
  FileText,
  CreditCard,
  Info,
} from 'lucide-react';

export default function AccountDetails() {
  const { id } = useParams<{ id: string }>();
  const accountId = parseInt(id || '0');

  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [cardDebt, setCardDebt] = useState<number>(0);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  
  // Broker specific states
  const [holdings, setHoldings] = useState<HoldingWithStats[]>([]);
  const [securityTransactions, setSecurityTransactions] = useState<SecurityTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'holdings' | 'cash' | 'trades'>('holdings');
  const [marketPrices, setMarketPrices] = useState<Map<string, number>>(new Map());
  const [hasApiKey, setHasApiKey] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Broker Form State (Buy/Sell)
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [commission, setCommission] = useState<number>(0);
  const [tradeDate, setTradeDate] = useState(todayISO());
  const [tradeDesc, setTradeDesc] = useState('');
  const [tradeMarket, setTradeMarket] = useState('US');

  // Cash Ledger Form State (Generic Cash Transaction for Bank/Mutual Fund)
  const [cashType, setCashType] = useState<CashTransactionType>('income');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashDesc, setCashDesc] = useState('');
  const [cashDate, setCashDate] = useState(todayISO());
  const [cashTagId, setCashTagId] = useState<number | null>(null);
  const [customTagName, setCustomTagName] = useState('');

  // Credit Card Charge Form State
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeDate, setChargeDate] = useState(todayISO());
  const [chargeTagId, setChargeTagId] = useState<number | null>(null);
  const [chargeCustomTag, setChargeCustomTag] = useState('');

  // Credit Card Payment Form State
  const [payFromAccountId, setPayFromAccountId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(todayISO());
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);

  // Tags list
  const [tags, setTags] = useState<Tag[]>([]);

  // Edit modal state
  const [editingTx, setEditingTx] = useState<CashTransaction | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDesc, setEditDesc] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTagId, setEditTagId] = useState<number | null>(null);
  const [editError, setEditError] = useState('');

  const loadData = async (signal?: AbortSignal) => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const acc = await getAccountById(accountId);
      if (signal?.aborted) return;
      if (!acc) {
        setError('Account not found');
        return;
      }
      setAccount(acc);

      const bal = await getCashBalance(accountId);
      if (signal?.aborted) return;
      setBalance(bal);

      if (acc.type === 'credit_card') {
        const debt = await getCardDebtBalance(accountId);
        if (signal?.aborted) return;
        setCardDebt(debt);
      }

      const txs = await getCashTransactions(accountId);
      if (signal?.aborted) return;
      setCashTransactions(txs);

      if (acc.type === 'broker') {
        const h = await getHoldingsWithStats(accountId);
        if (signal?.aborted) return;
        setHoldings(h.filter((item) => item.quantity > 0));

        const st = await getSecurityTransactions(accountId);
        if (signal?.aborted) return;
        setSecurityTransactions(st);

        const settings = await getSettings();
        if (signal?.aborted) return;
        setHasApiKey(!!settings.stock_api_key);

        const prices = new Map<string, number>();
        for (const holding of h) {
          if (holding.quantity <= 0) continue;
          const price = await getSecurityPrice(holding.symbol);
          if (price !== null) {
            prices.set(holding.symbol, price);
          }
        }
        if (signal?.aborted) return;
        setMarketPrices(prices);
      }

      if (acc.type === 'credit_card') {
        const bankAccs = await getAccounts();
        if (signal?.aborted) return;
        setBankAccounts(bankAccs.filter((a) => a.type === 'bank'));
      }

      const t = await getTags();
      if (signal?.aborted) return;
      setTags(t);
    } catch (err) {
      console.error(err);
      if (!signal?.aborted) setError('Failed to load account information');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  if (!accountId || isNaN(accountId)) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="font-semibold">Invalid account ID.</span>
        </div>
      </div>
    );
  }

  // Handle Buy/Sell submission (Broker)
  const handleSecurityTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!symbol.trim()) {
      setFormError('Symbol is required');
      return;
    }
    if (quantity <= 0) {
      setFormError('Quantity must be greater than zero');
      return;
    }
    if (price <= 0) {
      setFormError('Price must be greater than zero');
      return;
    }
    if (commission < 0) {
      setFormError('Commission must be 0 or positive');
      return;
    }

    setIsSubmitting(true);
    try {
      if (tradeType === 'buy') {
        await buySecurity(
          accountId,
          symbol,
          quantity,
          price,
          commission,
          tradeDate,
          tradeDesc.trim(),
          tradeMarket,
        );
      } else {
        await sellSecurity(
          accountId,
          symbol,
          quantity,
          price,
          commission,
          tradeDate,
          tradeDesc.trim()
        );
      }

      // Reset Form and reload
      setSymbol('');
      setQuantity(0);
      setPrice(0);
      setCommission(0);
      setTradeDesc('');
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'Trade execution failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle generic Cash Transaction (Bank/Mutual Fund)
  const handleCashTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (cashAmount <= 0) {
      setFormError('Amount must be greater than zero');
      return;
    }

    // Tag is required for income, expense, and charge
    if ((cashType === 'income' || cashType === 'expense' || cashType === 'charge') && !cashTagId && cashTagId !== 0) {
      if (cashTagId === -1 && !customTagName.trim()) {
        setFormError('Please enter a tag name for "Other"');
        return;
      }
    }

    let resolvedTagId = cashTagId;

    // Handle custom tag creation
    if (cashTagId === -1) {
      try {
        const tagColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        const newTagId = await createTag({ name: customTagName.trim() || 'Other', color: tagColor });
        resolvedTagId = newTagId;
        // Refresh tags list
        const updatedTags = await getTags();
        setTags(updatedTags);
      } catch (err: unknown) {
        console.error(err);
        setFormError('Failed to create custom tag');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await addCashTransaction({
        account_id: accountId,
        type: cashType,
        amount: cashAmount,
        tag_id: resolvedTagId,
        description: cashDesc.trim() || `${cashType.toUpperCase()} - Manual entry`,
        occurred_at: cashDate,
        related_security_transaction_id: null,
      });

      // Reset form and reload
      setCashAmount(0);
      setCashDesc('');
      setCashTagId(null);
      setCustomTagName('');
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'Failed to add cash entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCashTx = async (txId: number) => {
    if (!window.confirm('Delete this cash ledger entry? This will update the running balance.')) {
      return;
    }
    try {
      // Try the specific delete first; fall back to validated simple delete
      const tx = cashTransactions.find((t) => t.id === txId);
      if (tx?.linked_transaction_id) {
        await deleteLinkedTransaction(txId);
      } else if (tx?.related_security_transaction_id) {
        await deleteTrade(tx.related_security_transaction_id);
      } else {
        await deleteCashTransactionValidated(txId);
      }
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  // ── Delete a trade from the trade log ───────────────────────────────────────
  const handleDeleteTrade = async (tradeId: number) => {
    if (!window.confirm('Delete this trade and its associated cash entry? This will update balances.')) {
      return;
    }
    try {
      await deleteTrade(tradeId);
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to delete trade');
    }
  };

  // ── Edit cash transaction ───────────────────────────────────────────────────
  const openEditModal = (tx: CashTransaction) => {
    setEditingTx(tx);
    setEditAmount(tx.amount);
    setEditDesc(tx.description);
    setEditDate(tx.occurred_at);
    setEditTagId(tx.tag_id);
    setEditError('');
  };

  const handleEditSubmit = async () => {
    if (!editingTx) return;
    setEditError('');
    if (editAmount <= 0) {
      setEditError('Amount must be greater than zero');
      return;
    }
    try {
      await editCashTransaction(editingTx.id, {
        amount: editAmount,
        description: editDesc,
        occurred_at: editDate,
        tag_id: editTagId,
      });
      setEditingTx(null);
      await loadData();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update transaction');
    }
  };

  // ── Credit Card Charge Handler ──────────────────────────────────────────────
  const handleCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (chargeTagId === null || chargeTagId === undefined) {
      setFormError('Tag is required for credit card charges');
      return;
    }
    if (chargeTagId === -1 && !chargeCustomTag.trim()) {
      setFormError('Please enter a tag name');
      return;
    }

    if (chargeAmount <= 0) {
      setFormError('Amount must be greater than zero');
      return;
    }

    let resolvedTagId = chargeTagId;

    // Handle custom tag creation
    if (chargeTagId === -1) {
      try {
        const tagColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        const newTagId = await createTag({ name: chargeCustomTag.trim() || 'Other', color: tagColor });
        resolvedTagId = newTagId;
        const updatedTags = await getTags();
        setTags(updatedTags);
      } catch {
        setFormError('Failed to create custom tag');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await chargeCreditCard(
        accountId,
        chargeAmount,
        resolvedTagId,
        chargeDesc.trim(),
        chargeDate,
      );
      setChargeAmount(0);
      setChargeDesc('');
      setChargeTagId(null);
      setChargeCustomTag('');
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to record charge');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Credit Card Payment Handler ─────────────────────────────────────────────
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!payFromAccountId) {
      setFormError('Select a bank account to pay from');
      return;
    }

    if (payAmount <= 0) {
      setFormError('Amount must be greater than zero');
      return;
    }

    setIsSubmitting(true);
    try {
      await payCreditCard(payFromAccountId, accountId, payAmount, payDate);
      setPayAmount(0);
      setPayFromAccountId(null);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50"></div>
        <p className="text-zinc-500 dark:text-zinc-400 mt-4 font-medium">Loading details...</p>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="space-y-6">
        <Link to="/accounts" className={cn(buttonVariants({ variant: 'ghost' }), 'gap-2')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Link>
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="font-semibold">{error || 'Failed to find account'}</span>
        </div>
      </div>
    );
  }

  const accountIconMap: Record<string, typeof Landmark> = {
    bank: Landmark,
    mutual_fund: TrendingUp,
    broker: CircleDollarSign,
    credit_card: CreditCard,
  };
  const AccountIcon = accountIconMap[account.type] ?? CircleDollarSign;

  const isCreditCard = account.type === 'credit_card';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Navigation */}
      <div>
        <Link
          to="/accounts"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold'
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Link>
      </div>

      {/* Account Info Header Card */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-xs p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex gap-4 items-center">
          <div className="p-3 bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 rounded-xl">
            <AccountIcon className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{account.name}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 capitalize">
                {account.type.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1 flex items-center gap-1.5">
              <span>{account.institution}</span>
              <span>•</span>
              <span>Opened {account.opening_date}</span>
              {account.type === 'mutual_fund' && (
                <>
                  <span>•</span>
                  <span className="text-emerald-500 font-semibold">{account.yield_rate}% Yield</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
            {isCreditCard ? 'Debt Balance' : 'Running Cash Balance'}
          </span>
          <span className="text-3xl font-black text-zinc-900 dark:text-zinc-50">
            {isCreditCard ? formatMoney(cardDebt, account.currency) : formatMoney(balance, account.currency)}
          </span>
          {isCreditCard && (
            <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
              {account.credit_limit != null && (
                <>
                  <span>Limit: {formatMoney(account.credit_limit, account.currency)}</span>
                  <span>Available: {formatMoney(account.credit_limit - cardDebt, account.currency)}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Forms on left (or top), tables/data on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="space-y-6">
          {account.type === 'broker' ? (
            /* Broker Trade Form (Buy / Sell) */
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-emerald-500" />
                Record Trade Transaction
              </h3>

              <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-950 p-1 mb-4">
                <button
                  type="button"
                  onClick={() => setTradeType('buy')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer',
                    tradeType === 'buy'
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  )}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setTradeType('sell')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer',
                    tradeType === 'sell'
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  )}
                >
                  SELL
                </button>
              </div>

              <form onSubmit={handleSecurityTrade} className="space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Security Symbol
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AAPL, SPY, TSLA"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Market
                    </label>
                    <select
                      value={tradeMarket}
                      onChange={(e) => setTradeMarket(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    >
                      <option value="US">US (NYSE/NASDAQ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Quantity <span className="text-rose-500">*</span>
                    </label>
                    <AmountInput
                      value={quantity}
                      onChange={setQuantity}
                      currency={account.currency}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Price <span className="text-rose-500">*</span>
                    </label>
                    <AmountInput
                      value={price}
                      onChange={setPrice}
                      currency={account.currency}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Commission
                    </label>
                    <AmountInput
                      value={commission}
                      onChange={setCommission}
                      currency={account.currency}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Trade Date
                    </label>
                    <input
                      type="date"
                      required
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Memo / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Optional description"
                    value={tradeDesc}
                    onChange={(e) => setTradeDesc(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    buttonVariants({ variant: 'default' }),
                    'w-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer text-xs font-bold py-2.5 shadow-sm',
                    isSubmitting && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? 'Saving...' : 'Record Trade'}
                </button>
              </form>
            </div>
          ) : isCreditCard ? (
            /* Credit Card: Charge + Payment Forms */
            <>
              {/* Charge Form */}
              <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-amber-500" />
                  New Charge
                </h3>

                <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-3">
                  <span><span className="font-semibold">Debt:</span> {formatMoney(cardDebt, account.currency)}</span>
                  {account.credit_limit != null && (
                    <span><span className="font-semibold">Available:</span> {formatMoney(account.credit_limit - cardDebt, account.currency)}</span>
                  )}
                </div>

                <form onSubmit={handleCharge} className="space-y-4">
                  {formError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Amount <span className="text-rose-500">*</span>
                      </label>
                      <AmountInput
                        value={chargeAmount}
                        onChange={setChargeAmount}
                        currency={account.currency}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        value={chargeDate}
                        onChange={(e) => setChargeDate(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                      />
                      {chargeDate && chargeDate > todayISO() && (
                        <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">This date is in the future.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Tag <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={chargeTagId === null ? '' : chargeTagId === -1 ? '__custom__' : String(chargeTagId)}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setChargeTagId(-1);
                          setChargeCustomTag('');
                        } else {
                          setChargeTagId(e.target.value ? Number(e.target.value) : null);
                        }
                      }}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    >
                      <option value="">Select a tag...</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                      <option value="__custom__">Other (custom)...</option>
                    </select>
                    {chargeTagId === -1 && (
                      <input
                        type="text"
                        placeholder="Enter tag name..."
                        value={chargeCustomTag}
                        onChange={(e) => setChargeCustomTag(e.target.value)}
                        className="w-full mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Supermarket purchase"
                      value={chargeDesc}
                      onChange={(e) => setChargeDesc(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      buttonVariants({ variant: 'default' }),
                      'w-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer text-xs font-bold py-2.5 shadow-sm',
                      isSubmitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSubmitting ? 'Saving...' : 'Record Charge'}
                  </button>
                </form>
              </div>

              {/* Payment Form */}
              <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-500" />
                  Make Payment
                </h3>

                <form onSubmit={handlePayment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Pay From (Bank Account) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={payFromAccountId ?? ''}
                      onChange={(e) => setPayFromAccountId(Number(e.target.value) || null)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    >
                      <option value="">Select bank account...</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Amount <span className="text-rose-500">*</span>
                      </label>
                      <AmountInput
                        value={payAmount}
                        onChange={setPayAmount}
                        currency={account.currency}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                      />
                      {payDate && payDate > todayISO() && (
                        <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">This date is in the future.</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      buttonVariants({ variant: 'default' }),
                      'w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer text-xs font-bold py-2.5 shadow-sm',
                      isSubmitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSubmitting ? 'Saving...' : 'Make Payment'}
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Bank/Mutual Fund/Credit Card Cash Ledger Form */
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-zinc-800 dark:text-zinc-200" />
                {isCreditCard ? 'Record Transaction' : 'Add Ledger Entry'}
              </h3>

              <form onSubmit={handleCashTransactionSubmit} className="space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Transaction Type
                  </label>
                  <select
                    value={cashType}
                    onChange={(e) => setCashType(e.target.value as CashTransactionType)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                  >
                    {isCreditCard ? (
                      <>
                        <option value="charge">Charge (Purchase)</option>
                        <option value="payment">Payment</option>
                      </>
                    ) : (
                      <>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                        <option value="deposit">Deposit</option>
                        <option value="withdrawal">Withdrawal</option>
                        {account.type === 'mutual_fund' && (
                          <option value="interest_accrual">Interest Accrual</option>
                        )}
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Amount <span className="text-rose-500">*</span>
                    </label>
                    <AmountInput
                      value={cashAmount}
                      onChange={setCashAmount}
                      currency={account.currency}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={cashDate}
                      onChange={(e) => setCashDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                    {cashDate && cashDate > todayISO() && (
                      <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">This date is in the future.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isCreditCard ? 'e.g. Supermarket purchase' : 'Details about the transaction'}
                    value={cashDesc}
                    onChange={(e) => setCashDesc(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Tag {(cashType === 'income' || cashType === 'expense' || cashType === 'charge') && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    value={cashTagId === null ? '' : cashTagId === -1 ? '__custom__' : String(cashTagId)}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setCashTagId(-1);
                        setCustomTagName('');
                      } else {
                        setCashTagId(e.target.value ? Number(e.target.value) : null);
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                  >
                    <option value="">No tag</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                    <option value="__custom__">Other (custom)...</option>
                  </select>
                  {cashTagId === -1 && (
                    <input
                      type="text"
                      placeholder="Enter tag name..."
                      value={customTagName}
                      onChange={(e) => setCustomTagName(e.target.value)}
                      className="w-full mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    buttonVariants({ variant: 'default' }),
                    'w-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer text-xs font-bold py-2.5 shadow-sm',
                    isSubmitting && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? 'Saving...' : (isCreditCard ? 'Record Charge' : 'Record Entry')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Details and History Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Selector */}
          {account.type === 'broker' && (
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6 text-sm">
              <button
                onClick={() => setActiveTab('holdings')}
                className={cn(
                  'pb-3 font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-all',
                  activeTab === 'holdings'
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                )}
              >
                <Briefcase className="h-4 w-4" />
                Active Holdings
              </button>
              <button
                onClick={() => setActiveTab('cash')}
                className={cn(
                  'pb-3 font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-all',
                  activeTab === 'cash'
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                )}
              >
                <History className="h-4 w-4" />
                Cash Ledger
              </button>
              <button
                onClick={() => setActiveTab('trades')}
                className={cn(
                  'pb-3 font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-all',
                  activeTab === 'trades'
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                )}
              >
                <FileText className="h-4 w-4" />
                Trade Log
              </button>
            </div>
          )}

          {/* Active Holdings View */}
          {account.type === 'broker' && activeTab === 'holdings' && (
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-200/40 dark:border-zinc-800/40">
                <h4 className="font-bold text-zinc-800 dark:text-zinc-200">Portfolio Holdings</h4>
              </div>

              {!hasApiKey && (
                <div className="mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
                  <Info className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">Market prices unavailable.</span>{' '}
                    Add your Finnhub API key in{' '}
                    <a href="#/settings" className="underline font-bold hover:text-amber-700">Settings</a>{' '}
                    to see live prices and P/L.
                  </p>
                </div>
              )}

              {holdings.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">
                  No active security holdings in this broker account. Use the trade panel to record a purchase.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/20 dark:bg-zinc-950/5 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-200/50 dark:border-zinc-800/50">
                        <th className="px-6 py-3">Symbol</th>
                        <th className="px-6 py-3 text-right">Shares</th>
                        <th className="px-6 py-3 text-right">Avg Cost</th>
                        <th className="px-6 py-3 text-right">Book Value</th>
                        <th className="px-6 py-3 text-right">Mkt Price</th>
                        <th className="px-6 py-3 text-right">Mkt Value</th>
                        <th className="px-6 py-3 text-right">P/L</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/30 dark:divide-zinc-800/30">
                      {holdings.map((h) => {
                        const mktPrice = marketPrices.get(h.symbol) ?? null;
                        const mktValue = mktPrice !== null ? h.quantity * mktPrice : null;
                        const pl = mktValue !== null ? mktValue - h.totalCost : null;
                        return (
                          <tr key={h.id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                            <td className="px-6 py-4 font-extrabold text-zinc-900 dark:text-zinc-100">
                              {h.symbol}
                            </td>
                            <td className="px-6 py-4 text-right font-medium">{h.quantity}</td>
                            <td className="px-6 py-4 text-right font-medium">
                              {formatMoney(h.averageCost, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-right font-bold">
                              {formatMoney(h.totalCost, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-right font-medium">
                              {mktPrice !== null ? formatMoney(mktPrice, account.currency) : (
                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-bold">
                              {mktValue !== null ? formatMoney(mktValue, account.currency) : (
                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-bold">
                              {pl !== null ? (
                                <span className={cn(pl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                  {pl >= 0 ? '+' : ''}{formatMoney(pl, account.currency)}
                                </span>
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setTradeType('sell');
                                  setSymbol(h.symbol);
                                  setQuantity(h.quantity);
                                }}
                                className={cn(
                                  buttonVariants({ variant: 'outline', size: 'sm' }),
                                  'text-xs text-rose-500 border-rose-500/20 dark:border-rose-950/50 hover:bg-rose-50 dark:hover:bg-rose-950/10 cursor-pointer font-bold min-h-[44px]'
                                )}
                              >
                                Sell Position
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Cash Ledger View (All accounts) */}
          {activeTab === 'cash' && (
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-200/40 dark:border-zinc-800/40 flex justify-between items-center">
                <h4 className="font-bold text-zinc-800 dark:text-zinc-200">Cash Transactions Ledger</h4>
                <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-500">
                  {cashTransactions.length} entries
                </span>
              </div>

              {cashTransactions.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">
                  No ledger entries recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/20 dark:bg-zinc-950/5 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-200/50 dark:border-zinc-800/50">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Tag</th>
                        <th className="px-6 py-3">Description</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                        <th className="px-6 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/30 dark:divide-zinc-800/30">
                      {cashTransactions.map((tx) => {
                        const isPositive = [
                          'income',
                          'deposit',
                          'interest_accrual',
                          'sell_credit',
                        ].includes(tx.type);
                        const txTag = tx.tag_id ? tags.find((t) => t.id === tx.tag_id) : null;
                        return (
                          <tr key={tx.id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                            <td className="px-6 py-4 text-xs text-zinc-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                {tx.occurred_at}
                              </div>
                              {tx.created_at && (
                                <div className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-0.5 ml-5">
                                  created {tx.created_at}
                                </div>
                              )}
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
                              {txTag ? (
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: txTag.color + '20', color: txTag.color }}
                                >
                                  {displayTag(txTag.name, tx.description)}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">
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
                              {isPositive ? '+' : '-'}{formatMoney(tx.amount, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => openEditModal(tx)}
                                  className="p-3 text-zinc-400 hover:text-blue-500 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="Edit entry"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCashTx(tx.id)}
                                  className="p-3 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="Delete entry"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Trade Log View (Broker Only) */}
          {account.type === 'broker' && activeTab === 'trades' && (
            <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-200/40 dark:border-zinc-800/40 flex justify-between items-center">
                <h4 className="font-bold text-zinc-800 dark:text-zinc-200">Security Trade Logs</h4>
                <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-500">
                  {securityTransactions.length} trades
                </span>
              </div>

              {securityTransactions.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">
                  No trade logs found in this account.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/20 dark:bg-zinc-950/5 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-200/50 dark:border-zinc-800/50">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3 text-right">Qty</th>
                        <th className="px-6 py-3 text-right">Price</th>
                        <th className="px-6 py-3 text-right">Comm.</th>
                        <th className="px-6 py-3 text-right">Net Value</th>
                        <th className="px-6 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/30 dark:divide-zinc-800/30">
                      {securityTransactions.map((st) => {
                        const isBuy = st.type === 'buy';
                        const netVal = isBuy
                          ? st.quantity * st.price + st.commission
                          : st.quantity * st.price - st.commission;
                        return (
                          <tr key={st.id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                            <td className="px-6 py-4 text-xs text-zinc-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                {st.occurred_at}
                              </div>
                              {st.created_at && (
                                <div className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-0.5 ml-5">
                                  created {st.created_at}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  'text-xs font-bold px-2.5 py-0.5 rounded-full capitalize',
                                  isBuy
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                )}
                              >
                                {st.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-medium">{st.quantity}</td>
                            <td className="px-6 py-4 text-right font-medium">
                              {formatMoney(st.price, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-zinc-400">
                              {formatMoney(st.commission, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-right font-bold">
                              {formatMoney(netVal, account.currency)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleDeleteTrade(st.id)}
                                className="p-3 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center mx-auto"
                                title="Delete trade"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Cash Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">Edit Transaction</h3>
            {editError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{editError}</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Amount</label>
                <AmountInput value={editAmount} onChange={setEditAmount} currency={account.currency} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Date</label>
                <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Description</label>
                <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Tag</label>
                <select value={editTagId === null ? '' : String(editTagId)} onChange={(e) => setEditTagId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50">
                  <option value="">No tag</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditingTx(null)}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs font-semibold cursor-pointer')}>
                Cancel
              </button>
              <button onClick={handleEditSubmit}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-xs font-semibold cursor-pointer')}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
