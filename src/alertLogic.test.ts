import { describe, expect, it, vi } from 'vitest';
import { evaluateSixHourThreshold, forecastAlertId, isForecastStale, requestAlertNotificationPermission, type HourlyForecastSlot } from './alertLogic';

function sixSlots(values: Partial<HourlyForecastSlot> = {}): HourlyForecastSlot[] {
  const start = Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000;
  return Array.from({ length: 6 }, (_, index) => ({ valid_at: new Date(start + index * 3_600_000).toISOString(), precipitation_mm: 2, precipitation_probability_percent: 65, ...values }));
}

describe('forecast alert thresholds', () => {
  it('sums six hourly millimetre values and uses available interval probability', () => {
    const result = evaluateSixHourThreshold(sixSlots(), { rainfallMm: 10, probabilityPercent: 60 });
    expect(result.window).toMatchObject({ rainfallMm: 12, maxProbabilityPercent: 65 });
    expect(result.window?.startAt).toBeTruthy();
    expect(result.window?.thresholdTime).toBeTruthy();
  });

  it('does not treat missing weather fields as zero or make a decision with an incomplete interval', () => {
    expect(evaluateSixHourThreshold(sixSlots({ precipitation_mm: null }), { rainfallMm: 0, probabilityPercent: 0 }).unavailableReason).toMatch(/rainfall values are missing/i);
    expect(evaluateSixHourThreshold(sixSlots({ precipitation_probability_percent: null }), { rainfallMm: 0, probabilityPercent: 0 }).unavailableReason).toMatch(/probability is unavailable/i);
    expect(evaluateSixHourThreshold(sixSlots().slice(0, 5), { rainfallMm: 1, probabilityPercent: 1 }).unavailableReason).toMatch(/six consecutive hourly/i);
  });

  it('returns no alert when a valid interval does not meet both configured thresholds', () => {
    expect(evaluateSixHourThreshold(sixSlots(), { rainfallMm: 13, probabilityPercent: 60 }).window).toBeNull();
    expect(evaluateSixHourThreshold(sixSlots(), { rainfallMm: 10, probabilityPercent: 70 }).window).toBeNull();
  });

  it('creates a deterministic deduplication key for location, forecast period, and thresholds', () => {
    const thresholds = { rainfallMm: 10, probabilityPercent: 60 };
    const id = forecastAlertId('saved-1', '2026-10-11T13:00:00+05:30', thresholds);
    expect(forecastAlertId('saved-1', '2026-10-11T13:00:00+05:30', thresholds)).toBe(id);
    expect(forecastAlertId('saved-2', '2026-10-11T13:00:00+05:30', thresholds)).not.toBe(id);
  });

  it('identifies stale and invalid timestamps without treating them as current', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    expect(isForecastStale('2026-10-11T10:00:00Z', now)).toBe(true);
    expect(isForecastStale('2026-10-11T11:30:00Z', now)).toBe(false);
    expect(isForecastStale('bad timestamp', now)).toBe(true);
  });

  it('requests browser notification permission only through the explicit helper call and handles all states', async () => {
    const mock = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') };
    vi.stubGlobal('Notification', mock);
    expect(await requestAlertNotificationPermission()).toBe('granted');
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    mock.permission = 'denied';
    expect(await requestAlertNotificationPermission()).toBe('denied');
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    expect(await requestAlertNotificationPermission()).toBe('unsupported');
  });
});
