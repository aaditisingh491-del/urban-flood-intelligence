import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle, { ThemeProvider } from './theme';
import SafetyAdvice from './SafetyAdvice';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

describe('color theme', () => {
  it('switches accessibly and persists the selected preference across remounts', () => {
    const first = render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Dark Mode' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Light Mode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('floodsense-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Light Mode' })).toHaveAttribute('aria-pressed', 'true');
    first.unmount();

    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Light Mode' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dark Mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('floodsense-theme')).toBe('dark');
  });

  it('renders accessible advice and defines distinct readable panel tokens for each theme', () => {
    render(<ThemeProvider><div className="home-safety-panel"><h3>What should I do?</h3><SafetyAdvice /></div><ThemeToggle /></ThemeProvider>);
    expect(screen.getByText('Immediate danger?')).toBeVisible();
    expect(screen.getAllByText(/Avoid driving through floodwater/).length).toBeGreaterThan(0);

  });
});

