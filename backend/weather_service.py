
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

TIMEZONE = ZoneInfo("Asia/Kolkata")
DEFAULT_LOCATION = "Bengaluru"


def get_weather_data(location: str | None = None) -> dict:
    """Fetch Open-Meteo rainfall and forecast data without an API key."""

    city = location or DEFAULT_LOCATION
    latitude = 12.9716
    longitude = 77.5946
    display_location = DEFAULT_LOCATION

    with httpx.Client(timeout=20.0) as client:
        # Keep Bengaluru as the default; resolve other requested cities.
        if city.strip().lower() not in {
            "bengaluru", "bangalore", "bengaluru, india",
            "bangalore, india",
        }:
            geo_response = client.get(
                GEOCODING_URL,
                params={
                    "name": city,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
            )
            geo_response.raise_for_status()
            results = geo_response.json().get("results", [])

            if not results:
                raise ValueError(f"Location not found: {city}")

            place = results[0]
            latitude = place["latitude"]
            longitude = place["longitude"]
            display_location = place["name"]
        else:
            display_location = DEFAULT_LOCATION

        response = client.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "precipitation,rain,showers",
                "hourly": "precipitation,precipitation_probability",
                "forecast_hours": 24,
                "timezone": "Asia/Kolkata",
            },
        )
        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})
    hourly = data.get("hourly", {})

    model_time = datetime.fromisoformat(current["time"])
    times = hourly.get("time", [])
    rainfall = hourly.get("precipitation", [])
    probabilities = hourly.get("precipitation_probability", [])

    # Pair hourly values safely and select future forecast hours.
    hours = []
    for index, time_str in enumerate(times):
        hour_time = datetime.fromisoformat(time_str)
        rain_value = rainfall[index] if index < len(rainfall) else 0
        probability = (
            probabilities[index] if index < len(probabilities) else None
        )

        hours.append({
            "time": hour_time,
            "precip_mm": float(rain_value or 0),
            "chance_of_rain": probability,
        })

    next_6_hours = [
        hour for hour in hours
        if model_time < hour["time"] <= model_time + timedelta(hours=6)
    ]

    next_12_hours = [
        hour for hour in hours
        if model_time < hour["time"] <= model_time + timedelta(hours=12)
    ]

    rainfall_6h = round(
        sum(hour["precip_mm"] for hour in next_6_hours), 1
    )

    chance_of_rain = max(
        (
            hour["chance_of_rain"]
            for hour in next_6_hours
            if hour["chance_of_rain"] is not None
        ),
        default=0,
    )

    peak_hour = max(
        next_12_hours,
        key=lambda hour: hour["precip_mm"],
        default=None,
    )

    peak_time = "No significant rain forecast"
    if peak_hour and peak_hour["precip_mm"] > 0:
        peak_time = peak_hour["time"].strftime("%I:%M %p").lstrip("0")

    # Illustrative rainfall-only score; not a validated flood probability.
    risk_score = round(
        min(98, max(5, 10 + min(rainfall_6h, 40) * 1.5
                    + chance_of_rain * 0.2))
    )

    if risk_score >= 70:
        risk_level = "HIGH"
    elif risk_score >= 40:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    return {
        "location": display_location,
        "rainfall": round(float(current.get("precipitation") or 0), 1),
        "rainfall_forecast_6h_mm": rainfall_6h,
        "chance_of_rain": chance_of_rain,
        "risk": risk_score,
        "level": risk_level,
        "peak_time": peak_time,
        "confidence": "LOW",
        "data_source": "Open-Meteo",
        "model_status": "PROVISIONAL_RAINFALL_ONLY",
    }