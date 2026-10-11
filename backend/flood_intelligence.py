"""Flood-location inventory, optional DynamoDB storage, geocoding and routing.

The bundled KSRSAC layer is a vulnerability inventory, not a live incident feed.
Those records are intentionally never promoted to active road hazards.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
import time
import xml.etree.ElementTree as ET
from functools import lru_cache
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError, EndpointConnectionError, NoCredentialsError, NoRegionError, ProfileNotFound
from fastapi import HTTPException
from shapely.geometry import LineString, Point, shape
from shapely.ops import unary_union

KML_PATH = os.path.join(os.path.dirname(__file__), "data", "flood_prone_locations.kml")
DEFAULT_SERVICE_AREA_PATH = os.path.join(os.path.dirname(__file__), "data", "bengaluru-service-area.geojson")
SOURCE_URL = "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban"
OSRM_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
KML_NS = {"k": "http://www.opengis.net/kml/2.2"}
_OSRM_LOCK = threading.Lock()
_OSRM_LAST_REQUEST = 0.0


@lru_cache(maxsize=4)
def _read_service_area(area_path: str):
    """Load the configured Bengaluru polygon; used as a service-area, not a legal boundary claim."""
    with open(area_path, encoding="utf-8") as stream:
        data = json.load(stream)
    features = data.get("features", [])
    geometries = [shape(feature["geometry"]) for feature in features if feature.get("geometry")]
    if not geometries or any(not geometry.is_valid for geometry in geometries):
        raise RuntimeError("Configured Bengaluru service-area GeoJSON is empty or invalid")
    merged = unary_union(geometries)
    if merged.is_empty or not merged.is_valid:
        raise RuntimeError("Configured Bengaluru service-area geometry is invalid")
    return merged


def service_area_geometry(path: str | None = None):
    configured_path = os.path.abspath(path or os.getenv("BENGALURU_SERVICE_AREA_GEOJSON") or DEFAULT_SERVICE_AREA_PATH)
    return _read_service_area(configured_path)


def is_in_bengaluru(latitude: float, longitude: float) -> bool:
    """Validate coordinates against the configured polygon, including its boundary."""
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return False
    return service_area_geometry().covers(Point(longitude, latitude))


def service_area_path() -> str:
    return os.path.abspath(os.getenv("BENGALURU_SERVICE_AREA_GEOJSON") or DEFAULT_SERVICE_AREA_PATH)


def service_area_geojson() -> dict[str, Any]:
    with open(service_area_path(), encoding="utf-8") as stream:
        return json.load(stream)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_inventory(path: str = KML_PATH, now: str | None = None) -> list[dict[str, Any]]:
    """Normalize source-backed KSRSAC vulnerability points without implying incidents."""
    fetched_at = now or utc_now()
    root = ET.parse(path).getroot()
    records: list[dict[str, Any]] = []
    for mark in root.findall(".//k:Placemark", KML_NS):
        point = mark.find(".//k:Point/k:coordinates", KML_NS)
        if point is None or not point.text:
            continue
        try:
            longitude, latitude = (float(v) for v in point.text.strip().split(",")[:2])
        except (ValueError, TypeError):
            continue
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue
        if not is_in_bengaluru(latitude, longitude):
            continue
        values = {item.attrib.get("name"): (item.text or "").strip()
                  for item in mark.findall(".//k:SimpleData", KML_NS)}
        name = values.get("LocationName") or mark.findtext("k:name", default="", namespaces=KML_NS).strip()
        if not name:
            continue
        source_id = values.get("KGISFVLID") or values.get("OBJECTID") or mark.attrib.get("id")
        identity = str(source_id) if source_id is not None else f"{name.casefold()}:{latitude:.6f}:{longitude:.6f}"
        stable_id = "ksrsac-" + hashlib.sha256(identity.encode()).hexdigest()[:20]
        records.append({
            "location_id": stable_id, "location_name": name, "city": "Bengaluru",
            "state": "Karnataka", "country": "India", "latitude": latitude,
            "area": values.get("WARD_NAME") or None, "ward_number": values.get("WARDNO") or None,
            "ward_name": values.get("WARD_NAME") or None, "zone": values.get("ZONE") or None,
            "longitude": longitude, "event_type": "exposure_location",
            "severity": None, "status": "unverified", "confidence": "low",
            "source_name": "KSRSAC via OpenCity", "source_url": SOURCE_URL,
            "source_record_id": str(source_id) if source_id is not None else None,
            "observed_at": None, "fetched_at": fetched_at, "last_verified_at": None,
            "expires_at": None, "rainfall_mm": None, "rainfall_interval": None,
            "water_level": None, "data_type": "static_vulnerability_inventory",
            "description": "Mapped flood-vulnerable location; not a current flood report or road closure.",
        })
    return records


class FloodStore:
    """Paginated DynamoDB scans with clearly marked local KML fallback."""

    def __init__(self) -> None:
        self.table_name = os.getenv("DYNAMODB_FLOOD_TABLE", "").strip()
        self.region = (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "").strip()

    @property
    def configured(self) -> bool:
        return bool(self.table_name)

    def list_records(self) -> tuple[list[dict[str, Any]], str]:
        if not self.configured:
            return load_inventory(), "local_kml"
        try:
            table = self._table()
            self._validate_schema(table)
            result: list[dict[str, Any]] = []
            args: dict[str, Any] = {}
            while True:
                response = table.scan(**args)
                result.extend(response.get("Items", []))
                if not response.get("LastEvaluatedKey"):
                    break
                args["ExclusiveStartKey"] = response["LastEvaluatedKey"]
            return result, "dynamodb"
        except Exception as exc:
            raise self._friendly_error(exc, "DynamoDB flood records are unavailable") from exc

    def upsert_records(self, records: list[dict[str, Any]]) -> int:
        if not self.configured:
            raise RuntimeError("DYNAMODB_FLOOD_TABLE is not configured; no AWS write was made")
        written = 0
        try:
            table = self._table()
            self._validate_schema(table)
            with table.batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
                ingestion_time = utc_now()
                for record in records:
                    item = _dynamodb_values({**record, "ingested_at": ingestion_time})
                    item["PK"] = f"FLOOD#{record['location_id']}"
                    stable_event = record.get("source_record_id") or record.get("observed_at") or record["location_id"]
                    item["SK"] = f"RECORD#{record.get('event_type', 'exposure_location')}#{stable_event}"
                    batch.put_item(Item=item)
                    written += 1
        except Exception as exc:
            raise self._friendly_error(exc, "DynamoDB flood record write failed") from exc
        return written

    def _table(self):
        if not self.table_name:
            raise RuntimeError("DYNAMODB_FLOOD_TABLE is required")
        if not self.region:
            raise RuntimeError("AWS_REGION (or AWS_DEFAULT_REGION) is required for DynamoDB mode")
        return boto3.resource("dynamodb", region_name=self.region).Table(self.table_name)

    @staticmethod
    def _validate_schema(table) -> None:
        description = table.meta.client.describe_table(TableName=table.name)["Table"]
        schema = description["KeySchema"]
        actual = {(item["AttributeName"], item["KeyType"]) for item in schema}
        if actual != {("PK", "HASH"), ("SK", "RANGE")}:
            raise RuntimeError("DynamoDB flood table schema mismatch: expected PK (partition key) and SK (sort key), both String")
        types = {item["AttributeName"]: item["AttributeType"] for item in description["AttributeDefinitions"]}
        if types.get("PK") != "S" or types.get("SK") != "S":
            raise RuntimeError("DynamoDB flood table schema mismatch: PK and SK must both be String attributes")

    @staticmethod
    def _friendly_error(exc: Exception, context: str) -> RuntimeError:
        if isinstance(exc, RuntimeError):
            return exc
        if isinstance(exc, (NoCredentialsError, ProfileNotFound)):
            return RuntimeError("AWS credentials are unavailable; configure an AWS profile or IAM role")
        if isinstance(exc, NoRegionError):
            return RuntimeError("AWS_REGION (or AWS_DEFAULT_REGION) is required for DynamoDB mode")
        if isinstance(exc, EndpointConnectionError):
            return RuntimeError("Could not reach DynamoDB in the configured AWS_REGION; verify the region and network")
        if isinstance(exc, ClientError):
            code = exc.response.get("Error", {}).get("Code", "ClientError")
            if code == "ResourceNotFoundException":
                return RuntimeError("DynamoDB flood table was not found in the configured region")
            if code == "ValidationException":
                return RuntimeError("DynamoDB request was rejected; verify the table key schema is PK/SK")
            return RuntimeError(f"{context} (AWS error: {code})")
        return RuntimeError(f"{context} ({type(exc).__name__})")


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _dynamodb_values(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: _dynamodb_values(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_dynamodb_values(item) for item in value]
    return value


def verified_active_records(records: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Select only fresh, verified active observed floods and official alerts."""
    current = now or datetime.now(timezone.utc)
    active = []
    for record in records:
        if (record.get("status") != "active" or record.get("confidence") not in {"high", "verified"}
                or record.get("event_type") not in {"observed_flood", "official_flood_alert"}):
            continue
        verified = record.get("last_verified_at") or record.get("observed_at")
        try:
            timestamp = datetime.fromisoformat(verified.replace("Z", "+00:00"))
            if timestamp.tzinfo is None or (current - timestamp).total_seconds() > 24 * 3600:
                continue
            if record.get("observed_at"):
                observed = datetime.fromisoformat(record["observed_at"].replace("Z", "+00:00"))
                if observed.tzinfo is None or (current - observed).total_seconds() > 24 * 3600:
                    continue
            if record.get("expires_at") and datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00")) < current:
                continue
        except (AttributeError, ValueError):
            continue
        active.append(record)
    return active


