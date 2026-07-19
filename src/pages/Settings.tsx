import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSettings, updateSettings } from '@/services/financeService';
import { refreshMarketData, getMarketDataStatus } from '@/services/marketService';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Key,
  RefreshCw,
  Check,
  AlertCircle,
  Database,
  Clock,
  TrendingUp,
  Loader2,
} from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [marketStatus, setMarketStatus] = useState<{
    lastRefresh: Date | null;
    fxRatesCount: number;
    securityPricesCount: number;
  } | null>(null);

  const [stockKey, setStockKey] = useState('');
  const [fxKey, setFxKey] = useState('');
  const [baseCurrency, setBaseCurrency] = useState<'PYG' | 'USD'>('PYG');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, status] = await Promise.all([getSettings(), getMarketDataStatus()]);
        if (cancelled) return;
        setStockKey(s.stock_api_key);
        setFxKey(s.fx_api_key);
        setBaseCurrency(s.base_currency);
        setMarketStatus(status);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await updateSettings({
        stock_api_key: stockKey,
        fx_api_key: fxKey,
        base_currency: baseCurrency,
      });
      setSaveMsg('Settings saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const result = await refreshMarketData(baseCurrency);
      if (result.error) {
        setRefreshMsg(`Refresh failed: ${result.error}`);
      } else {
        setMarketStatus({
          lastRefresh: result.lastRefresh,
          fxRatesCount: result.fxRatesCount,
          securityPricesCount: result.securityPricesCount,
        });
        setRefreshMsg('Market data refreshed');
        setTimeout(() => setRefreshMsg(''), 3000);
      }
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mx-auto mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 font-medium">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-2xl">
      {/* Navigation */}
      <div>
        <Link
          to="/"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold'
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Configure API keys, currency, and market data
        </p>
      </div>

      {/* API Keys */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Key className="h-4 w-4" />
          API Keys
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Finnhub API Key <span className="text-zinc-400 normal-case">(Stock prices)</span>
            </label>
            <input
              type="password"
              placeholder="Enter your Finnhub API key"
              value={stockKey}
              onChange={(e) => setStockKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Get a free key at{' '}
              <a
                href="https://finnhub.io/register"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-zinc-600"
              >
                finnhub.io
              </a>
              {' '}— enables live stock prices and P/L tracking
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              FX API Key <span className="text-zinc-400 normal-case">(Currency rates)</span>
            </label>
            <input
              type="password"
              placeholder="Optional — free rates used if blank"
              value={fxKey}
              onChange={(e) => setFxKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Free exchange rates from open.er-api.com are used when this is blank
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Base Currency
            </label>
            <div className="flex gap-2">
              {(['PYG', 'USD'] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setBaseCurrency(curr)}
                  className={cn(
                    'px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer',
                    baseCurrency === curr
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                buttonVariants({ variant: 'default', size: 'sm' }),
                'text-xs font-semibold cursor-pointer flex items-center gap-1.5',
                saving && 'opacity-50 cursor-not-allowed'
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {saveMsg && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{saveMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Market Data Status */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Market Data
        </h3>

        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-zinc-400" />
            <span className="text-zinc-500 dark:text-zinc-400">Last refresh:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {marketStatus?.lastRefresh
                ? new Date(marketStatus.lastRefresh).toLocaleString()
                : 'Never'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Database className="h-4 w-4 text-zinc-400" />
            <span className="text-zinc-500 dark:text-zinc-400">FX rates stored:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {marketStatus?.fxRatesCount ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <span className="text-zinc-500 dark:text-zinc-400">Security prices stored:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {marketStatus?.securityPricesCount ?? 0}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'text-xs font-semibold cursor-pointer flex items-center gap-1.5',
              refreshing && 'opacity-50 cursor-not-allowed'
            )}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
          {refreshMsg && (
            <span className={cn(
              'text-xs font-medium',
              refreshMsg.includes('failed')
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}>
              {refreshMsg}
            </span>
          )}
        </div>

        {!stockKey && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No Finnhub API key configured — stock prices will not be fetched.
              Add your key above to enable live market data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
