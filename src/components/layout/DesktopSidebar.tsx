import { Link, useLocation } from 'react-router-dom';
import { bottomTabs, sidebarItems, isActivePath } from './navConfig';
import { cn } from '@/lib/utils';

export default function DesktopSidebar() {
  const location = useLocation();
  return (
    <aside className="hidden sm:flex flex-col w-48 shrink-0 border-r border-zinc-200/40 dark:border-zinc-800/40 bg-white/50 dark:bg-zinc-950/50 py-4 px-2 space-y-1">
      {bottomTabs.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(location.pathname, item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
              active
                ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.name}
          </Link>
        );
      })}

      <div className="my-2 border-t border-zinc-200/40 dark:border-zinc-800/40" />

      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(location.pathname, item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
              active
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
