import { useEffect, useState, useRef, useMemo } from 'react';
import { Sankey, Tooltip } from 'recharts';
import type { SankeyNodeProps, SankeyLinkProps } from 'recharts';
import {
  getCashFlowSankeyData,
  getSettings,
} from '@/services/financeService';
import type {
  CashFlowPeriod,
  SankeyDiagramData,
} from '@/services/financeService';
import { cn, formatMoney } from '@/lib/utils';
import { AlertCircle, AlertTriangle, ArrowLeftRight } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type PeriodMode = 'thisMonth' | 'specificMonth' | 'thisYear';

function CustomNode(props: SankeyNodeProps & { payload: { name: string; color?: string } }) {
  const { x, y, width, height, index, payload } = props as SankeyNodeProps & { x: number; y: number; width: number; height: number; index: number; payload: { name: string; color?: string } };
  const name = payload?.name ?? `Node ${index}`;
  const fill = payload?.color ?? '#6b7280';

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} ry={2} />
      <text
        x={x + width + 8}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="central"
        className="fill-zinc-700 dark:fill-zinc-300 text-xs font-semibold"
      >
        {name}
      </text>
    </g>
  );
}

function CustomTooltip({ payload }: { payload?: SankeyNodeProps[] | SankeyLinkProps[] }) {
  if (!payload || payload.length === 0) return null;
  const item = payload[0] as unknown as Record<string, unknown>;
  const p = item.payload as Record<string, unknown> | undefined;

  // Link tooltip
  if (p && 'source' in p && 'target' in p) {
    const sourceNode = p.source as { name?: string } | undefined;
    const targetNode = p.target as { name?: string } | undefined;
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-bold">{sourceNode?.name ?? '?'} → {targetNode?.name ?? '?'}</p>
        <p className="text-zinc-500">{formatAmount(p.value as number)}</p>
      </div>
    );
  }

  // Node tooltip
  const name = (p?.name as string) ?? '';
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-bold">{name}</p>
    </div>
  );
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function CashFlow() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('thisMonth');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [baseCurrency, setBaseCurrency] = useState<string>('PYG');
  const [data, setData] = useState<SankeyDiagramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currentYear = new Date().getFullYear();

  const period: CashFlowPeriod = useMemo(
    () => {
      if (periodMode === 'thisYear') return { mode: 'year', year: selectedYear };
      if (periodMode === 'thisMonth') return { mode: 'month', month: new Date().getMonth(), year: selectedYear };
      return { mode: 'month', month: selectedMonth, year: selectedYear };
    },
    [periodMode, selectedMonth, selectedYear],
  );

  const mountedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [settings, sankeyData] = await Promise.all([
          getSettings(),
          getCashFlowSankeyData(period),
        ]);
        if (cancelled) return;
        setBaseCurrency(settings.base_currency);
        setData(sankeyData);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Failed to load cash flow data');
      } finally {
        if (!cancelled) {
          setLoading(false);
          mountedRef.current = true;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const hasData = data && data.nodes.length > 1;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cash Flow</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Income and expense flows by tag — Sankey diagram in {baseCurrency}
        </p>
      </div>

      {/* Period Selector */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Period
          </h3>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Mode tabs */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {([
              { key: 'thisMonth' as const, label: 'This Month' },
              { key: 'specificMonth' as const, label: 'Specific Month' },
              { key: 'thisYear' as const, label: 'This Year' },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPeriodMode(opt.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer min-h-[44px]',
                  periodMode === opt.key
                    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Month picker (when specificMonth) */}
          {periodMode === 'specificMonth' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          )}

          {/* Year picker */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900"
          >
            {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50" />
          <p className="text-zinc-500 dark:text-zinc-400 mt-4 font-medium">Loading cash flow…</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Summary */}
      {!loading && data && (
        <>
          {data.usedFallbackFx && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">
                Some conversions used a default 1:1 rate because no exchange rate was stored. Add rates in Settings for accurate results.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-5 shadow-xs">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Income</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatMoney(data.totalIncome, baseCurrency as 'PYG' | 'USD')}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-5 shadow-xs">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Expenses</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {formatMoney(data.totalExpense, baseCurrency as 'PYG' | 'USD')}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-5 shadow-xs">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Net</p>
            <p
              className={cn(
                'text-2xl font-bold mt-1',
                data.totalIncome - data.totalExpense >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {formatMoney(data.totalIncome - data.totalExpense, baseCurrency as 'PYG' | 'USD')}
            </p>
          </div>
        </div>
        </>
      )}

      {/* Sankey Diagram */}
      {!loading && hasData && (
        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-xs">
          <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-200/40 dark:border-zinc-800/40">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200">Flow Diagram</h4>
          </div>
          <div className="p-4 overflow-x-auto">
            <Sankey
              width={800}
              height={400}
              data={{ nodes: data.nodes, links: data.links }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              node={CustomNode as any}
              link={{ stroke: '#71717a', strokeOpacity: 0.3 }}
              nodePadding={20}
              nodeWidth={10}
              margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
            >
              <Tooltip content={<CustomTooltip />} />
            </Sankey>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 p-12 text-center shadow-xs">
          <ArrowLeftRight className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500 dark:text-zinc-400 font-semibold">
            No income or expense transactions found for this period.
          </p>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">
            Add income/expense entries to see the cash flow diagram.
          </p>
        </div>
      )}
    </div>
  );
}