def geocode(query: str) -> list[dict[str, Any]]:
    try:
        response = httpx.get(GEOCODING_URL, params={"name": query, "count": 6, "language": "en", "format": "json"}, timeout=8)
        response.raise_for_status()
        results = [{"name": f"{p['name']}, {p.get('admin1', '')}, {p.get('country', '')}".strip(", "),
                 "latitude": float(p["latitude"]), "longitude": float(p["longitude"]),
                 "country": p.get("country"), "admin1": p.get("admin1")}
                for p in response.json().get("results", [])]
        return [result for result in results if is_in_bengaluru(result["latitude"], result["longitude"])]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Geocoding service is unavailable") from exc


def _route(origin: dict[str, float], destination: dict[str, float], mode: str) -> list[dict[str, Any]]:
    profile = {"driving": "driving", "walking": "walking", "cycling": "cycling"}[mode]
    coordinates = f"{origin['longitude']},{origin['latitude']};{destination['longitude']},{destination['latitude']}"
    try:
        global _OSRM_LAST_REQUEST
        with _OSRM_LOCK:
            wait = 1.05 - (time.monotonic() - _OSRM_LAST_REQUEST)
            if wait > 0:
                time.sleep(wait)
            response = httpx.get(f"{OSRM_URL}/route/v1/{profile}/{coordinates}",
                                 params={"alternatives": "true", "overview": "full", "geometries": "geojson", "steps": "true"},
                                 headers={"User-Agent": "UrbanFloodIntelligence/0.1 (risk-aware route demo)"}, timeout=12)
            _OSRM_LAST_REQUEST = time.monotonic()
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="The routing provider is rate limiting requests. Wait briefly and retry.")
        response.raise_for_status()
        try:
            payload = response.json()
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="The routing provider returned malformed JSON. Please retry.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail="The routing provider returned an invalid route response. Please retry.")
        if payload.get("code") in {"NoRoute", "NoSegment"}:
            return []
        if payload.get("code") != "Ok":
            raise HTTPException(status_code=502, detail="The routing provider could not calculate this route. Please retry.")
        routes = payload.get("routes")
        if not isinstance(routes, list):
            raise HTTPException(status_code=502, detail="The routing provider returned an invalid route list. Please retry.")
        return routes
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="The routing provider timed out. Please retry.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=503, detail="The routing provider is temporarily unavailable. Please retry.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="The routing provider is unavailable. Please retry.") from exc


