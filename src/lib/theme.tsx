import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type AkademiTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AkademiTheme;
  setTheme: (theme: AkademiTheme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'akademi-theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AkademiTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const setTheme = (next: AkademiTheme) => setThemeState(next);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-sm font-semibold text-[var(--ak-ink)] transition-colors hover:bg-[var(--ak-elevated-hover)] whitespace-nowrap shrink-0 ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
      ) : (
        <Moon className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
      )}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
};
