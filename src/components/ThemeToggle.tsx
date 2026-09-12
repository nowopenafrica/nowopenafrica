import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      /* Explicit px, not w-11/h-11. This app sets a root font size below 16px,
         so Tailwind's rem-based sizes under-deliver by about 10%: w-11 h-11
         measured 39x39 on production, not the 44 it looks like in the class
         name. Any touch-target minimum here has to be written in px. */
      className={`relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition ${className}`}
    >
      <Sun
        size={18}
        className={`absolute transition-all duration-300 ${isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}
      />
      <Moon
        size={18}
        className={`absolute transition-all duration-300 ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`}
      />
    </button>
  );
}
