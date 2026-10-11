import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, BellOff, CloudRain, ExternalLink, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ThemeToggle from './theme';
import { evaluateSixHourThreshold, forecastAlertId, isForecastStale, requestAlertNotificationPermission, type AlertThresholds, type HourlyForecastSlot } from './alertLogic';
import EmergencyModeControl from './EmergencyMode';
import './smart-alerts.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const LOCATIONS_KEY = 'floodsense-alert-locations-v1';
const SETTINGS_KEY = 'floodsense-alert-settings-v1';
const ALERTS_KEY = 'floodsense-alert-history-v1';
const NOTIFICATIONS_KEY = 'floodsense-alert-notifications-v1';
const MAX_LOCATIONS = 12;

type SavedLocation = { id: string; name: string; latitude: number; longitude: number; monitored: boolean };
type AlertItem = { id: string; locationId: string; locationName: string; startAt: string; endAt: string; triggerAt: string; rainfallMm: number; probabilityPercent: number; rainfallThresholdMm: number; probabilityThresholdPercent: number; fetchedAt: string; dismissed: boolean };
type CheckState = { fetchedAt?: string; provider?: string; stale?: boolean; error?: string; triggerMet?: boolean; unavailable?: string };
type Suggestion = { name: string; latitude: number; longitude: number };
type ForecastResponse = { forecast?: { generated_at?: string; provider?: string; attribution?: string; timezone?: string; units?: { precipitation?: string; precipitation_probability?: string }; slots?: HourlyForecastSlot[] } };

