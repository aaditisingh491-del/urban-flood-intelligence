import { useEffect, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import type { LatLngExpression, LeafletMouseEvent } from 'leaflet';
import { AlertTriangle, Navigation, Search, CloudRain } from 'lucide-react';
import SafetyAdvice from './SafetyAdvice';
import 'leaflet/dist/leaflet.css';
import './flood-intelligence.css';
import './flood-intelligence-controls.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
type Point = { latitude: number; longitude: number; name?: string };
type RecordRow = { location_id: string; location_name: string; city: string; state: string; latitude: number; longitude: number; event_type: string; status: string; severity?: string | null; confidence: string; source_name: string; source_url: string; observed_at?: string | null; last_verified_at?: string };
type Summary = { total_records: number; active_verified_floods: number; official_alerts: number; historical_records: number; rainfall_based_risks: number; exposure_inventory: number; last_successful_ingestion: string | null; storage_mode: string };
type Suggestion = Point & { name: string };
type ForecastSlot = { valid_at: string; precipitation_mm: number | null; precipitation_probability_percent: number | null; temperature_c: number | null; weather_code: number | null };
type Forecast = { provider: string; attribution: string; timezone: string; generated_at: string; units: { precipitation: string; precipitation_probability: string; temperature: string }; slots: ForecastSlot[] };
type Assessment = { location: { location_id: string; location_name: string; city: string; state: string; inventory_status: string; inventory_confidence: string; inventory_source: string; inventory_source_url: string; latitude: number; longitude: number }; model_score: number | null; model_category: string; model_status: string; model_warning: string; current_verified_incidents_within_1km: number; current_verified_incident_sources: string[]; assessed_at: string; data_source: string; forecast: Forecast | null; forecast_error: string | null };
type RouteResult = { original_route: { geometry: GeoJSON.GeoJsonObject; distance_m?: number; duration_s?: number }; recommended_route: { geometry: GeoJSON.GeoJsonObject; distance_m?: number; duration_s?: number } | null; safe_route_verified: boolean; message: string; warnings: string[]; hazards_avoided: number; alternatives_considered: number };
const fmt = (value?: number) => value == null ? '—' : `${(value / 1000).toFixed(1)} km`;
const duration = (value?: number) => value == null ? '—' : `${Math.round(value / 60)} min`;

function MapSourceClick({ onSelect }: { onSelect: (point: Point) => void }) {
  useMapEvents({ click(event: LeafletMouseEvent) { onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng }); } });
  return null;
}

function validLine(route?: RouteResult['original_route'] | RouteResult['recommended_route']): boolean {
  if (!route) return true;
  const geometry = route.geometry as GeoJSON.LineString;
  return geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) &&
    (route.distance_m == null || (Number.isFinite(route.distance_m) && route.distance_m >= 0)) &&
    (route.duration_s == null || (Number.isFinite(route.duration_s) && route.duration_s >= 0));
}