def _project_bengaluru(lon: float, lat: float) -> tuple[float, float]:
    # Local metric approximation adequate for checking this city-sized service area.
    return lon * 111_320 * math.cos(math.radians(12.95)), lat * 111_320


def validate_route_candidate(route: dict[str, Any], origin: dict[str, float], destination: dict[str, float]) -> bool:
    """Reject malformed, misordered, endpoint-disconnected, or clearly out-of-area provider geometry."""
    try:
        geometry = route["geometry"]
        coords = geometry["coordinates"]
        distance = float(route["distance"]) if route.get("distance") is not None else None
        duration = float(route["duration"]) if route.get("duration") is not None else None
        if geometry.get("type") != "LineString" or len(coords) < 2:
            return False
        if ((distance is not None and (not math.isfinite(distance) or distance < 0))
                or (duration is not None and (not math.isfinite(duration) or duration < 0))):
            return False
        points = []
        for pair in coords:
            lon, lat = float(pair[0]), float(pair[1])
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                return False
            points.append((lon, lat))
        # OSRM accepts lon,lat and its geometry is GeoJSON lon,lat. Catch lat/lon swaps.
        snap_limit = max(500, min(20_000, int(os.getenv("BENGALURU_ROUTE_SNAP_TOLERANCE_METERS", "5000"))))
        if distance_m(origin["latitude"], origin["longitude"], points[0][1], points[0][0]) > snap_limit:
            return False
        if distance_m(destination["latitude"], destination["longitude"], points[-1][1], points[-1][0]) > snap_limit:
            return False
        projected = [_project_bengaluru(lon, lat) for lon, lat in points]
        road = LineString(projected)
        area = service_area_geometry().simplify(0.00001, preserve_topology=True)
        from shapely.ops import transform
        projected_area = transform(lambda x, y, z=None: _project_bengaluru(x, y), area)
        tolerance = max(0, min(5000, int(os.getenv("BENGALURU_ROUTE_BOUNDARY_TOLERANCE_METERS", "1000"))))
        return projected_area.buffer(tolerance).covers(road)
    except (KeyError, TypeError, ValueError, IndexError, OverflowError):
        return False


