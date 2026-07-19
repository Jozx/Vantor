import { useState, useEffect, useRef } from 'react';
import {
  getAccounts,
  getCashBalance,
  addCashTransaction,
  chargeCreditCard,
  payCreditCard,
  transferBetweenAccounts,
  getTags,
  createTag,
} from '@/services/financeService';
import type { Account, Tag } from '@/db';
import { cn } from '@/lib/utils';
import AmountInput from '@/components/AmountInput';
import { X, Plus, AlertCircle, Zap, ArrowRight, CreditCard, Banknote, ArrowLeftRight, CircleDollarSign } from 'lucide-react';

type Intent = 'spent' | 'received' | 'pay_card' | 'move_money';

interface QuickTransactionProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const INTENTS: Array<{ key: Intent; label: string; description: string; icon: typeof Banknote; color: string }> = [
  { key: 'spent', label: 'Spent money', description: 'Expense or credit card charge', icon: CircleDollarSign, color: 'text-rose-500 bg-rose-500/10' },
  { key: 'received', label: 'Received money', description: 'Income or deposit', icon: Banknote, color: 'text-emerald-500 bg-emerald-500/10' },
  { key: 'pay_card', label: 'Paid a credit card', description: 'Transfer from bank to card', icon: CreditCard, color: 'text-blue-500 bg-blue-500/10' },
  { key: 'move_money', label: 'Moved money', description: 'Transfer between accounts', icon: ArrowLeftRight, color: 'text-purple-500 bg-purple-500/10' },
];

