import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SmartAlerts from './SmartAlerts';
import { ThemeProvider } from './theme';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); delete document.documentElement.dataset.theme; });

function renderAlerts() { return render(<ThemeProvider><MemoryRouter><SmartAlerts/></MemoryRouter></ThemeProvider>); }
function mockAlertFetch(outside = false) {
  const start = Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000;
  const slots = Array.from({ length: 8 }, (_, index) => ({ valid_at: new Date(start + index * 3_600_000).toISOString(), precipitation_mm: 2, precipitation_probability_percent: 65 }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/geocode')) return new Response(JSON.stringify({ results: [{ name: 'Central Bengaluru, Karnataka, India', latitude: outside ? 28.6 : 12.9716, longitude: outside ? 77.2 : 77.5946 }] }), { status: 200 });
    if (url.includes('/api/locations/validate')) {
      const point = JSON.parse(String(init?.body));
      return outside ? new Response(JSON.stringify({ detail: 'Please select a location within Bengaluru.' }), { status: 422 }) : new Response(JSON.stringify({ valid: true, ...point }), { status: 200 });
    }
    if (url.includes('/api/locations/forecast')) return new Response(JSON.stringify({ forecast: { provider: 'Open-Meteo', attribution: 'Weather data by Open-Meteo.com', timezone: 'Asia/Kolkata', generated_at: new Date().toISOString(), units: { precipitation: 'mm', precipitation_probability: '%' }, slots } }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function saveOneLocation() {
  fireEvent.change(screen.getByRole('combobox', { name: /Find a Bengaluru place/ }), { target: { value: 'Central Bengaluru' } });
  fireEvent.click(await screen.findByRole('option', { name: /Central Bengaluru, Karnataka, India/ }, { timeout: 2000 }));
  fireEvent.change(screen.getByLabelText('Name this saved location'), { target: { value: 'Home area' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
  await screen.findByText('Home area');
}

describe('Smart Flood Alerts', () => {
  it('requires an explicit save action, validates coordinates and persists location preferences locally', async () => {
    const calls = mockAlertFetch();
    const view = renderAlerts();
    await saveOneLocation();
    expect(calls.mock.calls.some(([url, init]) => String(url).includes('/api/locations/validate') && init?.method === 'POST')).toBe(true);
    expect(JSON.parse(localStorage.getItem('floodsense-alert-locations-v1') || '[]')[0]).toMatchObject({ name: 'Home area', address: 'Central Bengaluru, Karnataka, India', latitude: 12.9716, longitude: 77.5946, monitored: true });
    expect(calls.mock.calls.some(([url]) => String(url).includes('/api/locations/forecast'))).toBe(false);
    view.unmount(); renderAlerts();
    expect(screen.getByText('Home area')).toBeVisible();
  });

  it('supports keyboard autocomplete, saves selected coordinates and uses them for monitoring', async () => {
    const calls = mockAlertFetch(); renderAlerts();
    const search = screen.getByRole('combobox', { name: /Find a Bengaluru place/ });
    fireEvent.change(search, { target: { value: 'Central Bengaluru' } });
    await screen.findByRole('option', { name: /Central Bengaluru, Karnataka, India/ });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveAttribute('aria-activedescendant', 'alerts-place-option-0');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('Central Bengaluru, Karnataka, India', { selector: 'strong' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Name this saved location'), { target: { value: 'Home area' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    await screen.findByText('Home area');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh alerts' }));
    await screen.findByText(/FORECAST-BASED ALERT · NOT A FLOOD REPORT/);
    const forecastCall = calls.mock.calls.find(([url]) => String(url).includes('/api/locations/forecast'));
    expect(String(forecastCall?.[0])).toContain('latitude=12.9716');
    expect(String(forecastCall?.[0])).toContain('longitude=77.5946');
  });

  it('shows a useful message when place search fails', async () => {
    const fetchMock = mockAlertFetch();
    fetchMock.mockImplementation(async (input, init) => String(input).includes('/api/geocode')
      ? new Response(JSON.stringify({ detail: 'Geocoding service is unavailable.' }), { status: 502 })
      : new Response('{}', { status: 404 }));
    renderAlerts();
    fireEvent.change(screen.getByRole('combobox', { name: /Find a Bengaluru place/ }), { target: { value: 'Some place' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Geocoding service is unavailable.');
    expect(screen.queryByRole('button', { name: 'Save location' })).not.toBeInTheDocument();
  });

  it('persists configured threshold values across page remounts', async () => {
    const view = renderAlerts();
    const rainfall = screen.getByLabelText('Rainfall threshold (mm over 6 hours)');
    fireEvent.change(rainfall, { target: { value: '18.5' } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('floodsense-alert-settings-v1') || '{}').rainfallMm).toBe(18.5));
    view.unmount(); renderAlerts();
    expect(screen.getByLabelText('Rainfall threshold (mm over 6 hours)')).toHaveValue(18.5);
  });

  it('follows the shared light and dark theme preference', () => {
    renderAlerts();
    fireEvent.click(screen.getByRole('button', { name: 'Light Mode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Dark Mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('requests browser notification permission only after the user enables it and handles denial', async () => {
    class MockNotification {
      static permission = 'default';
      static requestPermission = vi.fn().mockResolvedValue('denied');
      constructor(_title: string, _options?: NotificationOptions) {}
    }
    vi.stubGlobal('Notification', MockNotification);
    renderAlerts();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Enable notifications/ }));
    expect(await screen.findByText(/Notifications are blocked or were denied/)).toBeVisible();
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('rejects a geocoder result outside Bengaluru at the backend validation step', async () => {
    const calls = mockAlertFetch(true); renderAlerts();
    fireEvent.change(screen.getByRole('combobox', { name: /Find a Bengaluru place/ }), { target: { value: 'Central Bengaluru' } });
    fireEvent.click(await screen.findByRole('option', { name: /Central Bengaluru, Karnataka, India/ }, { timeout: 2000 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }));
    expect(await screen.findByText(/select a location within Bengaluru/i)).toBeVisible();
    expect(screen.getByText(/No locations saved/)).toBeVisible();
    expect(calls.mock.calls.some(([url]) => String(url).includes('/api/locations/forecast'))).toBe(false);
  });

  it('generates deduplicated forecast-based alerts on manual refresh and supports dismissal/history', async () => {
    mockAlertFetch(); renderAlerts(); await saveOneLocation();
    expect(screen.getByText(/Manual refresh only/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh alerts' }));
    expect(await screen.findByText(/FORECAST-BASED ALERT · NOT A FLOOD REPORT/)).toBeVisible();
    expect(screen.getByText(/12 mm/)).toBeVisible();
    expect(screen.getByText('65%')).toBeVisible();
    expect(screen.getAllByText(/Open-Meteo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Last checked/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh alerts' }));
    await waitFor(() => expect(screen.getAllByText(/FORECAST-BASED ALERT · NOT A FLOOD REPORT/)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/FORECAST-BASED ALERT · NOT A FLOOD REPORT/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Alert history/));
    expect(screen.getByText(/dismissed/)).toBeVisible();
  });

  it('does not claim an all clear when the forecast endpoint is unavailable', async () => {
    mockAlertFetch(); renderAlerts(); await saveOneLocation();
    vi.stubGlobal('fetch', vi.fn(async input => String(input).includes('/api/locations/forecast') ? new Response(JSON.stringify({ detail: 'offline' }), { status: 502 }) : new Response('{}', { status: 200 })));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh alerts' }));
    expect(await screen.findByText(/missing data is not an all-clear/i)).toBeVisible();
    expect(screen.getByText(/Forecast unavailable: offline/)).toBeVisible();
  });
});
