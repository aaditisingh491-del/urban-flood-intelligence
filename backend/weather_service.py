
import os
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load the key from backend/.env
load_dotenv(Path(__file__).with_name(".env"))

WEATHER_API_URL = "https://api.weatherapi.com/v1/forecast.json"


def get_weather_data(location: str | None = None) -> dict:
    """Fetch live weather and short-term rainfall forecast."""

    api_key = os.getenv("WEATHERAPI_KEY")
    if not api_key:
        raise RuntimeError("WEATHERAPI_KEY is not configured.")

    city = location or os.getenv("WEATHERAPI_LOCATION", "Bengaluru")

    response = httpx.get(
        WEATHER_API_URL,
        params={
            "key": api_key,
            "q": city,
            "days": 2,
            "aqi": "no",
            "alerts": "no",
        },
        timeout=8.0,
    )
    response.raise_for_status()
    data = response.json()

    current = data["current"]
    forecast_days = data["forecast"]["forecastday"]
    local_time = datetime.fromisoformat(data["location"]["localtime"])

    hours = [
        hour
        for day in forecast_days
        for hour in day["hour"]
    ]

    next_6_hours = [
        hour
        for hour in hours
        if local_time < datetime.fromisoformat(hour["time"])
        <= local_time + timedelta(hours=6)
    ]

    next_12_hours = [
        hour
        for hour in hours
        if local_time < datetime.fromisoformat(hour["time"])
        <= local_time + timedelta(hours=12)
    ]

    rainfall_6h = round(
        sum(hour["precip_mm"] for hour in next_6_hours), 1
    )
    chance_of_rain = max(
        (hour["chance_of_rain"] for hour in next_6_hours),
        default=0,
    )

    peak_hour = max(
        next_12_hours,
        key=lambda hour: hour["precip_mm"],
        default=None,
    )

    peak_time = "No significant rain forecast"
    if peak_hour and peak_hour["precip_mm"] > 0:
        peak_time = datetime.fromisoformat(
            peak_hour["time"]
        ).strftime("%I:%M %p").lstrip("0")

    # Provisional rainfall-only score, not a validated flood model.
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
        "location": data["location"]["name"],
        "rainfall": round(current["precip_mm"], 1),
        "rainfall_forecast_6h_mm": rainfall_6h,
        "chance_of_rain": chance_of_rain,
        "risk": risk_score,
        "level": risk_level,
        "peak_time": peak_time,
        "confidence": "LOW",
        "data_source": "WeatherAPI",
        "model_status": "PROVISIONAL_RAINFALL_ONLY",
    }