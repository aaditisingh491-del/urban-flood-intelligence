import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Search } from 'lucide-react';
import './explore-page.css';
import ThemeToggle from './theme';
import EmergencyModeControl from './EmergencyMode';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
type Vulnerability = { location_id: string; location_name: string; city: string; state: string; area?: string | null; ward_name?: string | null; ward_number?: string | null; zone?: string | null; description?: string; source_name: string; source_url: string; latitude: number; longitude: number; event_type: string; status: string; confidence: string };

export default function ExplorePage() {
  const [records, setRecords] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [ward, setWard] = useState('all');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await fetch(`${API_BASE}/api/floods?event_type=exposure_location&page=1&page_size=100&sort_by=location_name`);
        if (!first.ok) throw new Error(`Inventory request failed (${first.status}).`);
        const data = await first.json();
        const all = [...data.records] as Vulnerability[];
        for (let page = 2; page <= Math.ceil(data.total / 100); page++) {
          const response = await fetch(`${API_BASE}/api/floods?event_type=exposure_location&page=${page}&page_size=100&sort_by=location_name`);
          if (!response.ok) throw new Error(`Inventory request failed (${response.status}).`);
          all.push(...(await response.json()).records);
        }
        if (!cancelled) setRecords(all.filter(record => record.event_type === 'exposure_location'));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The Bengaluru inventory could not be loaded.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  const wards = useMemo(() => [...new Set(records.map(row => row.ward_name).filter((value): value is string => Boolean(value)))].sort(), [records]);
  const visible = useMemo(() => records.filter(row => {
    const text = `${row.location_name} ${row.area || ''} ${row.ward_name || ''} ${row.zone || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (ward === 'all' || row.ward_name === ward);
  }), [records, query, ward]);
  return <main className="explore-page">
    <header className="explore-page-head"><ThemeToggle/><EmergencyModeControl/><Link to="/alerts" className="back-home">Smart Flood Alerts</Link><Link to="/" className="back-home"><ArrowLeft size={17}/> Back to Home</Link><p className="explore-eyebrow">FLOODSENSE · BENGALURU</p><h1>Flood-vulnerable locations</h1><p className="explore-description">Browse the source-backed Bengaluru vulnerability inventory. These locations are not confirmed active flood incidents or road closures.</p></header>
    <section className="explore-tools" aria-label="Inventory filters"><label><span>Search locations</span><div><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Location, ward, or zone" /></div></label><label><span>Ward</span><select value={ward} onChange={event => setWard(event.target.value)}><option value="all">All wards</option>{wards.map(value => <option key={value}>{value}</option>)}</select></label><p aria-live="polite">{loading ? 'Loading Bengaluru inventory…' : `${visible.length} of ${records.length} locations`}</p></section>
    {error && <p className="explore-state explore-error" role="alert">{error} Refresh the page to retry.</p>}
    {loading && !error && <p className="explore-state" role="status">Loading source-backed locations…</p>}
    {!loading && !error && visible.length === 0 && <p className="explore-state">{records.length ? 'No locations match these filters.' : 'The Bengaluru vulnerability inventory is empty.'}</p>}
    {!loading && !error && visible.length > 0 && <div className="explore-grid">{visible.map(record => <article className="explore-location" key={record.location_id}>
      <div className="explore-location-title"><MapPin size={18}/><div><h2>{record.location_name}</h2><p>{record.area || record.ward_name || 'Area not provided'}{record.zone ? ` · ${record.zone} zone` : ''}</p></div></div>
      <dl><div><dt>City</dt><dd>{record.city}, {record.state}</dd></div><div><dt>Record</dt><dd>Flood-vulnerable location</dd></div><div><dt>Confidence</dt><dd>{record.confidence}</dd></div></dl>
      <p className="explore-evidence">{record.description || 'Mapped vulnerability point; no current incident status is provided.'}</p>
      <footer><a href={record.source_url} target="_blank" rel="noreferrer">Source: {record.source_name}</a><Link className="use-destination" to={`/?destination=${encodeURIComponent(record.location_id)}#dashboard`}>Use as destination</Link></footer>
    </article>)}</div>}
  </main>;
}
