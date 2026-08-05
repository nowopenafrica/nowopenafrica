import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'nowopen-theme';

// Day/night default: light during daytime hours (06:00–17:59), dark at night —
// "follows the sun". A manual toggle stores an explicit choice that overrides
// this until the user clears it (there's no clear-UI, so a toggle is sticky,
// which matches the requested behaviour: during the day it's light unless you
// toggle dark, and dark at night unless you toggle light).
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;

function isDaytime(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= DAY_START_HOUR && h < DAY_END_HOUR;
}
function dayNightTheme(): Theme {
  return isDaytime() ? 'light' : 'dark';
}
function msUntilNextBoundary(d: Date = new Date()): number {
  const next = new Date(d);
  const h = d.getHours();
  if (h < DAY_START_HOUR) next.setHours(DAY_START_HOUR, 0, 0, 0);
  else if (h < DAY_END_HOUR) next.setHours(DAY_END_HOUR, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - d.getTime());
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getStoredTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function getInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return dayNightTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Apply the class to <html> whenever the theme changes.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // While the user hasn't picked an explicit theme, follow day/night: re-check
  // exactly at the next 6am/6pm boundary and whenever the tab is refocused
  // (it may have crossed a boundary while hidden).
  useEffect(() => {
    if (getStoredTheme() !== null) return;

    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      if (getStoredTheme() !== null) return;
      setTheme(dayNightTheme());
      clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextBoundary());
    };
    timer = setTimeout(sync, msUntilNextBoundary());

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // theme just won't persist across reloads
      }
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
