import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type ThemeOption = {
  value: 'light' | 'dark' | 'system';
  icon: typeof Sun;
  label: string;
};

const options: ThemeOption[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
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

export { options as themeOptions };
