import { describe, expect, it } from 'vitest';
import { compareRouteMetrics, recommendComparedRoute, routeDisplayNames, routeMetrics, routeName } from './routeComparison';

describe('route comparison presentation', () => {
  it('uses provider road names and falls back to lettered names', () => {
    expect(routeName('Via Bannerghatta Road', 0)).toBe('Via Bannerghatta Road');
    expect(routeName('', 1)).toBe('Route B');
    expect(routeName('Route 2', 1)).toBe('Route B');
  });

  it('keeps two routes visibly distinct when the provider returns identical names', () => {
    expect(routeDisplayNames([{ label: 'Via Main Road' }, { label: 'Via Main Road' }])).toEqual(['Route A', 'Route B']);
    expect(routeDisplayNames([{ label: '' }, { label: '' }])).toEqual(['Route A', 'Route B']);
  });

  it('computes actual distance and duration differences relative to the recommended route', () => {
    expect(routeMetrics({ distance_m: 13_800, duration_s: 1_320 })).toBe('13.8 km · 22 min');
    expect(compareRouteMetrics({ distance_m: 13_800, duration_s: 1_320 }, { distance_m: 15_000, duration_s: 1_620 })).toBe('1.2 km shorter · 5 min faster');
  });

  it('reports ties and missing metrics without implying an advantage', () => {
    expect(compareRouteMetrics({ distance_m: 10_000, duration_s: 600 }, { distance_m: 10_000, duration_s: 600 })).toBe('Same distance · Same estimated travel time');
    expect(compareRouteMetrics({}, { distance_m: 10_000, duration_s: 600 })).toBe('Distance comparison unavailable · Travel-time comparison unavailable');
    expect(routeMetrics({})).toBe('Distance unavailable · Travel time unavailable');
  });

  it('uses fresh verified evidence to advise considering a switch without promising safety', () => {
    const result = recommendComparedRoute({ verified_current_hazard_count: 1 }, { verified_current_hazard_count: 0 }, true);
    expect(result.label).toBe('Consider switching');
    expect(result.reason).toMatch(/Fresh verified reports are mapped/);
    expect(result.reason).toMatch(/alternative is not confirmed safe/);
  });

  it('compares efficiency only when no current incident data exists and explains near-tied times', () => {
    const result = recommendComparedRoute({ distance_m: 1300, duration_s: 600 }, { distance_m: 1800, duration_s: 620 }, false);
    expect(result.label).toBe('Keep current route');
    expect(result.reason).toMatch(/within one minute/);
    expect(result.reason).toMatch(/travel efficiency, not flood safety/);
  });

  it('does not recommend switching when both routes have reports or comparable metrics are missing', () => {
    expect(recommendComparedRoute({ verified_current_hazard_count: 1 }, { verified_current_hazard_count: 2 }, true).label).toBe('Insufficient evidence to recommend switching');
    const missing = recommendComparedRoute({}, {}, false);
    expect(missing.label).toBe('Insufficient evidence to recommend switching');
    expect(missing.reason).toMatch(/metrics are missing or tied/);
  });

  it('does not invent an alternative for a single route', () => {
    expect(recommendComparedRoute({ distance_m: 1000, duration_s: 300 }, null, false)).toEqual({
      label: 'Insufficient evidence to recommend switching',
      reason: 'Only one route is available, so there is no alternative to compare.',
    });
  });
});
