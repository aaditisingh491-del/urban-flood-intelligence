
import os
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from backend.weather_service import get_destination_forecast
from backend.risk_model import calculate_flood_risk
from backend.flood_intelligence import FloodStore, alternate_route, geocode, is_in_bengaluru, service_area_geojson, verified_active_records, distance_m


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


class ProviderRateLimitMiddleware(BaseHTTPMiddleware):
    """Keep public geocoding and routing integrations within demo quotas."""
    def __init__(self, app, limit: int = 30, window_seconds: int = 60):
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = {}

    async def dispatch(self, request, call_next):
        if request.url.path not in {"/api/geocode", "/api/routes/alternate", "/api/locations/forecast"} and not request.url.path.endswith("/assessment"):
            return await call_next(request)
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        recent = [stamp for stamp in self.requests.get(key, []) if now - stamp < self.window_seconds]
        if len(recent) >= self.limit:
            return JSONResponse(status_code=429, content={"detail": "Provider request limit reached; try again shortly."})
        recent.append(now)
        self.requests[key] = recent
        return await call_next(request)


app.add_middleware(ProviderRateLimitMiddleware)


class Scenario(BaseModel):
    rainfall_delta: float = 0
    drainage_delta: float = 0
    start_shift: int = 0


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    model_config = ConfigDict(extra="forbid")


class AlternateRouteRequest(BaseModel):
    origin: Coordinates
    destination_location_id: str = Field(min_length=1, max_length=200)
    travel_mode: str = "driving"
    model_config = ConfigDict(extra="forbid")


@app.get("/api/risk")
def risk():
    raise HTTPException(status_code=410, detail="Generic city-wide risk scores are no longer served. Select a Bengaluru inventory destination for a location-specific assessment.")


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
    return {"hotspots": [], "model_status": "NO_VERIFIED_HOTSPOT_SCORES",
            "warning": "No independently verified, location-specific hotspot scores are available."}


@app.get("/health")
def health():
    store = FloodStore()
    if not store.configured:
        return {"status": "ok", "flood_store": "local_kml"}
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError
        boto3.resource("dynamodb", region_name=store.region).Table(store.table_name).meta.client.describe_table(TableName=store.table_name)
    except (BotoCoreError, ClientError):
        raise HTTPException(status_code=503, detail="Configured flood storage is unavailable") from None
    return {"status": "ok", "flood_store": "dynamodb"}


@app.get("/api/geocode")
def search_places(q: str = Query(min_length=2, max_length=120)):
    results = geocode(q)
    return {"results": results,
            "message": None if results else "Please select a location within Bengaluru. No matching result was inside the supported service area."}


@app.get("/api/service-area")
def get_service_area():
    return service_area_geojson()


@app.post("/api/locations/validate")
def validate_location(coordinates: Coordinates):
    if not is_in_bengaluru(coordinates.latitude, coordinates.longitude):
        raise HTTPException(status_code=422, detail="Please select a location within Bengaluru.")
    return {"valid": True, "latitude": coordinates.latitude, "longitude": coordinates.longitude,
            "service_area": "Bengaluru, Karnataka, India"}


@app.get("/api/locations/forecast")
def location_forecast(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)):
    """Return real hourly Open-Meteo data only for a point in the supported Bengaluru area."""
    if not is_in_bengaluru(latitude, longitude):
        raise HTTPException(status_code=422, detail="Forecast locations must be within Bengaluru.")
    try:
        forecast = get_destination_forecast(latitude, longitude)
    except Exception:
        raise HTTPException(status_code=502, detail="Open-Meteo forecast is unavailable for this location. Retry later.") from None
    return {"latitude": latitude, "longitude": longitude, "forecast": forecast}


@app.get("/api/floods")
def floods(city: str | None = None, state: str | None = None,
           event_type: str | None = None, severity: str | None = None,
           status: str | None = None, source: str | None = None,
           q: str | None = Query(default=None, max_length=120),
           observed_after: datetime | None = None,
           observed_before: datetime | None = None,
           sort_by: str = Query(default="location_name", pattern="^(location_name|city|state|event_type|status)$"),
           order: str = Query(default="asc", pattern="^(asc|desc)$"),
           page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100)):
    if observed_after and observed_before and observed_after > observed_before:
        raise HTTPException(status_code=422, detail="observed_after must be earlier than observed_before")
    if observed_after and observed_after.tzinfo is None:
        observed_after = observed_after.replace(tzinfo=timezone.utc)
    if observed_before and observed_before.tzinfo is None:
        observed_before = observed_before.replace(tzinfo=timezone.utc)
    try:
        records, storage = FloodStore().list_records()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    records = [record for record in records if _record_in_service_area(record)]
    filters = {"city": city, "state": state, "event_type": event_type,
               "severity": severity, "status": status, "source_name": source}
    for key, value in filters.items():
        if value:
            records = [r for r in records if str(r.get(key, "")).casefold() == value.casefold()]
    if q:
        needle = q.casefold()
        records = [r for r in records if any(needle in str(r.get(key, "")).casefold()
                                             for key in ("location_name", "city", "state", "source_name"))]
    if observed_after or observed_before:
        def matches_observation(record):
            value = record.get("observed_at")
            if not value:
                return False
            observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=timezone.utc)
            return (not observed_after or observed >= observed_after) and (not observed_before or observed <= observed_before)
        records = [r for r in records if matches_observation(r)]
    records.sort(key=lambda r: str(r.get(sort_by) or "").casefold(), reverse=order == "desc")
    start = (page - 1) * page_size
    now = datetime.now(timezone.utc)
    for record in records:
        record["stale"] = bool(record.get("expires_at") and record["expires_at"] < now.isoformat())
    return {"records": records[start:start + page_size], "total": len(records),
            "page": page, "page_size": page_size,
            "storage_mode": storage, "fetched_at": now.isoformat().replace("+00:00", "Z"),
            "warning": "Vulnerability inventory locations are not active flood reports."}


