import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import './themes.css';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('floodsense-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('floodsense-theme', theme); } catch { /* storage may be disabled */ }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <div className="theme-toggle" role="group" aria-label="Color theme">
    <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light Mode</button>
    <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark Mode</button>
  </div>;
}
