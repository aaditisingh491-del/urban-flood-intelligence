
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.weather_service import get_weather_data
from backend.gis_service import get_elevation
from backend.risk_model import calculate_flood_risk


app = FastAPI(
    title="Urban Flood Intelligence API",
    version="0.2.0",
)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Scenario(BaseModel):
    rainfall_delta: float = 0
    drainage_delta: float = 0
    start_shift: int = 0


@app.get("/api/risk")
def risk():
    try:
        # 1. Get live weather and rainfall forecast
        weather = get_weather_data()

        # 2. Demo coordinates for Bengaluru
        latitude = 12.9352
        longitude = 77.6245

        # 3. Get elevation for these coordinates
        terrain = get_elevation(latitude, longitude)

        # 4. Calculate provisional risk score
        assessment = calculate_flood_risk(
            rainfall_6h_mm=weather["rainfall_forecast_6h_mm"],
            chance_of_rain=weather["chance_of_rain"],
            elevation_m=terrain["elevation_m"],
            drainage_condition="moderate",
        )

        return {
            "location": weather["location"],
            "risk": assessment["risk"],
            "level": assessment["level"],
            "peak_time": weather["peak_time"],
            "rainfall": weather["rainfall"],
            "rainfall_forecast_6h_mm": (
                weather["rainfall_forecast_6h_mm"]
            ),
            "chance_of_rain": weather["chance_of_rain"],
            "elevation_m": terrain["elevation_m"],
            "coordinates": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "confidence": "LOW",
            "data_source": {
                "weather": weather["data_source"],
                "elevation": terrain["data_source"],
            },
            "model_status": assessment["model_status"],
            "warning": assessment["warning"],
        }

    except Exception:
        return {
            "risk": 0,
            "level": "UNAVAILABLE",
            "peak_time": "Unavailable",
            "rainfall": 0,
            "confidence": "LOW",
            "model_status": "UNAVAILABLE",
            "error": "Live risk assessment is currently unavailable.",
        }



@app.post("/api/simulate")
def simulate(s: Scenario):
    try:
        # Get the current risk from the same risk endpoint
        current = risk()

        if current.get("level") == "UNAVAILABLE":
            return {
                "error": "Current risk data is unavailable. Simulation cannot run."
            }

        current_risk = current["risk"]

        # Apply hypothetical scenario changes
        value = max(
            0,
            min(
                100,
                round(
                    current_risk
                    + s.rainfall_delta * 0.65
                    - s.drainage_delta * 0.45
                ),
            ),
        )

        if value >= 70:
            level = "HIGH"
        elif value >= 40:
            level = "MODERATE"
        else:
            level = "LOW"

        peak = (
            "5:00 PM"
            if s.start_shift < 0
            else "9:00 PM"
            if s.start_shift > 0
            else current.get("peak_time", "Unavailable")
        )

        return {
            "current_risk": current_risk,
            "scenario_risk": value,
            "scenario_level": level,
            "peak_time": peak,
            "model_status": "PROVISIONAL_UNCALIBRATED",
            "warning": (
                "Scenario changes use demonstration coefficients; "
                "they are not a validated hydrological simulation."
            ),
        }

    except Exception:
        return {
            "error": "Simulation is currently unavailable."
        }


@app.get("/api/hotspots")
def hotspots():
    demo_hotspots = [
        {"name": "Koramangala 5th Block", "risk": 91},
        {"name": "XYZ Junction", "risk": 87},
        {"name": "MG Road Underpass", "risk": 82},
        {"name": "ABC Layout", "risk": 79},
        {"name": "Lake Road", "risk": 74},
    ]

    results = []

    for hotspot in demo_hotspots:
        score = hotspot["risk"]

        if score >= 70:
            level = "HIGH"
        elif score >= 40:
            level = "MODERATE"
        else:
            level = "LOW"

        results.append({
            "name": hotspot["name"],
            "risk": score,
            "level": level,
            "data_status": "DEMO",
        })

    return {
        "hotspots": results,
        "model_status": "DEMO_DATA_NOT_LIVE",
        "warning": (
            "Hotspot scores are illustrative demo values, "
            "not measured or validated flood-risk estimates."
        ),
    }


