import { Link, useLocation } from 'react-router-dom';
import { Wallet, X, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { bottomTabs, sidebarItems, isActivePath } from './navConfig';
import { cn } from '@/lib/utils';

type ThemeOption = {
  value: 'light' | 'dark' | 'system';
  icon: typeof Sun;
  label: string;
};

const themeOptions: ThemeOption[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      />
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
          {bottomTabs.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                  active
                    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}

          <div className="my-2 border-t border-zinc-200/50 dark:border-zinc-800/50" />

          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                  active
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
