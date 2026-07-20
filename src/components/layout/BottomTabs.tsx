import { Link, useLocation } from 'react-router-dom';
import { bottomTabs, isActivePath } from './navConfig';
import { cn } from '@/lib/utils';

export default function BottomTabs() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-zinc-200/40 dark:border-zinc-800/40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md safe-area-bottom sm:hidden">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {bottomTabs.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all min-w-[60px]',
                active
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
