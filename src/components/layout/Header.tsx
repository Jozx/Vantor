import { Link } from 'react-router-dom';
import { Wallet, Menu } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Header({ onMenuOpen }: { onMenuOpen: () => void }) {
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