def alternate_route(body: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    mode = body.get("travel_mode", "driving")
    if mode not in {"driving", "walking", "cycling"}:
        raise HTTPException(status_code=422, detail="travel_mode must be driving, walking, or cycling")
    for field in ("origin", "destination"):
        point = body[field]
        if not is_in_bengaluru(float(point["latitude"]), float(point["longitude"])):
            raise HTTPException(status_code=422, detail=f"{field.capitalize()} must be within Bengaluru.")
    returned_routes = _route(body["origin"], body["destination"], mode)
    if not returned_routes:
        raise HTTPException(status_code=404, detail="The routing provider found no route for these Bengaluru locations. Please adjust the source or retry.")
    valid_routes = [route for route in returned_routes if validate_route_candidate(route, body["origin"], body["destination"])]
    rejected_geometry_count = len(returned_routes) - len(valid_routes)
    if not valid_routes:
        raise HTTPException(status_code=502, detail="The routing provider returned invalid geometry or a route outside the Bengaluru service area. Please retry.")

    # Remove duplicate geometries before presenting alternatives. The primary provider
    # order is retained; OSRM can legitimately return fewer than three candidates.
    routes: list[dict[str, Any]] = []
    seen_geometry: set[tuple[tuple[float, float], ...]] = set()
    for candidate in valid_routes:
        key = tuple((round(float(point[0]), 5), round(float(point[1]), 5))
                    for point in candidate["geometry"]["coordinates"])
        if key not in seen_geometry:
            seen_geometry.add(key)
            routes.append(candidate)
    routes = routes[:3]

    # Only fresh, explicitly verified active incident/alert points are considered
    # current hazards. Static vulnerability inventory is shown as route context.
    active = verified_active_records(records)
    known_active_ids = {id(item) for item in active}
    stale_or_unverified_incident_count = sum(
        1 for record in records
        if record.get("event_type") in {"observed_flood", "official_flood_alert"}
        and id(record) not in known_active_ids
    )
    hazard_buffer_m = max(100, min(5000, int(os.getenv("FLOOD_HAZARD_BUFFER_METERS", "500"))))
    context_buffer_m = max(100, min(5000, int(os.getenv("FLOOD_INVENTORY_CONTEXT_BUFFER_METERS", "500"))))

    def route_line_meters(route: dict[str, Any]) -> LineString:
        coords = route["geometry"]["coordinates"]
        return LineString([_project_bengaluru(float(lon), float(lat)) for lon, lat, *_ in coords])

    def nearby(route: dict[str, Any], source_records: list[dict[str, Any]], radius_m: int) -> list[dict[str, Any]]:
        road = route_line_meters(route)
        hits = []
        for record in source_records:
            try:
                point = Point(_project_bengaluru(float(record["longitude"]), float(record["latitude"])))
                if road.distance(point) <= radius_m:
                    hits.append(record)
            except (KeyError, TypeError, ValueError):
                continue
        return hits

    evaluated = []
    for index, route in enumerate(routes):
        verified_hits = nearby(route, active, hazard_buffer_m)
        inventory_hits = nearby(route, [r for r in records if r.get("event_type") == "exposure_location"], context_buffer_m)
        evaluated.append({"route": route, "index": index, "hazards": verified_hits, "inventory": inventory_hits})

    viable = [item for item in evaluated if not item["hazards"]]
    def provider_duration(item: dict[str, Any]) -> float:
        try:
            value = float(item["route"].get("duration"))
            return value if math.isfinite(value) and value >= 0 else float("inf")
        except (TypeError, ValueError):
            return float("inf")
    recommendation = min(viable, key=provider_duration) if viable else None
    primary = routes[0]
    selected = recommendation["route"] if recommendation else primary
    primary_hazards = next(item["hazards"] for item in evaluated if item["route"] is primary)
    candidate_options = []

    def route_label(route: dict[str, Any], index: int) -> str:
        names: list[str] = []
        for segment in route.get("legs", []) if isinstance(route.get("legs"), list) else []:
            for step in segment.get("steps", []) if isinstance(segment, dict) and isinstance(segment.get("steps"), list) else []:
                if not isinstance(step, dict):
                    continue
                road = step.get("name") or step.get("ref")
                if isinstance(road, str) and road.strip() and road.strip() not in names:
                    names.append(road.strip())
        if names:
            return f"Via {names[0]}"
        return f"Route {chr(ord('A') + index)}"

    for item in evaluated:
        route = item["route"]
        is_recommended = recommendation is item and len(evaluated) > 1
        if len(evaluated) == 1 and recommendation is item:
            reason = "Only route returned by the routing provider; alternatives could not be compared."
        elif is_recommended and active and math.isfinite(provider_duration(item)):
            best_duration = provider_duration(item)
            tied = sum(provider_duration(candidate) == best_duration for candidate in viable) > 1
            reason = ("Selected by provider order among routes with equal estimated travel time; it avoids mapped fresh verified incident points." if tied else
                      "Shortest estimated travel time among candidates outside mapped fresh verified incident buffers.")
        elif is_recommended and active:
            reason = "Selected by provider order among candidates outside mapped fresh verified incident buffers; travel time is unavailable."
        elif is_recommended and math.isfinite(provider_duration(item)):
            best_duration = provider_duration(item)
            tied = sum(provider_duration(candidate) == best_duration for candidate in evaluated) > 1
            reason = ("Selected by provider order; available travel times are equal." if tied else
                      "Lowest estimated travel time among available candidates.")
        elif is_recommended:
            reason = "Selected by provider order; travel time is unavailable."
        elif item["hazards"]:
            reason = "This candidate passes within the configured screening buffer of a fresh verified flood report. Avoid relying on it without checking official road guidance."
        else:
            reason = "Available routing-provider alternative. No road-level safety verification is available."
        candidate_options.append({
            "route_id": f"route-{item['index'] + 1}",
            "label": route_label(route, item["index"]),
            "geometry": route["geometry"],
            "distance_m": route.get("distance"),
            "duration_s": route.get("duration"),
            "recommended": is_recommended,
            "recommendation_reason": reason,
            "verified_current_hazard_count": len(item["hazards"]),
            "verified_current_hazards": [{"location_name": h.get("location_name"), "source_name": h.get("source_name"),
                                           "source_url": h.get("source_url"), "last_verified_at": h.get("last_verified_at")}
                                          for h in item["hazards"]],
            "nearby_vulnerability_count": len(item["inventory"]),
            "nearby_vulnerability_locations": [{"location_name": h.get("location_name"), "source_name": h.get("source_name"),
                                                 "source_url": h.get("source_url")}
                                                for h in item["inventory"][:5]],
            "route_evidence": "Fresh verified report screening uses configured point buffers; nearby inventory points are historical/static context only.",
        })

    rejected = [{"distance_m": item["route"].get("distance"), "duration_s": item["route"].get("duration"),
                 "reason": "Intersects configured buffer around a fresh verified flood hazard.",
                 "hazard_locations": [h.get("location_name") for h in item["hazards"]]}
                for item in evaluated if item["hazards"]]
    warnings = ["Vulnerability inventory locations are static context and are not current flood incidents or road closures.",
                f"Verified incident points use a {hazard_buffer_m} m screening buffer; this is not road-level closure data.",
                "Weather forecasts describe destination-area weather, not conditions along each road segment.",
                "No verified shelter or road-accessible safe-point dataset is configured.",
                "No fresh verified flood reports were available for this request; absence of reports does not establish safety." if not active else "Mapped verified flood coverage may be incomplete; check official road and emergency updates.",
                f"{stale_or_unverified_incident_count} stale or unverified flood/alert record(s) were excluded from active hazard screening." if stale_or_unverified_incident_count else "No stale or unverified flood/alert records were present.",
                f"{rejected_geometry_count} route candidate(s) were rejected because their geometry or endpoints were invalid/outside the Bengaluru service area." if rejected_geometry_count else "All returned route geometries passed Bengaluru-area and endpoint checks."]
    return {
        "original_route": {"geometry": primary["geometry"], "distance_m": primary.get("distance"), "duration_s": primary.get("duration")},
        "recommended_route": ({"geometry": recommendation["route"]["geometry"],
                               "distance_m": recommendation["route"].get("distance"),
                               "duration_s": recommendation["route"].get("duration"),
                               "route_id": f"route-{recommendation['index'] + 1}"} if recommendation else None),
        "route_options": candidate_options,
        "fresh_verified_reports_available": bool(active),
        "selected_route_id": f"route-{recommendation['index'] + 1}" if recommendation else "route-1",
        "distance_m": selected.get("distance"), "duration_s": selected.get("duration"),
        "alternatives_considered": len(candidate_options), "hazards_avoided": max(0, len(primary_hazards) - (len(recommendation["hazards"]) if recommendation else len(primary_hazards))),
        "rejected_routes": len(rejected), "rejected_route_reasons": rejected,
        "hazard_proximity_warnings": [{"location_name": r.get("location_name"), "source_name": r.get("source_name"),
                                        "source_url": r.get("source_url")} for r in (recommendation["hazards"] if recommendation else primary_hazards)],
        "nearby_alternatives": [], "safe_route_verified": False,
        "message": ("A recommended candidate avoids the mapped fresh verified flood points, but road conditions are not verified and this is not a safety guarantee."
                    if recommendation and active else "Routes are shown as provider options, but no fresh verified flood data is available to determine road safety. Follow official emergency guidance."),
        "warnings": warnings, "data_source": "OSRM / OpenStreetMap", "data_fetched_at": utc_now(),
    }