export default function FloodIntelligence() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [destinations, setDestinations] = useState<RecordRow[]>([]);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [inventoryError, setInventoryError] = useState('');

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');
  const assessmentRequest = useRef(0);
  const routeRequest = useRef(0);
  const [originText, setOriginText] = useState('');
  const [origin, setOrigin] = useState<Point | null>(null);
  const [serviceArea, setServiceArea] = useState<GeoJSON.GeoJsonObject | null>(null);
  const [destinationId, setDestinationId] = useState('');
  const destination = destinations.find(row => row.location_id === destinationId) || null;
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [searchNotice, setSearchNotice] = useState('');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch(`${API_BASE}/api/floods/summary`).then(r => r.ok ? r.json() : null).then(setSummary).catch(() => setSummary(null));
    fetch(`${API_BASE}/api/service-area`).then(r => r.ok ? r.json() : null).then(setServiceArea).catch(() => setServiceArea(null));
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await fetch(`${API_BASE}/api/floods?page=1&page_size=100&sort_by=location_name`);
        if (!first.ok) throw new Error();
        const data = await first.json();
        const all = [...data.records];
        for (let next = 2; next <= Math.ceil(data.total / 100); next++) {
          const response = await fetch(`${API_BASE}/api/floods?page=${next}&page_size=100&sort_by=location_name`);
          if (!response.ok) throw new Error();
          all.push(...(await response.json()).records);
        }
        if (!cancelled) {
          const inventory = all.filter((row: RecordRow) => row.event_type === 'exposure_location');
          setRecords(inventory); setDestinations(inventory); setInventoryReady(true);
          const requested = new URLSearchParams(window.location.search).get('destination');
          if (requested && inventory.some((row: RecordRow) => row.location_id === requested)) setDestinationId(requested);
          if (requested && window.location.hash === '#dashboard') window.setTimeout(() => document.getElementById('dashboard')?.scrollIntoView(), 0);
        }
      } catch { if (!cancelled) { setRecords([]); setDestinations([]); setInventoryReady(true); setInventoryError('Flood location inventory could not be loaded. Destinations are unavailable.'); } }
      finally { /* Inventory records are map context, not an embedded home-page list. */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refreshAssessment(row: RecordRow, token: number) {
    setAssessment(null); setAssessmentError(''); setAssessmentLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/floods/${encodeURIComponent(row.location_id)}/assessment`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Destination assessment is unavailable.');
      if (token === assessmentRequest.current) setAssessment(body as Assessment);
    } catch (cause) {
      if (token === assessmentRequest.current) setAssessmentError(cause instanceof Error ? cause.message : 'Destination assessment is unavailable.');
    } finally { if (token === assessmentRequest.current) setAssessmentLoading(false); }
  }

  useEffect(() => {
    routeRequest.current += 1;
    const token = ++assessmentRequest.current;
    setRoute(null); setAssessment(null); setAssessmentError('');
    if (destination) void refreshAssessment(destination, token);
    else setAssessmentLoading(false);
    return () => { assessmentRequest.current += 1; };
  }, [destinationId]);

  async function search(text: string) {
    setOriginText(text); setOrigin(null); setRoute(null);
    setSearchNotice(''); setError('');
    window.clearTimeout(searchTimer.current);
    if (text.trim().length < 2) { setSuggestions(null); return; }
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(text)}`);
        if (!response.ok) throw new Error();
        const data = await response.json(); setSuggestions(data.results);
        if (data.results.length === 0) setSearchNotice('Please select a location within Bengaluru.');
      } catch { setSuggestions([]); setSearchNotice('Place search is unavailable right now. Please retry.'); }
    }, 350);
  }
  function chooseOrigin(item: Suggestion) {
    setOrigin(item); setOriginText(item.name); setSuggestions(null); setSearchNotice(''); setRoute(null); setError('');
  }
  async function chooseMapSource(point: Point) {
    setOrigin(null); setOriginText('Checking map selection…'); setRoute(null); setError(''); setSuggestions(null); setSearchNotice('');
    try {
      const response = await fetch(`${API_BASE}/api/locations/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(point) });
      const body = await response.json();
      if (!response.ok || body.valid !== true) throw new Error(body.detail || 'Please select a location within Bengaluru.');
      const selected = { latitude: body.latitude, longitude: body.longitude, name: `Map selection (${body.latitude.toFixed(5)}, ${body.longitude.toFixed(5)})` };
      setOrigin(selected); setOriginText(selected.name);
    } catch (e) {
      setOriginText(''); setError(e instanceof Error ? e.message : 'Please select a location within Bengaluru.');
    }
  }
  function changeSource() { setOrigin(null); setOriginText(''); setSuggestions(null); setSearchNotice(''); setRoute(null); }
  function chooseDestination(id: string) { setDestinationId(id); setRoute(null); setAssessment(null); setAssessmentError(''); }
  async function calculateRoute() {
    if (!origin || !destination) { setError('Choose an origin by search and a destination from the flood-prone inventory.'); return; }
    setBusy(true); setError(''); setRoute(null);
    const routeToken = ++routeRequest.current;
    const assessmentToken = ++assessmentRequest.current;
    const assessmentPromise = refreshAssessment(destination, assessmentToken);
    try {
      const response = await fetch(`${API_BASE}/api/routes/alternate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: { latitude: origin.latitude, longitude: origin.longitude }, destination_location_id: destination.location_id, travel_mode: 'driving' }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'No route is available from the routing provider. Please retry.');
      if (!body?.original_route || !validLine(body.original_route) || !validLine(body.recommended_route) || !Array.isArray(body.warnings) || typeof body.message !== 'string') throw new Error('The routing provider returned an incomplete or invalid route response. Please retry.');
      await assessmentPromise;
      if (routeToken === routeRequest.current && destinationId === destination.location_id) setRoute(body);
    } catch (e) { if (routeToken === routeRequest.current) setError(e instanceof Error ? e.message : 'Route service unavailable.'); }
    finally { if (routeToken === routeRequest.current) setBusy(false); }
  }

  const mapCenter: LatLngExpression = origin ? [origin.latitude, origin.longitude] : [12.9716, 77.5946];
  return <section className="flood-intelligence" aria-label="Flood intelligence and risk-aware routing">
    <div className="flood-heading"><div><span className="eyebrow">FLOOD INTELLIGENCE</span><h2>Bengaluru route planner</h2><p>Choose an origin and an inventory destination. Vulnerability points are not current incident reports.</p></div><small>{summary?.storage_mode === 'dynamodb' ? 'DynamoDB connected' : 'Bengaluru service area'}</small></div>
    <div className="route-inputs">
      <div className="route-search"><label htmlFor="flood-origin">Source (Bengaluru only)</label><div><Search size={15} /><input id="flood-origin" value={originText} onChange={e => search(e.target.value)} placeholder="Search a Bengaluru locality, landmark, or address" autoComplete="off" aria-autocomplete="list" aria-controls="origin-suggestions" aria-expanded={Boolean(suggestions?.length)} /></div>
        {origin && <p className="selected-source"><span>Selected source: <b>{origin.name}</b></span><button type="button" onClick={changeSource}>Change source</button></p>}
        {suggestions && suggestions.length > 0 && <ul className="place-suggestions" id="origin-suggestions" role="listbox">{suggestions.map((item, i) => <li key={`${item.latitude}-${item.longitude}-${i}`} role="option"><button type="button" onClick={() => chooseOrigin(item)}>{item.name}</button></li>)}</ul>}
        {searchNotice && <p className="origin-search-notice" role="status">{searchNotice}</p>}
      </div>
      <div className="route-search"><label htmlFor="flood-destination">Destination (flood-prone inventory only)</label><select id="flood-destination" value={destinationId} onChange={e => chooseDestination(e.target.value)} disabled={!inventoryReady || destinations.length === 0}><option value="">{!inventoryReady ? 'Loading inventory…' : destinations.length ? 'Select an inventory location' : 'No inventory locations available'}</option>{destinations.map(row => <option key={row.location_id} value={row.location_id}>{row.location_name} — {row.city}, {row.state}</option>)}</select></div>
      <button className="route-calculate" onClick={calculateRoute} disabled={busy || !inventoryReady || !origin || !destination}><Navigation size={15} />{busy ? 'Finding routes…' : 'Find route'}</button>
    </div>
    <p className="route-map-instruction">The map shows vulnerability points and routes. Click inside the Bengaluru service area to select the source; map clicks never set a destination.</p>
    {inventoryError && <p className="flood-error" role="alert">{inventoryError}</p>}
    {error && <p className="flood-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
    <div className="flood-map"><MapContainer center={mapCenter} zoom={12} scrollWheelZoom zoomControl className="interactive-map" aria-label="Flood inventory and route display map">
      <MapSourceClick onSelect={chooseMapSource}/><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {serviceArea && <GeoJSON data={serviceArea} style={{ color: '#73b8a8', weight: 2, fillOpacity: .04, dashArray: '5 4' }} />}
      {records.map(r => { const color = r.status === 'active' ? (r.severity === 'critical' || r.severity === 'high' ? '#e98570' : '#e2b56e') : r.event_type === 'historical_flood' ? '#82afcb' : r.event_type === 'rainfall_based_risk' ? '#9c8ad1' : '#e2b56e'; return <CircleMarker key={r.location_id} center={[r.latitude, r.longitude]} radius={r.status === 'active' ? 7 : 5} pathOptions={{ color, fillColor: color, fillOpacity: .68, weight: 1 }}><Popup><strong>{r.location_name}</strong><br/>{r.city}, {r.state}<br/>{r.event_type.replace(/_/g, ' ')} · {r.status}<br/>Severity: {r.severity || 'not supplied'} · Confidence: {r.confidence}<br/>Observed: {r.observed_at || 'not supplied'} · Retrieved: {r.last_verified_at || 'not verified'}<br/><a href={r.source_url} target="_blank" rel="noreferrer">{r.source_name}</a></Popup></CircleMarker>; })}
      {origin && <CircleMarker center={[origin.latitude, origin.longitude]} radius={8} pathOptions={{ color: '#73b8a8', fillColor: '#73b8a8', fillOpacity: .95 }}><Popup>Selected origin</Popup></CircleMarker>}
      {destination && <CircleMarker center={[destination.latitude, destination.longitude]} radius={8} pathOptions={{ color: '#82afcb', fillColor: '#82afcb', fillOpacity: .95 }}><Popup>Selected destination</Popup></CircleMarker>}
      {route && <GeoJSON data={route.original_route.geometry} style={{ color: '#c1cbd0', weight: 4, opacity: .7, dashArray: '7 7' }} />}
      {route?.recommended_route && <GeoJSON data={route.recommended_route.geometry} style={{ color: '#73b8a8', weight: 5, opacity: .9 }} />}
    </MapContainer></div><div className="flood-map-legend"><span><i className="legend-exposure"/>Vulnerability inventory</span><span><i className="legend-active"/>Active verified incident</span><span><i className="legend-history"/>Historical</span><span><i className="legend-risk"/>Modeled risk</span><span><i className="legend-origin"/>Origin</span><span><i className="legend-destination"/>Destination</span><span><i className="legend-route"/>Route</span></div>
    {route && <div className={`route-result ${route.safe_route_verified ? 'route-result-ok' : ''}`}><AlertTriangle size={18}/><div><h3>Why this road is dangerous</h3><strong>{route.message}</strong><p>Route analysis for {destination?.location_name}, {destination?.city}. This inventory marks flood vulnerability and does not establish that this road is currently flooded or closed.</p><p>{route.recommended_route ? `${fmt(route.recommended_route.distance_m)} · ${duration(route.recommended_route.duration_s)} recommended candidate${route.original_route.distance_m != null && route.recommended_route.distance_m != null ? ` · ${fmt(route.recommended_route.distance_m - route.original_route.distance_m)} additional distance` : ''}${route.original_route.duration_s != null && route.recommended_route.duration_s != null ? ` · ${Math.round((route.recommended_route.duration_s - route.original_route.duration_s) / 60)} additional minutes` : ''}` : `No verified clear route · fastest candidate shown as a dashed reference (${fmt(route.original_route.distance_m)} · ${duration(route.original_route.duration_s)})`} · {route.alternatives_considered} candidate(s) · {route.hazards_avoided} mapped hazards avoided</p>{route.warnings.map(w => <small key={w}>{w}</small>)}</div></div>}
    <div className="destination-insights">
      <section className="destination-risk-card" aria-live="polite" aria-label="Destination risk assessment">
        <p className="insight-eyebrow">DESTINATION RISK</p>
        {!destination && <p>Select a flood-vulnerable inventory destination to view its assessment.</p>}
        {destination && assessmentLoading && <p role="status">Refreshing destination assessment…</p>}
        {destination && assessmentError && <p role="alert">Assessment unavailable: {assessmentError}</p>}
        {destination && !assessmentLoading && !assessmentError && assessment && <>
          <h3>{assessment.location.location_name}</h3><p>{assessment.location.city}, {assessment.location.state}</p>
          {assessment.model_score == null ? <b>Forecast-based estimate unavailable</b> : <><strong className="model-score">{assessment.model_score}<small> / 100</small></strong><span className="model-label">Uncalibrated model score · not a probability</span><p>{assessment.model_category} provisional rainfall-context category</p></>}
          <p className="risk-evidence">Vulnerability inventory point; not a confirmed active flood. Verified current flood records in the configured data within 1 km: {assessment.current_verified_incidents_within_1km}{assessment.current_verified_incidents_within_1km > 0 ? ` (${assessment.current_verified_incident_sources.join(', ')})` : ''}. A zero count does not mean the area is flood-free; coverage may be incomplete.</p>
          <p>{assessment.model_warning}</p><small>Source: {assessment.data_source} · assessed {new Date(assessment.assessed_at).toLocaleString()}</small>
          <a href={assessment.location.inventory_source_url} target="_blank" rel="noreferrer">Inventory source: {assessment.location.inventory_source}</a>
        </>}
      </section>
      <section className="evening-outlook" aria-live="polite" aria-label="Destination evening weather outlook">
        <p className="insight-eyebrow"><CloudRain size={14}/> ILLUSTRATIVE EVENING OUTLOOK</p>
        {destination && <h3>{destination.location_name} · Bengaluru time (Asia/Kolkata)</h3>}
        {destination && assessmentLoading && <p role="status">Loading destination forecast…</p>}
        {destination && assessmentError && <p role="alert">Forecast unavailable: {assessmentError}</p>}
        {destination && !assessmentLoading && assessment && !assessment.forecast && <p>Forecast unavailable for this destination. Try again later.</p>}
        {destination && !assessmentLoading && assessment?.forecast && (() => {
          const slots = assessment.forecast!.slots;
          const evening = slots.filter(slot => {
            const at = new Date(slot.valid_at);
            const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(at));
            return at.getTime() >= Date.now() && hour >= 17 && hour <= 22;
          });
          const date = evening[0]?.valid_at.slice(0, 10);
          const selectedSlots = evening.filter(slot => slot.valid_at.startsWith(date || ''));
          const condition = (code: number | null) => code == null ? 'Condition unavailable' : code === 0 ? 'Clear' : code === 1 ? 'Mostly clear' : code === 2 ? 'Partly cloudy' : code === 3 ? 'Overcast' : code <= 48 ? 'Fog' : code <= 55 ? 'Drizzle' : code <= 57 ? 'Freezing drizzle' : code <= 65 ? 'Rain' : code <= 67 ? 'Freezing rain' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain showers' : code <= 86 ? 'Snow showers' : 'Thunderstorm';
          return <>
            <p>{selectedSlots.length ? `Forecast for ${date} · provider-returned evening hours` : 'No upcoming evening forecast slots are available; no times have been substituted.'}</p>
            {selectedSlots.length > 0 && <div className="forecast-slots">{selectedSlots.map(slot => <article key={slot.valid_at}>
              <b>{new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(slot.valid_at))}</b>
              <span>{condition(slot.weather_code)}</span>
              <span>{slot.precipitation_mm == null ? 'Precipitation unavailable' : `${slot.precipitation_mm} ${assessment.forecast!.units.precipitation} precipitation`}</span>
              <span>{slot.precipitation_probability_percent == null ? 'Rain chance unavailable' : `${slot.precipitation_probability_percent}${assessment.forecast!.units.precipitation_probability} precipitation chance`}</span>
              <span>{slot.temperature_c == null ? 'Temperature unavailable' : `${slot.temperature_c}${assessment.forecast!.units.temperature}`}</span>
              {slot.precipitation_mm != null && <small>{slot.precipitation_mm >= 10 ? 'Heavier forecast rain may raise concern; rain alone does not confirm flooding.' : slot.precipitation_mm > 0 ? 'Rain forecast; this does not confirm flooding.' : 'No precipitation forecast this hour; road safety is not established.'}</small>}
            </article>)}</div>}
            {Date.now() - Date.parse(assessment.forecast.generated_at) > 60 * 60 * 1000 && <p role="status">This forecast response is more than one hour old; treat it as stale and refresh.</p>}
            <small>Provider: {assessment.forecast.provider} · fetched {new Date(assessment.forecast.generated_at).toLocaleString()} · valid times shown in {assessment.forecast.timezone}.</small>
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{assessment.forecast.attribution}</a>
          </>;
        })()}
      </section>
    </div>
    <section className="home-safety-panel"><h3>What should I do?</h3><SafetyAdvice/></section>
    <p className="flood-disclaimer">Risk-aware routing only, not a safety guarantee. Locations without reports are not verified safe. Follow official emergency guidance. Data refresh: {summary?.last_successful_ingestion || 'local inventory load'}.</p>
  </section>;
}