export default function QuickTransaction({ open, onClose, onCreated }: QuickTransactionProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [balanceMap, setBalanceMap] = useState<Map<number, number>>(new Map());

  // Form fields
  const [fromAccountId, setFromAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagId, setTagId] = useState<number | null>(null);
  const [customTagName, setCustomTagName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!open || initializedRef.current) return;
    initializedRef.current = true;
    setLoading(true);
    (async () => {
      try {
        const [accts, tg] = await Promise.all([getAccounts(), getTags()]);
        setAccounts(accts);
        setTags(tg);
        const balances = new Map<number, number>();
        await Promise.all(
          accts.map(async (a) => {
            const bal = await getCashBalance(a.id);
            balances.set(a.id, bal);
          })
        );
        setBalanceMap(balances);
      } catch (err) {
        console.error('Failed to load quick tx data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const reset = () => {
    initializedRef.current = false;
    setStep(1);
    setIntent(null);
    setFromAccountId(null);
    setToAccountId(null);
    setAmount(0);
    setDescription('');
    setTagId(null);
    setCustomTagName('');
    setError('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectIntent = (i: Intent) => {
    setIntent(i);
    setStep(2);
    setFromAccountId(null);
    setToAccountId(null);
    setAmount(0);
    setDescription('');
    setTagId(null);
    setCustomTagName('');
    setError('');
  };

  // Filter accounts based on intent
  const fromAccounts = (() => {
    if (!intent) return [];
    switch (intent) {
      case 'spent':
        return accounts.filter((a) => a.type === 'bank' || a.type === 'credit_card');
      case 'received':
        return accounts.filter((a) => a.type === 'bank' || a.type === 'mutual_fund');
      case 'pay_card':
        return accounts.filter((a) => a.type === 'bank');
      case 'move_money':
        return accounts;
    }
  })();

  const toAccounts = (() => {
    if (!intent) return [];
    if (intent === 'pay_card') return accounts.filter((a) => a.type === 'credit_card');
    if (intent === 'move_money') return accounts.filter((a) => a.id !== fromAccountId);
    return [];
  })();

  const selectedAccount = intent === 'pay_card' || intent === 'move_money'
    ? accounts.find((a) => a.id === fromAccountId)
    : accounts.find((a) => a.id === fromAccountId);

  const isCardCharge = intent === 'spent' && selectedAccount?.type === 'credit_card';
  const requiresTag = intent === 'spent' || intent === 'received';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fromAccountId) {
      setError('Select an account');
      return;
    }

    if (amount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (!date) {
      setError('Date is required');
      return;
    }

    // Resolve custom tag if needed
    let resolvedTagId = tagId;
    if (requiresTag && tagId === -1) {
      if (!customTagName.trim()) {
        setError('Please enter a tag name');
        return;
      }
      try {
        const tagColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        const newTagId = await createTag({ name: customTagName.trim(), color: tagColor });
        resolvedTagId = newTagId;
        const updatedTags = await getTags();
        setTags(updatedTags);
      } catch {
        setError('Failed to create custom tag');
        return;
      }
    }

    if (requiresTag && resolvedTagId === null) {
      setError('Tag is required');
      return;
    }

    setSaving(true);
    try {
      switch (intent) {
        case 'spent': {
          if (isCardCharge) {
            await chargeCreditCard(
              fromAccountId,
              amount,
              resolvedTagId!,
              description.trim(),
              date,
            );
          } else {
            await addCashTransaction({
              account_id: fromAccountId,
              type: 'expense',
              amount: amount,
              tag_id: resolvedTagId,
              description: description.trim() || 'Expense',
              occurred_at: date,
              related_security_transaction_id: null,
              linked_transaction_id: null,
            });
          }
          break;
        }
        case 'received': {
          await addCashTransaction({
            account_id: fromAccountId,
            type: 'income',
            amount: amount,
            tag_id: resolvedTagId,
            description: description.trim() || 'Income',
            occurred_at: date,
            related_security_transaction_id: null,
            linked_transaction_id: null,
          });
          break;
        }
        case 'pay_card': {
          if (!toAccountId) {
            setError('Select a credit card to pay');
            setSaving(false);
            return;
          }
          await payCreditCard(fromAccountId, toAccountId, amount, date);
          break;
        }
        case 'move_money': {
          if (!toAccountId) {
            setError('Select a destination account');
            setSaving(false);
            return;
          }
          await transferBetweenAccounts(fromAccountId, toAccountId, amount, date, description.trim() || undefined);
          break;
        }
      }

      reset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200/50 dark:border-zinc-800/50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h3 className="font-extrabold text-zinc-900 dark:text-zinc-50 text-lg">
              {step === 1 ? 'What happened?' : 'Details'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50" />
            <p className="text-zinc-500 dark:text-zinc-400 mt-4 font-medium">Loading accounts...</p>
          </div>
        ) : step === 1 ? (
          /* Step 1: Choose Intent */
          <div className="p-4 space-y-2">
            {INTENTS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => selectIntent(item.key)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-all cursor-pointer text-left group"
                >
                  <div className={cn('p-2.5 rounded-xl shrink-0', item.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-zinc-50 text-sm">{item.label}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{item.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          /* Step 2: Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Back button */}
            <button
              type="button"
              onClick={() => { setStep(1); setIntent(null); setError(''); }}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer flex items-center gap-1"
            >
              ← Change
            </button>

            {/* From Account */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                {intent === 'pay_card' ? 'Pay From' : intent === 'move_money' ? 'From' : 'Account'} <span className="text-rose-500">*</span>
              </label>
              <select
                value={fromAccountId ?? ''}
                onChange={(e) => {
                  setFromAccountId(Number(e.target.value) || null);
                  setToAccountId(null);
                }}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
              >
                <option value="">Select account...</option>
                {fromAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
              {fromAccounts.length === 0 && (
                <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                  No matching accounts available. Create one first.
                </p>
              )}
              {selectedAccount && (
                <p className="text-xs text-zinc-400 mt-1">
                  Balance: {new Intl.NumberFormat('es-PY', { style: 'currency', currency: selectedAccount.currency }).format(
                    balanceMap.get(selectedAccount.id) ?? 0,
                  )}
                </p>
              )}
            </div>

            {/* To Account (for pay_card and move_money) */}
            {(intent === 'pay_card' || intent === 'move_money') && (
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  {intent === 'pay_card' ? 'Pay To (Credit Card)' : 'To'}
                </label>
                <select
                  value={toAccountId ?? ''}
                  onChange={(e) => setToAccountId(Number(e.target.value) || null)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                >
                  <option value="">Select account...</option>
                  {toAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
                {toAccounts.length === 0 && (
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                    No matching accounts available. Create one first.
                  </p>
                )}
              </div>
            )}

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Amount <span className="text-rose-500">*</span>
                </label>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  currency={selectedAccount?.currency ?? 'PYG'}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                />
              </div>
            </div>

            {/* Tag (for spent/received) */}
            {requiresTag && (
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Tag <span className="text-rose-500">*</span>
                </label>
                <select
                  value={tagId === null ? '' : tagId === -1 ? '__custom__' : String(tagId)}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setTagId(-1);
                      setCustomTagName('');
                    } else {
                      setTagId(e.target.value ? Number(e.target.value) : null);
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                >
                  <option value="">Select a tag...</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                  <option value="__custom__">Other (custom)...</option>
                </select>
                {tagId === -1 && (
                  <input
                    type="text"
                    placeholder="Enter tag name..."
                    value={customTagName}
                    onChange={(e) => setCustomTagName(e.target.value)}
                    className="w-full mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
                  />
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                Description
              </label>
              <input
                type="text"
                placeholder="Optional note..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  'px-4 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2',
                  'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200',
                  saving && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Saving...' : 'Record'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
