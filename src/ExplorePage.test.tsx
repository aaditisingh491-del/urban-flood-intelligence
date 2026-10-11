import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExplorePage from './ExplorePage';
import { ThemeProvider } from './theme';

const inventoryRow = { location_id: 'ksrsac-bengaluru-1', location_name: 'Lake View Apartment', area: 'Ward 192', ward_name: 'Talaghattapura', zone: 'South', city: 'Bengaluru', state: 'Karnataka', latitude: 12.8675, longitude: 77.5324, event_type: 'exposure_location', status: 'unverified', confidence: 'low', source_name: 'KSRSAC', source_url: 'https://example.test/source', description: 'Vulnerability inventory point; not a live incident.' };

function Probe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>; }

describe('ExplorePage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('loads searchable Bengaluru inventory and links a valid ID back as the destination', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ records: [inventoryRow], total: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter initialEntries={['/explore']}><Probe/><Routes><Route path="/explore" element={<ThemeProvider><ExplorePage/></ThemeProvider>}/><Route path="/" element={<h1>Home route</h1>}/></Routes></MemoryRouter>);
    expect(await screen.findByText('Lake View Apartment')).toBeInTheDocument();
    expect(screen.getByText(/not confirmed active flood incidents/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search locations'), { target: { value: 'Talaghattapura' } });
    expect(screen.getByText('Lake View Apartment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Use as destination' }));
    expect(await screen.findByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/?destination=ksrsac-bengaluru-1#dashboard');
    expect(String(fetchMock.mock.calls[0][0])).toContain('event_type=exposure_location');
  });

  it('shows a clear error state when the inventory API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    render(<MemoryRouter initialEntries={['/explore']}><ThemeProvider><ExplorePage/></ThemeProvider></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Inventory request failed (503)');
    await waitFor(() => expect(screen.queryByText('Loading source-backed locations…')).not.toBeInTheDocument());
  });
});
