
from datetime import datetime
from zoneinfo import ZoneInfo
from math import isfinite

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

TIMEZONE = ZoneInfo("Asia/Kolkata")


def get_destination_forecast(latitude: float, longitude: float) -> dict:
    """Fetch actual hourly forecast values for a caller-validated destination."""
    if not (isfinite(latitude) and isfinite(longitude) and -90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError("Forecast coordinates are invalid")
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "precipitation,precipitation_probability,temperature_2m,weather_code",
        "current": "precipitation,temperature_2m,weather_code",
        "forecast_days": 2,
        "timezone": "Asia/Kolkata",
    }
    response = httpx.get(OPEN_METEO_URL, params=params, timeout=12.0)
    response.raise_for_status()
    payload = response.json()
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    precipitation = hourly.get("precipitation") or []
    probability = hourly.get("precipitation_probability") or []
    temperature = hourly.get("temperature_2m") or []
    weather_codes = hourly.get("weather_code") or []
    slots = []
    for index, local_time in enumerate(times):
        try:
            parsed = datetime.fromisoformat(local_time).replace(tzinfo=TIMEZONE)
        except (TypeError, ValueError):
            continue
        if parsed < datetime.now(TIMEZONE).replace(minute=0, second=0, microsecond=0):
            continue
        def value(values, key):
            result = values[index] if index < len(values) else None
            return float(result) if result is not None and isfinite(float(result)) else None
        slots.append({
            "valid_at": parsed.isoformat(),
            "precipitation_mm": value(precipitation, "precipitation"),
            "precipitation_probability_percent": value(probability, "probability"),
            "temperature_c": value(temperature, "temperature"),
            "weather_code": int(weather_codes[index]) if index < len(weather_codes) and weather_codes[index] is not None else None,
        })
    units = payload.get("hourly_units") or {}
    return {
        "provider": "Open-Meteo",
        "attribution": "Weather data by Open-Meteo.com",
        "timezone": payload.get("timezone", "Asia/Kolkata"),
        "generated_at": datetime.now(TIMEZONE).isoformat(),
        "provider_generation_time_ms": payload.get("generationtime_ms"),
        "units": {
            "precipitation": units.get("precipitation", "mm"),
            "precipitation_probability": units.get("precipitation_probability", "%"),
            "temperature": units.get("temperature_2m", "°C"),
        },
        "slots": slots,
    }