@app.get("/api/floods/summary")
def flood_summary():
    try:
        records, storage = FloodStore().list_records()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    records = [record for record in records if _record_in_service_area(record)]
    count = lambda event: sum(r.get("event_type") == event for r in records)
    active = sum(r.get("event_type") == "observed_flood" for r in verified_active_records(records))
    current_active_ids = {r.get("location_id") for r in verified_active_records(records)}
    stale_or_unverified = sum(
        r.get("status") == "unverified"
        or (r.get("status") == "active" and r.get("event_type") in {"observed_flood", "official_flood_alert"}
            and r.get("location_id") not in current_active_ids)
        or bool(r.get("expires_at") and r["expires_at"] < utcnow())
        for r in records
    )
    return {"total_records": len(records), "active_verified_floods": active,
            "official_alerts": count("official_flood_alert"),
            "historical_records": count("historical_flood"),
            "rainfall_based_risks": count("rainfall_based_risk"),
            "exposure_inventory": count("exposure_location"),
            "stale_or_unverified": stale_or_unverified,
            "last_successful_ingestion": (max((r.get("ingested_at") or r.get("fetched_at", "") for r in records), default=None) if storage == "dynamodb" else None),
            "storage_mode": storage}


def utcnow():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _record_in_service_area(record):
    try:
        return is_in_bengaluru(float(record["latitude"]), float(record["longitude"]))
    except (KeyError, TypeError, ValueError):
        return False


@app.get("/api/floods/{location_id}/assessment")
def destination_assessment(location_id: str):
    """Build a destination-specific provisional score from actual weather inputs."""
    try:
        records, storage = FloodStore().list_records()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    destination = next((record for record in records
                        if record.get("location_id") == location_id
                        and record.get("event_type") == "exposure_location"
                        and _record_in_service_area(record)), None)
    if destination is None:
        raise HTTPException(status_code=404, detail="Destination is not in the Bengaluru vulnerability inventory.")

    active = verified_active_records(records)
    nearby_active = [record for record in active if distance_m(
        float(destination["latitude"]), float(destination["longitude"]),
        float(record["latitude"]), float(record["longitude"]),
    ) <= 1000]
    forecast = None
    forecast_error = None
    model = None
    try:
        forecast = get_destination_forecast(float(destination["latitude"]), float(destination["longitude"]))
        slots = forecast.get("slots", [])[:6]
        if slots:
            rainfall = sum(slot["precipitation_mm"] or 0 for slot in slots)
            probabilities = [slot["precipitation_probability_percent"] for slot in slots
                             if slot["precipitation_probability_percent"] is not None]
            if probabilities:
                model = calculate_flood_risk(rainfall, max(probabilities), drainage_condition="unknown")
                model["forecast_rainfall_6h_mm"] = round(rainfall, 1)
                model["forecast_max_precipitation_probability_percent"] = max(probabilities)
                model["forecast_valid_until"] = slots[-1]["valid_at"]
    except Exception:
        forecast_error = "Open-Meteo forecast is unavailable for this request."

    return {
        "location": {"location_id": destination["location_id"],
                     "location_name": destination["location_name"],
                     "city": destination.get("city"), "state": destination.get("state"),
                     "latitude": float(destination["latitude"]), "longitude": float(destination["longitude"]),
                     "inventory_status": destination.get("status"),
                     "inventory_confidence": destination.get("confidence"),
                     "inventory_source": destination.get("source_name"),
                     "inventory_source_url": destination.get("source_url"),
                     "inventory_fetched_at": destination.get("fetched_at")},
        "assessment_type": "inventory_vulnerability_with_weather_context",
        "current_verified_incidents_within_1km": len(nearby_active),
        "current_verified_incident_sources": [record.get("source_name") for record in nearby_active],
        "model_score": model.get("risk") if model else None,
        "model_category": model.get("level") if model else "UNAVAILABLE",
        "model_status": model.get("model_status") if model else "UNAVAILABLE",
        "model_warning": model.get("warning") if model else forecast_error or "Forecast hours are not available for a destination-specific estimate.",
        "data_source": "Open-Meteo forecast + source-backed KSRSAC vulnerability inventory",
        "storage_mode": storage,
        "assessed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "forecast": forecast,
        "forecast_error": forecast_error,
    }


@app.post("/api/routes/alternate")
def route_alternate(request: AlternateRouteRequest):
    if not is_in_bengaluru(request.origin.latitude, request.origin.longitude):
        raise HTTPException(status_code=422, detail="Origin must be within Bengaluru. Please select a location within Bengaluru.")
    try:
        records, _ = FloodStore().list_records()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    destination = next((record for record in records if record.get("location_id") == request.destination_location_id
                        and record.get("event_type") == "exposure_location" and _record_in_service_area(record)), None)
    if destination is None:
        raise HTTPException(status_code=422, detail="Destination must be selected from the available flood-prone inventory.")
    body = request.model_dump()
    body["destination"] = {"latitude": float(destination["latitude"]), "longitude": float(destination["longitude"])}
    result = alternate_route(body, records)
    result["destination"] = {"location_id": destination["location_id"], "location_name": destination["location_name"],
                             "city": destination.get("city"), "state": destination.get("state")}
    return result


