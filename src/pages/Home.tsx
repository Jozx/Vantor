import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAccounts, getCashBalanceBatch, computeNetWorth } from '@/services/financeService';
import type { NetWorthResult } from '@/services/financeService';
import {
  getNetWorthHistory,
  type NetWorthHistoryPoint,
} from '@/services/netWorthService';
import {
  exportToZip,
  parseImportZip,
  commitImport,
  triggerDownload,
  backupFilename,
  type ImportManifest,
} from '@/services/importExportService';
import type { Account, Currency } from '@/db';
import { formatMoney, cn, accountTypeConfig } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import QuickTransaction from '@/components/QuickTransaction';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  CircleDollarSign,
  Wallet,
  Download,
  Upload,
  AlertTriangle,
  X,
  Check,
  Loader2,
  ArrowLeftRight,
  ShieldCheck,
  Zap,
  PiggyBank,
  Receipt,
} from 'lucide-react';

interface AccountWithBalance extends Account {
  balance: number;
}

type ChartRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export default function Home() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importManifest, setImportManifest] = useState<ImportManifest | null>(null);
  const [pendingZipBlob, setPendingZipBlob] = useState<Blob | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showQuickTx, setShowQuickTx] = useState(false);
  const [netWorth, setNetWorth] = useState<NetWorthResult | null>(null);

  // Net worth chart state
  const [chartRange, setChartRange] = useState<ChartRange>('1Y');
  const [chartData, setChartData] = useState<NetWorthHistoryPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartCurrency, setChartCurrency] = useState<Currency>('PYG');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await getAccounts();
        if (cancelled) return;
        const balances = await getCashBalanceBatch(data.map((a) => a.id));
        if (cancelled) return;
        const withBalances = data.map((acc) => ({ ...acc, balance: balances.get(acc.id) ?? 0 }));
        setAccounts(withBalances);
        const nw = await computeNetWorth();
        if (cancelled) return;
        setNetWorth(nw);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch net worth history when range changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChartLoading(true);
      try {
        // Map range to months
        const monthsMap: Record<ChartRange, number> = {
          '1M': 1,
          '3M': 3,
          '6M': 6,
          '1Y': 12,
          'ALL': 60, // 5 years max
        };
        const months = monthsMap[chartRange];
        const history = await getNetWorthHistory(months);
        if (!cancelled) {
          setChartData(history);
        }
      } catch (err) {
        console.error('Failed to load chart data:', err);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chartRange]);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const blob = await exportToZip();
      triggerDownload(blob, backupFilename());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError('');
    setImportStatus('Parsing backup file...');
    try {
      const manifest = await parseImportZip(file);
      setImportManifest(manifest);
      setPendingZipBlob(file);
      setShowConfirm(true);
      setImportStatus('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse ZIP');
      setImportStatus('');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingZipBlob) return;
    setImporting(true);
    setImportStatus('Importing data...');
    setShowConfirm(false);
    try {
      await commitImport(pendingZipBlob);
      setImportStatus('Import complete! Reloading...');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setImportStatus('');
    } finally {
      setImporting(false);
      setPendingZipBlob(null);
      setImportManifest(null);
    }
  };

  const typeConfig = accountTypeConfig;

  const totalByType = (type: Account['type']) =>
    accounts.filter((a) => a.type === type).reduce((sum, a) => sum + a.balance, 0);

  const currencyTotalsByType = (type: Account['type']): Record<Currency, number> => {
    const totals: Record<Currency, number> = { PYG: 0, USD: 0 };
    for (const a of accounts.filter((a) => a.type === type)) {
      totals[a.currency] += a.balance;
    }
    return totals;
  };

  const hasMixedCurrenciesByType = (type: Account['type']) => {
    const currencies = new Set(accounts.filter((a) => a.type === type).map((a) => a.currency));
    return currencies.size > 1;
  };

  const totalByCurrency = (curr: Currency) =>
    accounts.filter((a) => a.currency === curr).reduce((sum, a) => sum + a.balance, 0);

  const pygTotal = netWorth?.totalPyg ?? totalByCurrency('PYG');
  const usdTotal = netWorth?.totalUsd ?? totalByCurrency('USD');

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-24 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Overview of your financial accounts
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-3" />
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">Loading dashboard...</span>
        </div>
      )}

      {/* Error State */}
      {loadError && !loading && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Failed to load dashboard</p>
            <p className="text-xs text-rose-500/80 mt-0.5">{loadError}</p>
          </div>
          <button
            onClick={() => { setLoading(true); setLoadError(''); window.location.reload(); }}
            className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Net Worth Summary */}
      {!loading && !loadError && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Wallet className="h-5 w-5 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total PYG</span>
          </div>
          <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
            {formatMoney(pygTotal, 'PYG')}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Wallet className="h-5 w-5 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total USD</span>
          </div>
          <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
            {formatMoney(usdTotal, 'USD')}
          </p>
        </div>
      </div>
      )}

      {/* Assets / Liabilities Breakdown */}
      {!loading && !loadError && netWorth && (
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
          Assets &amp; Liabilities
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Assets</span>
            </div>
            <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
              {formatMoney(netWorth.assetsPyg, 'PYG')}
            </p>
            <p className="text-sm font-bold text-emerald-600/60 dark:text-emerald-400/60 mt-0.5">
              {formatMoney(netWorth.assetsUsd, 'USD')}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-rose-500" />
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Liabilities</span>
            </div>
            <p className="text-xl font-extrabold text-rose-700 dark:text-rose-300">
              {formatMoney(netWorth.liabilitiesPyg, 'PYG')}
            </p>
            <p className="text-sm font-bold text-rose-600/60 dark:text-rose-400/60 mt-0.5">
              {formatMoney(netWorth.liabilitiesUsd, 'USD')}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Net Worth</span>
            </div>
            <p className={cn(
              'text-xl font-extrabold',
              netWorth.totalPyg >= 0
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-rose-700 dark:text-rose-300'
            )}>
              {formatMoney(netWorth.totalPyg, 'PYG')}
            </p>
            <p className={cn(
              'text-sm font-bold mt-0.5',
              netWorth.totalUsd >= 0
                ? 'text-blue-600/60 dark:text-blue-400/60'
                : 'text-rose-600/60 dark:text-rose-400/60'
            )}>
              {formatMoney(netWorth.totalUsd, 'USD')}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Net Worth History Chart */}
      {!loading && !loadError && (
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Net Worth History</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {chartData.length > 0
                ? `From ${chartData[0].date} to ${chartData[chartData.length - 1].date}`
                : 'No historical data yet'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Currency toggle */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {(['PYG', 'USD'] as Currency[]).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setChartCurrency(curr)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer',
                    chartCurrency === curr
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
            {/* Range selector */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {(['1M', '3M', '6M', '1Y', 'ALL'] as ChartRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setChartRange(range)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer',
                    chartRange === range
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
            <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No snapshots yet</p>
            <p className="text-xs mt-1">Daily snapshots will appear here</p>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => {
                    if (value >= 1000000) {
                      return `${(value / 1000000).toFixed(1)}M`;
                    }
                    if (value >= 1000) {
                      return `${(value / 1000).toFixed(0)}K`;
                    }
                    return value.toString();
                  }}
                />
                <Tooltip
                  formatter={(value) => [formatMoney(Number(value), chartCurrency), chartCurrency]}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey={chartCurrency === 'PYG' ? 'pyg' : 'usd'}
                  stroke={chartCurrency === 'PYG' ? '#10b981' : '#3b82f6'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      )}

      {/* Accounts by Type */}
      {!loading && !loadError && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(typeConfig) as Array<Account['type']>).map((type) => {
          const cfg = typeConfig[type];
          const Icon = cfg.icon;
          const count = accounts.filter((a) => a.type === type).length;
          const total = totalByType(type);
          const typeRouteMap: Record<Account['type'], string> = {
            bank: '/accounts',
            broker: '/investments',
            mutual_fund: '/investments',
            credit_card: '/credit-cards',
          };
          return (
            <Link
              key={type}
              to={typeRouteMap[type]}
              className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-5 shadow-xs hover:shadow-md transition-all duration-200 group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('p-2 rounded-lg', cfg.colorClass)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{cfg.label}</h3>
                  <p className="text-xs text-zinc-400">{count} account{count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">
                {count > 0
                  ? hasMixedCurrenciesByType(type) ? (
                    <div className="flex flex-col items-start gap-0.5">
                      {Object.entries(currencyTotalsByType(type))
                        .filter(([, v]) => v !== 0)
                        .map(([cur, t]) => (
                          <span key={cur} className="leading-tight">{formatMoney(t, cur as Currency)}</span>
                        ))
                      }
                    </div>
                  ) : (
                    formatMoney(total, accounts.find((a) => a.type === type)?.currency ?? 'PYG')
                  )
                  : '—'
                }
              </div>
            </Link>
          );
        })}
      </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setShowQuickTx(true)}
          className={cn(
            'justify-center gap-2 font-semibold text-sm rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 px-4 py-3',
            'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer flex items-center'
          )}
        >
          <Zap className="h-4 w-4" />
          Quick Transaction
        </button>
        <Link
          to="/accounts"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'justify-center gap-2 font-semibold'
          )}
        >
          <CircleDollarSign className="h-4 w-4" />
          Manage Accounts
        </Link>
        <Link
          to="/transactions"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'justify-center gap-2 font-semibold'
          )}
        >
          <ArrowLeftRight className="h-4 w-4" />
          View Transactions
        </Link>
        <Link
          to="/health"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'justify-center gap-2 font-semibold'
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          DB Health Check
        </Link>
      </div>

      {/* Data Management */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
          Data Management
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'flex items-center gap-2 text-xs font-semibold cursor-pointer',
              exporting && 'opacity-50 cursor-not-allowed'
            )}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting...' : 'Export Backup'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'flex items-center gap-2 text-xs font-semibold cursor-pointer',
              importing && 'opacity-50 cursor-not-allowed'
            )}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? importStatus || 'Importing...' : 'Import Backup'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        {exportError && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">{exportError}</span>
            <button onClick={() => setExportError('')} className="ml-auto p-1 hover:bg-rose-500/10 rounded cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {importError && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">{importError}</span>
            <button onClick={() => setImportError('')} className="ml-auto p-1 hover:bg-rose-500/10 rounded cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Import Confirmation Modal */}
      {showConfirm && importManifest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Confirm Import</h3>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              This will <span className="font-bold text-rose-500">permanently replace</span> all
              existing data with the backup file contents.
            </p>
            <div className="bg-zinc-50 dark:bg-zinc-950 rounded-lg p-3 mb-6 space-y-1">
              {Object.entries(importManifest.tables).map(([table, count]) => (
                <div key={table} className="flex justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">{table}</span>
                  <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{count} rows</span>
                </div>
              ))}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-1 mt-1 flex justify-between text-xs">
                <span className="font-bold text-zinc-700 dark:text-zinc-300">Total</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-50">{importManifest.totalRows} rows</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowConfirm(false); setPendingZipBlob(null); setImportManifest(null); }}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs font-semibold cursor-pointer')}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className={cn(
                  buttonVariants({ variant: 'default', size: 'sm' }),
                  'bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5',
                  importing && 'opacity-50 cursor-not-allowed'
                )}
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {importing ? 'Importing...' : 'Import & Replace'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Transaction Modal */}
      <QuickTransaction
        open={showQuickTx}
        onClose={() => setShowQuickTx(false)}
        onCreated={() => {
          // Reload accounts and net worth
          (async () => {
            try {
              const data = await getAccounts();
              const balances = await getCashBalanceBatch(data.map((a) => a.id));
              const withBalances = data.map((acc) => ({ ...acc, balance: balances.get(acc.id) ?? 0 }));
              setAccounts(withBalances);
              const nw = await computeNetWorth();
              setNetWorth(nw);
            } catch (err) {
              console.error('Failed to refresh accounts:', err);
            }
          })();
        }}
      />

      {/* FAB - Quick Add */}
      <button
        onClick={() => setShowQuickTx(true)}
        className={cn(
          'fixed bottom-14 right-4 sm:bottom-6 sm:right-6 z-40',
          'h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg',
          'bg-amber-500 hover:bg-amber-600 text-white',
          'flex items-center justify-center',
          'transition-all duration-200 hover:scale-105 active:scale-95',
          'cursor-pointer'
        )}
        title="Quick Add Transaction"
      >
        <Zap className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>
    </div>
  );
}
