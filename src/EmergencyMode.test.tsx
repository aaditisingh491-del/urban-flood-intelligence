import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EmergencyModeControl from './EmergencyMode';

afterEach(() => { cleanup(); localStorage.clear(); document.body.style.overflow = ''; });

describe('Emergency Mode', () => {
  it('enters and exits accessibly and returns focus to its entry control', () => {
    render(<EmergencyModeControl/>);
    const entry = screen.getByRole('button', { name: 'Emergency Mode' });
    fireEvent.click(entry);
    expect(screen.getByRole('dialog', { name: 'Emergency Mode' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Emergency Mode' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Exit Emergency Mode/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(entry).toHaveFocus();
  });

  it('keeps essential static instructions available without network requests', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<EmergencyModeControl context={{ dataUnavailable: true }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Emergency Mode' }));
    expect(screen.getByText(/move to higher ground/)).toBeVisible();
    expect(screen.getByText(/Never walk, swim, or drive through floodwater/)).toBeVisible();
    expect(screen.getByText(/Do not enter floodwater to rescue another person/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/as an all-clear/i);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('offers verified official emergency resources without inventing local numbers', () => {
    render(<EmergencyModeControl/>);
    fireEvent.click(screen.getByRole('button', { name: 'Emergency Mode' }));
    expect(screen.getByRole('link', { name: /Call emergency services/ })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByRole('link', { name: /NDMA SACHET alerts/ })).toHaveAttribute('href', 'https://sachet.ndma.gov.in/');
    expect(screen.getByRole('link', { name: /Karnataka State Disaster Management Authority/ })).toBeVisible();
  });

  it('supports a keyboard checklist and remembers it locally', () => {
    render(<EmergencyModeControl/>);
    fireEvent.click(screen.getByRole('button', { name: 'Emergency Mode' }));
    const item = screen.getByRole('checkbox', { name: /official local alerts/ });
    fireEvent.click(item);
    expect(item).toBeChecked();
    expect(localStorage.getItem('floodsense-emergency-checklist-v1')).toContain('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Emergency Mode' }));
    expect(screen.getByRole('checkbox', { name: /official local alerts/ })).toBeChecked();
  });

  it('shows explicitly selected locations and real timestamps only when supplied', () => {
    render(<EmergencyModeControl context={{ sourceName: 'Selected origin', destinationName: 'Inventory point', verifiedIncidentCount: 0, forecastGeneratedAt: '2026-10-11T12:00:00Z', forecastProvider: 'Open-Meteo' }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Emergency Mode' }));
    expect(screen.getByText(/Selected origin/)).toBeVisible();
    expect(screen.getByText(/not a confirmed active flood/)).toBeVisible();
    expect(screen.getByText(/Open-Meteo response fetched/)).toBeVisible();
    expect(screen.getByText(/not an all-clear/)).toBeVisible();
  });
});