function readJson<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || 'null'); return validate(value) ? value : fallback; }
  catch { return fallback; }
}
const validLocations = (value: unknown): value is SavedLocation[] => Array.isArray(value) && value.every(row => row && typeof row.id === 'string' && typeof row.name === 'string' && Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && typeof row.monitored === 'boolean');
const validAlerts = (value: unknown): value is AlertItem[] => Array.isArray(value) && value.every(row => row && typeof row.id === 'string' && typeof row.locationName === 'string' && typeof row.startAt === 'string' && typeof row.dismissed === 'boolean');
const validSettings = (value: unknown): value is AlertThresholds => Boolean(value && typeof value === 'object' && Number.isFinite((value as AlertThresholds).rainfallMm) && (value as AlertThresholds).rainfallMm >= 0 && Number.isFinite((value as AlertThresholds).probabilityPercent) && (value as AlertThresholds).probabilityPercent >= 0 && (value as AlertThresholds).probabilityPercent <= 100);
function readNotificationPreference(): boolean { try { return localStorage.getItem(NOTIFICATIONS_KEY) === 'true'; } catch { return false; } }
const formatTime = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeZoneName: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function SmartAlerts() {
  const [locations, setLocations] = useState<SavedLocation[]>(() => readJson(LOCATIONS_KEY, [], validLocations));
  const [settings, setSettings] = useState<AlertThresholds>(() => readJson(SETTINGS_KEY, { rainfallMm: 10, probabilityPercent: 50 }, validSettings));
  const [alerts, setAlerts] = useState<AlertItem[]>(() => readJson(ALERTS_KEY, [], validAlerts));
  const [notificationsEnabled, setNotificationsEnabled] = useState(readNotificationPreference);
  const [notificationNotice, setNotificationNotice] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [locationName, setLocationName] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    setSelected(null); setSuggestions([]); setSearchMessage('');
    if (query.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query.trim())}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || 'Place search is unavailable.');
        setSuggestions(Array.isArray(body.results) ? body.results : []);
        if (!body.results?.length) setSearchMessage('Please select a location within Bengaluru. No matching place was found.');
      } catch (error) { setSuggestions([]); setSearchMessage(error instanceof Error ? error.message : 'Place search is unavailable.'); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (timer.current != null) window.clearTimeout(timer.current); };
  }, [query]);

  useEffect(() => { try { localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations)); } catch { /* Storage may be unavailable. */ } }, [locations]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage may be unavailable. */ } }, [settings]);
  useEffect(() => { try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, 100))); } catch { /* Current-session alert history remains usable. */ } }, [alerts]);
  useEffect(() => { try { localStorage.setItem(NOTIFICATIONS_KEY, String(notificationsEnabled)); } catch { /* Preference can remain in this session. */ } }, [notificationsEnabled]);

  async function saveLocation() {
    if (!selected || !locationName.trim() || saving) return;
    if (locations.length >= MAX_LOCATIONS) { setSearchMessage(`Save up to ${MAX_LOCATIONS} locations on this device.`); return; }
    setSaving(true); setSearchMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/locations/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: selected.latitude, longitude: selected.longitude }) });
      const body = await response.json();
      if (!response.ok || body.valid !== true) throw new Error(body.detail || 'Select a location inside Bengaluru.');
      const id = `${Number(body.latitude).toFixed(5)},${Number(body.longitude).toFixed(5)}`;
      setLocations(current => current.some(location => location.id === id) ? current.map(location => location.id === id ? { ...location, name: locationName.trim() } : location) : [...current, { id, name: locationName.trim(), latitude: body.latitude, longitude: body.longitude, monitored: true }]);
      setQuery(''); setSelected(null); setLocationName(''); setSuggestions([]); setSearchMessage('Location saved on this browser. Forecasts run only when you choose Refresh alerts.');
    } catch (error) { setSearchMessage(error instanceof Error ? error.message : 'Location could not be validated.'); }
    finally { setSaving(false); }
  }

  function updateLocation(id: string, update: Partial<SavedLocation>) { setLocations(current => current.map(location => location.id === id ? { ...location, ...update } : location)); }

  async function refreshAlerts() {
    const monitored = locations.filter(location => location.monitored);
    if (!monitored.length || refreshing) return;
    setRefreshing(true); setRefreshError('');
    const nextChecks: Record<string, CheckState> = {};
    const newAlerts: AlertItem[] = [];
    try {
      await Promise.all(monitored.map(async location => {
        try {
          const response = await fetch(`${API_BASE}/api/locations/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}`);
          const body = await response.json() as ForecastResponse & { detail?: string };
          const forecast = body.forecast;
          if (!response.ok || !forecast || !forecast.generated_at || !Array.isArray(forecast.slots)) throw new Error(body.detail || 'Forecast response is unavailable or incomplete.');
          const fetchedAt = forecast.generated_at;
          const slots = forecast.slots;
          const stale = isForecastStale(fetchedAt);
          if (stale) { nextChecks[location.id] = { fetchedAt, stale: true }; return; }
          const evaluation = evaluateSixHourThreshold(slots, settings);
          nextChecks[location.id] = { fetchedAt, provider: forecast.provider || 'Open-Meteo', triggerMet: Boolean(evaluation.window), unavailable: evaluation.unavailableReason };
          if (!evaluation.window) return;
          const id = forecastAlertId(location.id, evaluation.window.startAt, settings);
          newAlerts.push({ id, locationId: location.id, locationName: location.name, startAt: evaluation.window.startAt, endAt: evaluation.window.endAt, triggerAt: evaluation.window.thresholdTime, rainfallMm: evaluation.window.rainfallMm, probabilityPercent: evaluation.window.maxProbabilityPercent, rainfallThresholdMm: settings.rainfallMm, probabilityThresholdPercent: settings.probabilityPercent, fetchedAt, dismissed: false });
        } catch (error) { nextChecks[location.id] = { error: error instanceof Error ? error.message : 'Forecast unavailable.' }; }
      }));
      setChecks(current => ({ ...current, ...nextChecks }));
      setLastChecked(new Date().toISOString());
      const existingIds = new Set(alerts.map(alert => alert.id));
      const unique = newAlerts.filter(alert => !existingIds.has(alert.id));
      if (unique.length) {
        setAlerts(current => [...unique, ...current].slice(0, 100));
        if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          unique.forEach(alert => { try { new Notification('FloodSense forecast-based alert', { body: `${alert.locationName}: ${alert.rainfallMm} mm forecast over 6 hours; maximum precipitation probability ${alert.probabilityPercent}%.` }); } catch { /* In-app alerts remain available. */ } });
        }
      }
    } catch { setRefreshError('Alert refresh failed. Existing saved alerts are unchanged.'); }
    finally { setRefreshing(false); }
  }

  async function enableNotifications() {
    setNotificationNotice('');
    try {
      const permission = await requestAlertNotificationPermission();
      if (permission === 'granted') { setNotificationsEnabled(true); setNotificationNotice('Browser notifications enabled. In-app alerts work without them.'); }
      else if (permission === 'denied') { setNotificationsEnabled(false); setNotificationNotice('Notifications are blocked or were denied. You can enable them in browser site settings; in-app alerts remain available.'); }
      else { setNotificationsEnabled(false); setNotificationNotice('This browser does not support notifications. In-app alerts remain available.'); }
    } catch { setNotificationsEnabled(false); setNotificationNotice('Notification permission could not be changed. In-app alerts remain available.'); }
  }

  const activeAlerts = alerts.filter(alert => !alert.dismissed && Date.parse(alert.endAt) >= Date.now());
  const history = alerts.filter(alert => alert.dismissed || Date.parse(alert.endAt) < Date.now());
  const anyStale = locations.some(location => checks[location.id]?.stale);
  return <main className="smart-alerts-page">
    <header className="smart-alerts-header"><div className="smart-alerts-top"><Link to="/" className="alerts-back"><ArrowLeft size={16}/> Back to Home</Link><div><ThemeToggle/><EmergencyModeControl/></div></div><p className="alerts-eyebrow">FLOODSENSE · BENGALURU</p><h1>Smart Flood Alerts</h1><p>Choose places to monitor for forecast thresholds. These are weather-based alerts, not confirmed flooding or road closures.</p></header>
    <section className="alerts-panel" aria-labelledby="save-location-title">
      <div className="alerts-section-heading"><div><MapPin size={19}/><h2 id="save-location-title">Your saved locations</h2></div><span>Stored only in this browser</span></div>
      <p className="alerts-local-note">Search and save only places you choose. Coordinates and preferences stay in this browser’s local storage and are sent to FloodSense only when you manually refresh forecasts.</p>
      <div className="alerts-save-form"><label htmlFor="alerts-place-search">Find a Bengaluru place</label><input id="alerts-place-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search locality, landmark, or address" autoComplete="off" aria-autocomplete="list" aria-controls="alerts-place-options" aria-expanded={suggestions.length > 0}/>
        {searching && <p role="status">Searching within Bengaluru…</p>}
        {suggestions.length > 0 && <ul id="alerts-place-options" role="listbox">{suggestions.map((suggestion, index) => <li key={`${suggestion.latitude}-${suggestion.longitude}-${index}`}><button type="button" role="option" aria-selected="false" onClick={() => { setSelected(suggestion); setLocationName(suggestion.name.split(',')[0]); setSuggestions([]); setSearchMessage(''); }}>{suggestion.name}</button></li>)}</ul>}
        {selected && <div className="alerts-selected-place"><p>Selected place: <strong>{selected.name}</strong></p><label htmlFor="alerts-location-name">Name this saved location</label><input id="alerts-location-name" value={locationName} maxLength={80} onChange={event => setLocationName(event.target.value)}/><button type="button" onClick={() => void saveLocation()} disabled={saving || !locationName.trim() || locations.length >= MAX_LOCATIONS}><Plus size={15}/>{saving ? 'Validating…' : 'Save location'}</button></div>}
        {searchMessage && <p role="status" className="alerts-message">{searchMessage}</p>}
      </div>
      {!locations.length ? <p className="alerts-empty">No locations saved. Search for a Bengaluru place above and save it to configure alerts.</p> : <ul className="saved-location-list">{locations.map(location => <li key={location.id}>
        <label className="monitor-toggle"><input type="checkbox" checked={location.monitored} onChange={event => updateLocation(location.id, { monitored: event.target.checked })}/><span><strong>{location.name}</strong><small>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)} · Bengaluru service area</small></span></label>
        <button className="remove-location" type="button" aria-label={`Remove ${location.name}`} onClick={() => { setLocations(current => current.filter(item => item.id !== location.id)); setChecks(current => { const next = { ...current }; delete next[location.id]; return next; }); }}><Trash2 size={16}/> Remove</button>
        {checks[location.id]?.error && <small role="alert" className="alerts-location-error">Forecast unavailable: {checks[location.id].error}</small>}
        {checks[location.id]?.stale && <small role="status" className="alerts-location-warning">Forecast response is stale (over 1 hour old); no alert was generated from it.</small>}
        {checks[location.id]?.unavailable && <small role="status" className="alerts-location-warning">No alert decision: {checks[location.id].unavailable}</small>}
        {checks[location.id]?.triggerMet && <small className="alerts-location-trigger">Forecast threshold met in the checked six-hour interval.</small>}
        {checks[location.id]?.fetchedAt && <small>Last forecast fetched {formatTime(checks[location.id].fetchedAt!)} · {checks[location.id].provider || 'Open-Meteo'}.</small>}
      </li>)}</ul>}
    </section>

    <section className="alerts-panel" aria-labelledby="threshold-title">
      <div className="alerts-section-heading"><div><CloudRain size={19}/><h2 id="threshold-title">Forecast thresholds</h2></div><span>Hourly Open-Meteo data</span></div>
      <p>Rainfall is summed across the next six consecutive available hourly forecast slots. Probability uses the maximum hourly precipitation probability in that same interval. Both thresholds must be met.</p>
      <div className="alerts-threshold-fields"><label>Rainfall threshold (mm over 6 hours)<input type="number" min="0" max="500" step="0.5" value={settings.rainfallMm} onChange={event => setSettings(current => ({ ...current, rainfallMm: Math.max(0, Math.min(500, Number(event.target.value) || 0)) }))}/></label><label>Minimum precipitation probability (%)<input type="number" min="0" max="100" step="1" value={settings.probabilityPercent} onChange={event => setSettings(current => ({ ...current, probabilityPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))}/></label></div>
      <p className="alerts-threshold-note">A missing rainfall value or unavailable probability prevents an alert decision; missing values are never treated as zero. Threshold edits apply on the next manual refresh.</p>
    </section>

    <section className="alerts-panel alerts-results" aria-labelledby="alerts-title">
      <div className="alerts-section-heading"><div><Bell size={19}/><h2 id="alerts-title">Forecast-based alerts</h2></div><button className="refresh-alerts" type="button" onClick={() => void refreshAlerts()} disabled={refreshing || !locations.some(location => location.monitored)}><RefreshCw size={16} className={refreshing ? 'refreshing' : ''}/>{refreshing ? 'Checking forecasts…' : 'Refresh alerts'}</button></div>
      <p className="alerts-local-note">Manual refresh only; this app does not monitor continuously or run a background scheduler.{lastChecked && <> Last checked {formatTime(lastChecked)}.</>}</p>
      {refreshError && <p role="alert" className="alerts-message alerts-error">{refreshError} Retry with Refresh alerts.</p>}
      {anyStale && <p role="status" className="alerts-message alerts-warning">One or more forecasts are stale. Refresh before relying on these conditions.</p>}
      {locations.some(location => location.monitored && checks[location.id]?.error) && <p role="status" className="alerts-message alerts-warning">Some monitored locations could not be checked. Missing data is not an all-clear.</p>}
      {activeAlerts.length === 0 ? <p className="alerts-empty">{refreshing ? 'Waiting for forecast data…' : lastChecked ? 'No forecast alert currently meets both configured thresholds in the checked interval. This is not confirmation of safe conditions.' : 'No alert check has run yet. Choose Refresh alerts to check monitored locations.'}</p> : <div className="forecast-alert-list">{activeAlerts.map(alert => <article key={alert.id} className="forecast-alert-card"><div><p className="forecast-alert-label">FORECAST-BASED ALERT · NOT A FLOOD REPORT</p><h3>{alert.locationName}</h3><p><strong>{alert.rainfallMm} mm</strong> over 6 forecast hours (threshold {alert.rainfallThresholdMm} mm); maximum precipitation probability <strong>{alert.probabilityPercent}%</strong> (threshold {alert.probabilityThresholdPercent}%).</p><p>Forecast period: {formatTime(alert.startAt)}–{formatTime(alert.endAt)} · threshold reached by {formatTime(alert.triggerAt)}.</p><small>Forecast fetched {formatTime(alert.fetchedAt)} · Open-Meteo · hourly precipitation and probability.</small><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo <ExternalLink size={12}/></a></div><button type="button" onClick={() => setAlerts(current => current.map(item => item.id === alert.id ? { ...item, dismissed: true } : item))}>Dismiss</button></article>)}</div>}
      <div className="alert-notification-setting"><div><h3>Browser notifications</h3><p>{notificationsEnabled ? 'Enabled after your request. New forecast alerts may also appear as browser notifications.' : 'Optional. In-app alerts work without notification permission.'}{notificationNotice && <span role="status"> {notificationNotice}</span>}</p></div>{notificationsEnabled ? <button type="button" onClick={() => { setNotificationsEnabled(false); setNotificationNotice('Browser notifications disabled.'); }}><BellOff size={15}/> Disable</button> : <button type="button" onClick={() => void enableNotifications()}><Bell size={15}/> Enable notifications</button>}</div>
      <p className="alerts-data-limit">This view evaluates forecasts only. It does not convert static flood-vulnerability locations into active incidents, and it does not currently attach verified incident reports to personal alert locations.</p>
      <details className="alerts-history"><summary>Alert history ({history.length})</summary>{history.length ? <ul>{history.map(alert => <li key={alert.id}><strong>{alert.locationName}</strong> · forecast window {formatTime(alert.startAt)} · {alert.rainfallMm} mm / {alert.probabilityPercent}% · {alert.dismissed ? 'dismissed' : 'forecast period ended'} · fetched {formatTime(alert.fetchedAt)}</li>)}</ul> : <p>Dismissed or past forecast alerts will appear here.</p>}</details>
    </section>
    <p className="alerts-disclaimer">Forecast-based alerts are decision-support information, not warnings from emergency authorities. Follow official instructions. See <Link to="/">FloodSense dashboard</Link> for route context.</p>
  </main>;
}
