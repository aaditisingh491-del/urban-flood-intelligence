export type HourlyForecastSlot = {
  valid_at: string;
  precipitation_mm: number | null;
  precipitation_probability_percent: number | null;
};
export type AlertThresholds = { rainfallMm: number; probabilityPercent: number };
export type ForecastWindow = { startAt: string; endAt: string; rainfallMm: number; maxProbabilityPercent: number; thresholdTime: string };
export type Evaluation = { window: ForecastWindow | null; unavailableReason?: string };

export function evaluateSixHourThreshold(
  slots: HourlyForecastSlot[], thresholds: AlertThresholds, now = Date.now(),
): Evaluation {
  if (!Number.isFinite(thresholds.rainfallMm) || thresholds.rainfallMm < 0 ||
      !Number.isFinite(thresholds.probabilityPercent) || thresholds.probabilityPercent < 0 || thresholds.probabilityPercent > 100) {
    return { window: null, unavailableReason: 'Alert thresholds are invalid.' };
  }
  const ordered = slots.map(slot => ({ slot, time: Date.parse(slot.valid_at) }))
    .filter(item => Number.isFinite(item.time) && item.time >= now)
    .sort((a, b) => a.time - b.time);
  const six = ordered.slice(0, 6);
  if (six.length < 6 || six.some((item, index) => index > 0 && item.time - six[index - 1].time !== 60 * 60 * 1000)) {
    return { window: null, unavailableReason: 'Six consecutive hourly forecast values are not available.' };
  }
  if (six.some(({ slot }) => slot.precipitation_mm == null || !Number.isFinite(slot.precipitation_mm) || slot.precipitation_mm < 0)) {
    return { window: null, unavailableReason: 'Rainfall values are missing for part of the six-hour forecast interval.' };
  }
  const chances = six.map(({ slot }) => slot.precipitation_probability_percent)
    .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0 && value <= 100);
  if (!chances.length) return { window: null, unavailableReason: 'Precipitation probability is unavailable for the forecast interval.' };
  const rainfallMm = six.reduce((sum, item) => sum + item.slot.precipitation_mm!, 0);
  const maxProbabilityPercent = Math.max(...chances);
  if (rainfallMm < thresholds.rainfallMm || maxProbabilityPercent < thresholds.probabilityPercent) return { window: null };
  const triggerIndex = six.findIndex(({ slot }, index) => {
    const cumulativeRain = six.slice(0, index + 1).reduce((sum, item) => sum + item.slot.precipitation_mm!, 0);
    return cumulativeRain >= thresholds.rainfallMm && slot.precipitation_probability_percent != null &&
      slot.precipitation_probability_percent >= thresholds.probabilityPercent;
  });
  return { window: {
    startAt: six[0].slot.valid_at,
    endAt: six[5].slot.valid_at,
    rainfallMm: Math.round(rainfallMm * 10) / 10,
    maxProbabilityPercent,
    thresholdTime: six[Math.max(0, triggerIndex)].slot.valid_at,
  } };
}

export function forecastAlertId(locationId: string, startAt: string, thresholds: AlertThresholds): string {
  return `${locationId}|${startAt}|6h|${thresholds.rainfallMm}|${thresholds.probabilityPercent}`;
}

export function isForecastStale(fetchedAt: string, now = Date.now(), maxAgeMs = 60 * 60 * 1000): boolean {
  const timestamp = Date.parse(fetchedAt);
  return !Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000 || now - timestamp > maxAgeMs;
}

export async function requestAlertNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const permission = await Notification.requestPermission();
  return permission === 'granted' ? 'granted' : 'denied';
}
