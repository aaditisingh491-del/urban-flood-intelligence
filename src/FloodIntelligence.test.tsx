import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import FloodIntelligence from './FloodIntelligence';
import SafetyAdvice from './SafetyAdvice';

const mapMock = vi.hoisted(() => ({ handlers: null as null | { click: (event: { latlng: { lat: number; lng: number } }) => void } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <span />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <span data-testid="flood-marker">{children}</span>,
  Popup: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  GeoJSON: () => <span data-testid="route-geometry" />,
  useMapEvents: (handlers: typeof mapMock.handlers) => { mapMock.handlers = handlers; return null; },
}));

const row = { location_id: 'loc-1', location_name: 'Low-lying ward', city: 'Bengaluru', state: 'Karnataka',
  latitude: 12.9, longitude: 77.6, event_type: 'exposure_location', status: 'unverified', confidence: 'low',
  source_name: 'KSRSAC via OpenCity', source_url: 'https://example.test/source' };
const row2 = { ...row, location_id: 'loc-2', location_name: 'Second vulnerable area', latitude: 12.98, longitude: 77.64 };
const assessmentFor = (location: typeof row) => ({ location: { ...location, inventory_status: 'unverified', inventory_confidence: 'low', inventory_source: 'KSRSAC', inventory_source_url: location.source_url }, model_score: 42, model_category: 'MODERATE', model_status: 'PROVISIONAL_UNCALIBRATED', model_warning: 'Drainage is an assumed input.', current_verified_incidents_within_1km: 0, assessed_at: '2026-10-11T10:00:00Z', data_source: 'Open-Meteo + KSRSAC', forecast_error: null, forecast: { provider: 'Open-Meteo', attribution: 'Weather data by Open-Meteo.com', timezone: 'Asia/Kolkata', generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), units: { precipitation: 'mm', precipitation_probability: '%', temperature: '°C' }, slots: [{ valid_at: '2030-01-01T17:00:00+05:30', precipitation_mm: 2.5, precipitation_probability_percent: 40, temperature_c: 24.2, weather_code: 61 }, { valid_at: '2030-01-01T18:00:00+05:30', precipitation_mm: 0, precipitation_probability_percent: 20, temperature_c: 23, weather_code: 2 }] } });

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/floods/summary')) return new Response(JSON.stringify({ total_records: 1, active_verified_floods: 0, official_alerts: 0, historical_records: 0, rainfall_based_risks: 0, exposure_inventory: 1, storage_mode: 'local_kml' }), { status: 200 });
    if (url.includes('/api/floods?')) return new Response(JSON.stringify({ records: url.includes('event_type=observed_flood') ? [] : [row, row2], total: 2 }), { status: 200 });
    if (url.includes('/assessment')) { const current = url.includes('loc-2') ? row2 : row; return new Response(JSON.stringify(assessmentFor(current)), { status: 200 }); }
    if (url.includes('/api/locations/validate') && init?.method === 'POST') {
      const point = JSON.parse(String(init.body));
      if (point.latitude > 13.3 || point.latitude < 12.6) return new Response(JSON.stringify({ detail: 'Please select a location within Bengaluru.' }), { status: 422 });
      return new Response(JSON.stringify({ valid: true, ...point }), { status: 200 });
    }
    if (url.includes('/api/geocode')) {
      const name = new URL(url, 'http://localhost').searchParams.get('q') || 'Place';
      return new Response(JSON.stringify(name === 'Delhi' ? { results: [], message: 'Please select a location within Bengaluru.' } : { results: [{ name, latitude: 12.95, longitude: 77.61 }] }), { status: 200 });
    }
    if (url.includes('/api/routes/alternate') && init?.method === 'POST') return new Response(JSON.stringify({ original_route: { geometry: { type: 'LineString', coordinates: [[77.6, 12.9], [77.7, 13]] }, distance_m: 5300, duration_s: 660 }, recommended_route: null, safe_route_verified: false, message: 'Route cannot be verified as safe.', warnings: ['Coverage is incomplete.'], hazards_avoided: 0, alternatives_considered: 1 }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('FloodIntelligence', () => {
  beforeEach(() => { mapMock.handlers = null; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('loads source-backed records and renders inventory markers', async () => {
    mockFetch(); render(<FloodIntelligence />);
    expect((await screen.findAllByText('Low-lying ward')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Flood-prone location inventory' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('flood-marker')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'KSRSAC via OpenCity' }).every(link => link.getAttribute('href') === 'https://example.test/source')).toBe(true);
  });

  it('keeps inventory browsing off the homepage while retaining map markers and inventory destinations', async () => {
    mockFetch(); render(<FloodIntelligence />);
    await screen.findByRole('option', { name: /Low-lying ward/ });
    expect(screen.queryByRole('heading', { name: 'Flood-prone location inventory' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search flood locations')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('flood-marker')).toHaveLength(2);
  });

  it('uses backend geocoding suggestions for manual place search', async () => {
    mockFetch(); render(<FloodIntelligence />);
    await screen.findAllByText('Low-lying ward');
    fireEvent.change(screen.getByLabelText('Source (Bengaluru only)'), { target: { value: 'Koramangala' } });
    const suggestion = await screen.findByRole('button', { name: 'Koramangala' }, { timeout: 1500 });
    fireEvent.click(suggestion);
    expect(screen.getByLabelText('Source (Bengaluru only)')).toHaveValue('Koramangala');
  });

  it('restricts destinations to inventory and shows route danger results', async () => {
    const fetchMock = mockFetch(); render(<FloodIntelligence />);
    await screen.findAllByText('Low-lying ward');
    expect(screen.getByText(/map clicks never set a destination/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Destination (flood-prone inventory only)'), { target: { value: 'loc-1' } });
    fireEvent.change(screen.getByLabelText('Source (Bengaluru only)'), { target: { value: 'Koramangala' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Koramangala' }, { timeout: 1500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Find route' }));
    expect(await screen.findByText('Route cannot be verified as safe.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why this road is dangerous' })).toBeInTheDocument();
    expect(screen.getByText(/fastest candidate shown as a dashed reference/)).toBeInTheDocument();
    expect(screen.getByTestId('route-geometry')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/api/routes/alternate') && init?.method === 'POST');
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ destination_location_id: 'loc-1' });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('loc-1/assessment'))).toBe(true);
    });
  });

  it('refreshes the destination assessment and evening outlook when inventory destination changes', async () => {
    const fetchMock = mockFetch(); render(<FloodIntelligence />);
    const select = await screen.findByLabelText('Destination (flood-prone inventory only)');
    fireEvent.change(select, { target: { value: 'loc-1' } });
    expect(await screen.findByRole('heading', { name: 'Low-lying ward' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/2.5 mm precipitation/)).toBeInTheDocument();
    expect(screen.getByText(/40% precipitation chance/)).toBeInTheDocument();
    expect(screen.getByText('Weather data by Open-Meteo.com')).toBeInTheDocument();
    expect(screen.getByText(/forecast response is more than one hour old/i)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'loc-2' } });
    expect(await screen.findByRole('heading', { name: 'Second vulnerable area' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/assessment')).some(([url]) => String(url).includes('loc-2'))).toBe(true));
    expect(screen.queryByRole('heading', { name: 'Low-lying ward' })).not.toBeInTheDocument();
  });

  it('clears the previous destination score when the next assessment fails', async () => {
    const fetchMock = mockFetch(); render(<FloodIntelligence />);
    const select = await screen.findByLabelText('Destination (flood-prone inventory only)');
    fireEvent.change(select, { target: { value: 'loc-1' } });
    expect(await screen.findByText('42')).toBeInTheDocument();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => String(input).includes('loc-2/assessment') ? new Response(JSON.stringify({ detail: 'Weather service unavailable.' }), { status: 503 }) : original(input, init));
    fireEvent.change(select, { target: { value: 'loc-2' } });
    expect(await screen.findByText('Assessment unavailable: Weather service unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Low-lying ward' })).not.toBeInTheDocument();
  });

  it('sets a validated map click as source and rejects a point outside Bengaluru', async () => {
    mockFetch(); render(<FloodIntelligence />);
    await screen.findAllByText('Low-lying ward');
    await act(async () => { mapMock.handlers?.click({ latlng: { lat: 12.9716, lng: 77.5946 } }); });
    expect(await screen.findByText('Map selection (12.97160, 77.59460)')).toBeInTheDocument();
    await act(async () => { mapMock.handlers?.click({ latlng: { lat: 28.6139, lng: 77.209 } }); });
    expect(await screen.findByText('Please select a location within Bengaluru.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find route' })).toBeDisabled();
  });

  it('shows the service-area message when geocoding finds no Bengaluru match', async () => {
    mockFetch(); render(<FloodIntelligence />);
    await screen.findAllByText('Low-lying ward');
    fireEvent.change(screen.getByLabelText('Source (Bengaluru only)'), { target: { value: 'Delhi' } });
    expect(await screen.findByText('Please select a location within Bengaluru.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find route' })).toBeDisabled();
  });

  it('does not enable an arbitrary destination when inventory is empty', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(async input => String(input).includes('/api/floods?') ? new Response(JSON.stringify({ records: [], total: 0 }), { status: 200 }) : new Response(JSON.stringify({ total_records: 0, storage_mode: 'local_kml' }), { status: 200 }));
    render(<FloodIntelligence />);
    await waitFor(() => expect(screen.getByLabelText('Destination (flood-prone inventory only)')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Find route' })).toBeDisabled();
  });

  it('renders practical recommendations as independently expandable accessible disclosures', () => {
    render(<SafetyAdvice />);
    const advice = screen.getByText('Avoid driving through floodwater').closest('details')!;
    expect(advice).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Avoid driving through floodwater'));
    expect(advice).toHaveAttribute('open');
    expect(screen.getByText(/Floodwater may hide road damage/)).toBeInTheDocument();
    expect(screen.getByText(/Immediate danger/)).toBeInTheDocument();
    expect(screen.getByText('Choose a route using official updates').closest('summary')).toBeInTheDocument();
  });
});
