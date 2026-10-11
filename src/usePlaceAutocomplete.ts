import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
export type PlaceSuggestion = { name: string; latitude: number; longitude: number; country?: string; admin1?: string };
type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/** Shared, debounced backend geocoder search with stale-response protection. */
export function usePlaceAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);
  const suppressedQuery = useRef<string | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    const text = query.trim();
    setSuggestions([]);
    setActiveIndex(-1);
    setError('');
    if (text === suppressedQuery.current) { suppressedQuery.current = null; setState('idle'); return; }
    if (text.length < 2) { setState('idle'); return; }

    setState('loading');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        let body: { detail?: string; results?: unknown };
        try { body = await response.json(); }
        catch { throw new Error(`Place search returned an invalid response (HTTP ${response.status}). Please retry.`); }
        if (!response.ok) throw new Error(body.detail || 'Place search is unavailable right now. Please retry.');
        if (!Array.isArray(body.results)) throw new Error('Place search returned an invalid response. Please retry.');
        const valid = body.results.filter((item: PlaceSuggestion) => item && typeof item.name === 'string'
          && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90
          && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180);
        if (id !== requestId.current) return;
        setSuggestions(valid);
        setState(valid.length ? 'success' : 'empty');
      } catch (cause) {
        if ((controller.signal.aborted && !timedOut) || id !== requestId.current) return;
        setSuggestions([]);
        setError(timedOut ? 'Place search timed out. Please retry.'
          : cause instanceof TypeError ? 'Could not reach the place search service. Check the backend connection and retry.'
          : cause instanceof Error ? cause.message : 'Place search is unavailable right now. Please retry.');
        setState('error');
      } finally {
        window.clearTimeout(timeout);
      }
    }, 300);
    return () => { window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  function moveActive(direction: 1 | -1) {
    setActiveIndex(index => suggestions.length ? (index + direction + suggestions.length) % suggestions.length : -1);
  }
  function reset(ignoreQuery?: string) { suppressedQuery.current = ignoreQuery ?? null; setSuggestions([]); setActiveIndex(-1); setState('idle'); setError(''); }
  return { suggestions, state, error, activeIndex, setActiveIndex, moveActive, reset };
}

export function placeSearchMessage(state: SearchState, error: string) {
  if (state === 'loading') return 'Searching places…';
  if (state === 'empty') return 'No matching place found in Bengaluru. Please select a location within Bengaluru.';
  if (state === 'error') return error;
  return '';
}
