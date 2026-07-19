import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRepos } from '@/db';

type Theme = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'system', setTheme: () => {}, resolved: 'light' });

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemPreference() : theme;
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('vantor-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* SSR or private mode */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const resolved = useMemo(() => resolveTheme(theme), [theme]);

  // Apply theme to DOM and persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    try {
      localStorage.setItem('vantor-theme', theme);
    } catch { /* private mode */ }
  }, [theme, resolved]);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        const r = getSystemPreference();
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(r);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // On mount, sync theme from DB settings (overrides localStorage if DB has a value)
  useEffect(() => {
    getRepos().then((repos) => {
      repos.settings.get().then((settings) => {
        if (settings.theme && settings.theme !== theme) {
          setThemeState(settings.theme);
        }
      }).catch(() => { /* settings row may not exist yet */ });
    }).catch(() => { /* DB not available */ });
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useMemo(() => {
    return (t: Theme) => {
      setThemeState(t);
      // Persist to DB asynchronously
      getRepos().then((repos) => {
        repos.settings.update({ theme: t }).catch(() => { /* best effort */ });
      }).catch(() => { /* DB not available */ });
    };
  }, []);

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, setTheme, resolved]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
