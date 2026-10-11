export type RouteMetric = { distance_m?: number; duration_s?: number };
export type RouteEvidence = RouteMetric & { verified_current_hazard_count?: number };
export type RouteRecommendation = { label: 'Keep current route' | 'Consider switching' | 'Insufficient evidence to recommend switching'; reason: string };

export function routeName(label: string | undefined, index: number): string {
  const clean = typeof label === 'string' ? label.trim() : '';
  if (clean && !/^route\s+\d+$/i.test(clean)) return clean;
  return `Route ${String.fromCharCode(65 + index)}`;
}

export function routeDisplayNames(routes: { label?: string }[]): string[] {
  const names = routes.map((route, index) => routeName(route.label, index));
  return names.map((name, index) => names.indexOf(name) === names.lastIndexOf(name)
    ? name
    : `Route ${String.fromCharCode(65 + index)}`);
}

function validMetric(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

function distanceText(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function routeMetrics(route: RouteMetric): string {
  const distance = validMetric(route.distance_m) ? distanceText(route.distance_m) : 'Distance unavailable';
  const time = validMetric(route.duration_s) ? `${Math.round(route.duration_s / 60)} min` : 'Travel time unavailable';
  return `${distance} · ${time}`;
}

function difference(value: number | undefined, reference: number | undefined, scale: number, unit: string): string {
  if (!validMetric(value) || !validMetric(reference)) return `${unit === 'km' ? 'Distance' : 'Travel-time'} comparison unavailable`;
  const delta = value - reference;
  if (Math.abs(delta) < 0.001) return unit === 'km' ? 'Same distance' : 'Same estimated travel time';
  const magnitude = Math.abs(delta) / scale;
  const rounded = unit === 'km' ? magnitude < 1 ? `${Math.round(magnitude * 1000)} m` : `${magnitude.toFixed(1)} km` : magnitude < 1 ? 'under 1 min' : `${Math.round(magnitude)} min`;
  return `${rounded} ${unit === 'km' ? (delta < 0 ? 'shorter' : 'longer') : (delta < 0 ? 'faster' : 'slower')}`;
}

export function compareRouteMetrics(recommended: RouteMetric, alternative: RouteMetric): string {
  return `${difference(recommended.distance_m, alternative.distance_m, 1000, 'km')} · ${difference(recommended.duration_s, alternative.duration_s, 60, 'min')}`;
}

export function recommendComparedRoute(current: RouteEvidence, alternative: RouteEvidence | null, freshReportsAvailable: boolean | undefined): RouteRecommendation {
  if (!alternative) return { label: 'Insufficient evidence to recommend switching', reason: 'Only one route is available, so there is no alternative to compare.' };

  const currentHazards = current.verified_current_hazard_count || 0;
  const alternativeHazards = alternative.verified_current_hazard_count || 0;
  if (freshReportsAvailable !== false && (currentHazards > 0 || alternativeHazards > 0)) {
    if (currentHazards > 0 && alternativeHazards === 0) {
      return { label: 'Consider switching', reason: 'Fresh verified reports are mapped near the current route, with none mapped near the alternative. Coverage is incomplete; the alternative is not confirmed safe.' };
    }
    if (currentHazards === 0 && alternativeHazards > 0) {
      return { label: 'Keep current route', reason: 'Fresh verified reports are mapped near the alternative, with none mapped near the current route. This is not a safety guarantee.' };
    }
      return { label: 'Insufficient evidence to recommend switching', reason: 'Fresh verified reports are mapped near both routes; point data does not reliably distinguish them.' };
  }

  const currentTime = current.duration_s;
  const alternativeTime = alternative.duration_s;
  const currentDistance = current.distance_m;
  const alternativeDistance = alternative.distance_m;
  const timeDelta = validMetric(currentTime) && validMetric(alternativeTime) ? currentTime - alternativeTime : null;
  const distanceDelta = validMetric(currentDistance) && validMetric(alternativeDistance) ? currentDistance - alternativeDistance : null;
  const noIncidentContext = freshReportsAvailable === false
    ? ' No fresh verified flood reports are available; this recommendation is based on travel efficiency, not flood safety.'
    : ' No verified flood reports are mapped near either route; this recommendation is based on travel efficiency, not flood safety.';

  if (timeDelta != null && Math.abs(timeDelta) <= 60) {
    if (distanceDelta == null || Math.abs(distanceDelta) < 1) {
      return { label: 'Insufficient evidence to recommend switching', reason: `Estimated travel times are within one minute and available distances are tied or incomplete.${noIncidentContext}` };
    }
    return distanceDelta < 0
      ? { label: 'Keep current route', reason: `Estimated travel times are within one minute; the current route is ${distanceText(Math.abs(distanceDelta))} shorter.${noIncidentContext}` }
      : { label: 'Consider switching', reason: `Estimated travel times are within one minute; the alternative is ${distanceText(Math.abs(distanceDelta))} shorter.${noIncidentContext}` };
  }
  if (timeDelta != null && Math.abs(timeDelta) > 60) {
    return timeDelta < 0
      ? { label: 'Keep current route', reason: `The current route has the lower provider-estimated travel time.${noIncidentContext}` }
      : { label: 'Consider switching', reason: `The alternative has the lower provider-estimated travel time.${noIncidentContext}` };
  }
  if (distanceDelta != null && Math.abs(distanceDelta) >= 1) {
    return distanceDelta < 0
      ? { label: 'Keep current route', reason: `Travel-time estimates are unavailable; the current route is shorter by distance only.${noIncidentContext}` }
      : { label: 'Consider switching', reason: `Travel-time estimates are unavailable; the alternative is shorter by distance only.${noIncidentContext}` };
  }
  return { label: 'Insufficient evidence to recommend switching', reason: `Comparable distance and travel-time metrics are missing or tied.${noIncidentContext}` };
}
