import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import FloodIntelligence from './FloodIntelligence';
import SafetyAdvice from './SafetyAdvice';

const mapMock = vi.hoisted(() => ({ handlers: null as null | { click: (event: { latlng: { lat: number; lng: number } }) => void } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <span />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <span data-testid="flood-marker">{children}</span>,
  Popup: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  GeoJSON: ({ style }: { style?: { color?: string } }) => <span data-testid="route-geometry" data-route-color={style?.color} />,
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
    if (url.includes('/api/routes/alternate') && init?.method === 'POST') {
      const geometry = { type: 'LineString', coordinates: [[77.6, 12.9], [77.7, 13]] } as const;
      const option = { route_id: 'route-1', label: 'Route A', geometry, distance_m: 5300, duration_s: 660, recommended: false, recommendation_reason: 'Only route returned by the routing provider; alternatives could not be compared.', verified_current_hazard_count: 0, verified_current_hazards: [], nearby_vulnerability_count: 1, nearby_vulnerability_locations: [{ location_name: row.location_name }], route_evidence: 'Point screening.' };
      return new Response(JSON.stringify({ original_route: { geometry, distance_m: 5300, duration_s: 660 }, recommended_route: null, route_options: [option], selected_route_id: 'route-1', fresh_verified_reports_available: false, safe_route_verified: false, message: 'Route cannot be verified as safe.', warnings: ['Coverage is incomplete.'], hazards_avoided: 0, alternatives_considered: 1, data_source: 'OSRM / OpenStreetMap', data_fetched_at: new Date().toISOString() }), { status: 200 });
    }
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
    expect(await screen.findByText(/No fresh verified flood reports are mapped near this candidate/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why this road is dangerous' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Flood-aware route comparison' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Flood-aware route comparison' })).toHaveLength(1);
    expect(screen.getByText('Only one route available — alternatives could not be compared.')).toBeInTheDocument();
    expect(screen.getByText(/No fresh verified flood reports available for comparison/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Flood-aware route comparison' }).textContent).toContain('Static vulnerability context: 1 point');
    expect(screen.getByRole('heading', { name: 'Via Route A' })).toBeInTheDocument();
    expect(screen.getByTestId('route-geometry')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select current route to display')).not.toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/api/routes/alternate') && init?.method === 'POST');
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ destination_location_id: 'loc-1' });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('loc-1/assessment'))).toBe(true);
    });
  });

  it('renders one combined comparison, selects the current route, and highlights it on the map', async () => {
    const fetchMock = mockFetch();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/api/routes/alternate')) {
        const first = { type: 'LineString', coordinates: [[77.6, 12.9], [77.61, 12.91]] } as const;
        const second = { type: 'LineString', coordinates: [[77.6, 12.9], [77.60, 12.92], [77.61, 12.91]] } as const;
        const base = { recommended: false, verified_current_hazards: [], nearby_vulnerability_count: 0, nearby_vulnerability_locations: [], route_evidence: 'Point screen only.' };
        const option1 = { ...base, route_id: 'route-1', label: 'Via Test Road', geometry: first, distance_m: 2000, duration_s: 300, recommendation_reason: 'Lowest estimated travel time among available candidates.', verified_current_hazard_count: 0 };
        const option2 = { ...base, route_id: 'route-2', label: 'Route B', geometry: second, distance_m: 2400, duration_s: 420, recommendation_reason: 'Available routing-provider alternative.', verified_current_hazard_count: 1, verified_current_hazards: [{ location_name: 'Reported point', source_name: 'Public bulletin', source_url: 'https://example.test/report', last_verified_at: new Date().toISOString() }] };
        return new Response(JSON.stringify({ original_route: { geometry: first, distance_m: 2000, duration_s: 300 }, recommended_route: { geometry: first, distance_m: 2000, duration_s: 300, route_id: 'route-1' }, route_options: [{ ...option1, recommended: true }, option2], selected_route_id: 'route-1', fresh_verified_reports_available: true, safe_route_verified: false, message: 'Not safety verified.', warnings: ['No safety guarantee.'], hazards_avoided: 0, alternatives_considered: 2, data_source: 'OSRM / OpenStreetMap', data_fetched_at: new Date().toISOString() }), { status: 200 });
      }
      return original(input, init);
    });
    render(<FloodIntelligence />);
    await screen.findByRole('option', { name: /Low-lying ward/ });
    fireEvent.change(screen.getByLabelText('Destination (flood-prone inventory only)'), { target: { value: 'loc-1' } });
    fireEvent.change(screen.getByLabelText('Source (Bengaluru only)'), { target: { value: 'Koramangala' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Koramangala' }, { timeout: 1500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Find route' }));
    const comparison = await screen.findByRole('region', { name: 'Flood-aware route comparison' });
    expect(screen.getAllByRole('region', { name: 'Flood-aware route comparison' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Via Test Road' })).toBeInTheDocument();
    expect(screen.getByText('Current route: Via Test Road')).toBeInTheDocument();
    expect(screen.getByText('Alternative route: Route B')).toBeInTheDocument();
    expect(comparison.textContent).toContain('2.0 km · 5 min');
    expect(comparison.textContent).toContain('2.4 km · 7 min');
    expect(screen.getByText(/Compared with Route B: 400 m shorter · 2 min faster/)).toBeInTheDocument();
    expect(within(comparison).getByText('Keep current route')).toBeInTheDocument();
    expect(within(comparison).getByText(/mapped near the alternative, with none mapped near the current route/)).toBeInTheDocument();
    expect(comparison.textContent).toContain('Static vulnerability context: 0 points.');
    expect(comparison.textContent).toContain('Reported point · Public bulletin');
    expect(comparison.querySelectorAll('.route-option')).toHaveLength(0);
    expect(comparison.querySelectorAll('.route-option-weather')).toHaveLength(0);
    expect(comparison.querySelectorAll('.route-result')).toHaveLength(0);
    expect(screen.getAllByLabelText('Destination evening weather outlook')).toHaveLength(1);
    expect(comparison.querySelectorAll('.route-danger-context')).toHaveLength(1);
    expect(comparison.querySelectorAll('.route-result')).toHaveLength(0);
    const beforeSelect = screen.getAllByTestId('route-geometry');
    expect(beforeSelect.map(route => route.getAttribute('data-route-color'))).toEqual(['#4878d0', '#00a37a']);
    const routeSelect = screen.getByRole('combobox', { name: 'Select current route to display' });
    fireEvent.change(routeSelect, { target: { value: 'route-2' } });
    expect(screen.getByRole('heading', { name: 'Via Route B' })).toBeInTheDocument();
    expect(within(comparison).getByText('Consider switching')).toBeInTheDocument();
    expect(screen.getByText(/1 fresh verified point report\(s\) are mapped near this candidate/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute('href', 'https://example.test/report');
    expect(screen.getAllByTestId('route-geometry')).toHaveLength(2);
    const afterSelect = screen.getAllByTestId('route-geometry');
    expect(afterSelect.map(route => route.getAttribute('data-route-color'))).toEqual(['#e58a18', '#00a37a']);
  });

  it('shows routing failures with a retry action instead of invented route details', async () => {
    const fetchMock = mockFetch();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => String(input).includes('/api/routes/alternate') ? new Response(JSON.stringify({ detail: 'The routing provider timed out. Please retry.' }), { status: 504 }) : original(input, init));
    render(<FloodIntelligence />);
    await screen.findByRole('option', { name: /Low-lying ward/ });
    fireEvent.change(screen.getByLabelText('Destination (flood-prone inventory only)'), { target: { value: 'loc-1' } });
    fireEvent.change(screen.getByLabelText('Source (Bengaluru only)'), { target: { value: 'Koramangala' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Koramangala' }, { timeout: 1500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Find route' }));
    expect(await screen.findByText('The routing provider timed out. Please retry.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Flood-aware route comparison' })).not.toBeInTheDocument();
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
