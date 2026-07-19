import { useEffect, useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Home from '@/pages/Home';
import Health from '@/pages/Health';
import Accounts from '@/pages/Accounts';
import AccountDetails from '@/pages/AccountDetails';
import Transactions from '@/pages/Transactions';
import CashFlow from '@/pages/CashFlow';
import SettingsPage from '@/pages/Settings';
import Reports from '@/pages/Reports';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import {
  Wallet,
  Home as HomeIcon,
  Landmark,
  TrendingUp,
  CreditCard,
  ArrowLeftRight,
  ArrowRightLeft,
  Database,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Settings,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { runAccrualEngine } from '@/services/financeService';
import { autoRefreshMarketData } from '@/services/marketService';
import { refreshNetWorthSnapshot } from '@/services/netWorthService';
import type { AccountType } from '@/db';

const bottomTabs = [
  { name: 'Dashboard', path: '/', icon: HomeIcon },
  { name: 'Bank Accounts', path: '/accounts', icon: Landmark },
  { name: 'Investments', path: '/investments', icon: TrendingUp },
  { name: 'Credit Cards', path: '/credit-cards', icon: CreditCard },
];

const sidebarItems = [
  { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { name: 'Cash Flow', path: '/cash-flow', icon: ArrowRightLeft },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'DB Health', path: '/health', icon: Database },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options: Array<{ value: typeof theme; icon: typeof Sun; label: string }> = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];
  const current = options.find((o) => o.value === theme) ?? options[2];
  const Icon = current.icon;

  const cycle = () => {
    const idx = options.findIndex((o) => o.value === theme);
    setTheme(options[(idx + 1) % options.length].value);
  };

  return (
    <button
      onClick={cycle}
      title={`Theme: ${current.label}`}
      className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const themeOptions: Array<{ value: typeof theme; icon: typeof Sun; label: string }> = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed top-0 left-0 z-[70] h-full w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-between">
          <Link to="/" onClick={onClose} className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50 text-lg tracking-tight">
            <Wallet className="h-5 w-5" />
            <span>Vantor</span>
          </Link>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                  isActive
                    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle at Bottom */}
        <div className="p-4 border-t border-zinc-200/50 dark:border-zinc-800/50">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 px-1">Theme</p>
          <div className="flex gap-2">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    theme === opt.value
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

function Header({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/40 dark:border-zinc-800/40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50 text-lg tracking-tight hover:opacity-90"
        >
          <Wallet className="h-5 w-5 text-zinc-900 dark:text-zinc-50" />
          <span>Vantor</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={onMenuOpen}
            className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer sm:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Desktop sidebar: visible on sm+ as a persistent left rail. */
function DesktopSidebar() {
  const location = useLocation();
  return (
    <aside className="hidden sm:flex flex-col w-48 shrink-0 border-r border-zinc-200/40 dark:border-zinc-800/40 bg-white/50 dark:bg-zinc-950/50 py-4 px-2 space-y-1">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
              isActive
                ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.name}
          </Link>
        );
      })}
    </aside>
  );
}

function BottomTabs() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-zinc-200/40 dark:border-zinc-800/40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md safe-area-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {bottomTabs.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all min-w-[60px]',
                isActive
                  ? 'text-zinc-900 dark:text-zinc-50'
                  : 'text-zinc-400 dark:text-zinc-500'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col text-zinc-900 dark:text-zinc-100">
      <Header onMenuOpen={openSidebar} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1">
        <DesktopSidebar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 pb-24 sm:pb-6">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}

function AccrualRunner() {
  useEffect(() => {
    runAccrualEngine().catch((err) => {
      console.error('Accrual engine error:', err);
    });
  }, []);
  return null;
}

function MarketDataRunner() {
  useEffect(() => {
    autoRefreshMarketData().catch((err) => {
      console.error('Market data refresh error:', err);
    });
  }, []);
  return null;
}

function NetWorthSnapshotRunner() {
  useEffect(() => {
    refreshNetWorthSnapshot().catch((err) => {
      console.error('Net worth snapshot error:', err);
    });
  }, []);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AccrualRunner />
        <MarketDataRunner />
        <NetWorthSnapshotRunner />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/accounts" element={<Accounts filterType="bank" />} />
            <Route path="/investments" element={<Accounts filterType={['broker', 'mutual_fund'] as AccountType[]} />} />
            <Route path="/credit-cards" element={<Accounts filterType="credit_card" />} />
            <Route path="/accounts/:id" element={<AccountDetails />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/health" element={<Health />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}
