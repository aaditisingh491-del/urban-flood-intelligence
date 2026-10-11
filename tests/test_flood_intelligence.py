from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend import flood_intelligence as fi
from backend import main

client = TestClient(main.app)


def test_inventory_has_stable_source_backed_distinct_locations():
    first = fi.load_inventory(now="2026-01-01T00:00:00Z")
    again = fi.load_inventory(now="2026-01-02T00:00:00Z")
    assert len(first) >= 30
    assert len({r["location_id"] for r in first}) == len(first)
    assert first[0]["location_id"] == again[0]["location_id"]
    assert first[0]["event_type"] == "exposure_location"
    assert first[0]["status"] == "unverified"
    assert first[0]["observed_at"] is None
    assert first[0]["source_url"] == fi.SOURCE_URL
    assert first[0]["fetched_at"] == "2026-01-01T00:00:00Z"
    assert all(fi.is_in_bengaluru(row["latitude"], row["longitude"]) for row in first)


def test_service_area_accepts_bengaluru_and_rejects_delhi():
    assert fi.is_in_bengaluru(12.9716, 77.5946)
    assert not fi.is_in_bengaluru(28.6139, 77.2090)
    assert client.post("/api/locations/validate", json={"latitude": 12.9716, "longitude": 77.5946}).status_code == 200
    rejected = client.post("/api/locations/validate", json={"latitude": 28.6139, "longitude": 77.2090})
    assert rejected.status_code == 422
    assert "within Bengaluru" in rejected.json()["detail"]


def test_geocoder_filters_ambiguous_and_out_of_area_results(monkeypatch):
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"results": [{"name": "Ambiguous name", "latitude": 12.9716, "longitude": 77.5946, "admin1": "Karnataka", "country": "India"},
                                {"name": "Ambiguous name", "latitude": 28.6139, "longitude": 77.2090, "admin1": "Delhi", "country": "India"}]}
    monkeypatch.setattr(fi.httpx, "get", lambda *_a, **_k: Response())
    results = fi.geocode("Ambiguous name")
    assert len(results) == 1
    assert results[0]["latitude"] == 12.9716


def test_flood_api_paginates_and_summarizes_inventory(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    response = client.get("/api/floods?page=1&page_size=7&event_type=exposure_location")
    assert response.status_code == 200
    body = response.json()
    assert len(body["records"]) == 7
    assert body["total"] >= 30
    assert body["storage_mode"] == "local_kml"
    summary = client.get("/api/floods/summary").json()
    assert summary["active_verified_floods"] == 0
    assert summary["exposure_inventory"] >= 30


def test_missing_aws_configuration_never_claims_write(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    with pytest.raises(RuntimeError, match="no AWS write was made"):
        fi.FloodStore().upsert_records(fi.load_inventory()[:1])


def test_dynamodb_scan_paginates(monkeypatch):
    class Table:
        name = "floods"
        class Meta:
            class client:
                @staticmethod
                def describe_table(**kwargs):
                    return {"Table": {"KeySchema": [{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}], "AttributeDefinitions": [{"AttributeName": "PK", "AttributeType": "S"}, {"AttributeName": "SK", "AttributeType": "S"}]}}
        meta = Meta()
        calls = 0
        def scan(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return {"Items": [{"location_id": "a"}], "LastEvaluatedKey": {"location_id": "a"}}
            assert kwargs["ExclusiveStartKey"] == {"location_id": "a"}
            return {"Items": [{"location_id": "b"}]}
    table = Table()
    class Resource:
        def Table(self, _name): return table
    monkeypatch.setenv("DYNAMODB_FLOOD_TABLE", "floods")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setattr(fi.boto3, "resource", lambda *_a, **_k: Resource())
    rows, mode = fi.FloodStore().list_records()
    assert [row["location_id"] for row in rows] == ["a", "b"]
    assert mode == "dynamodb"


def test_dynamodb_upsert_uses_batch_writer(monkeypatch):
    class Batch:
        def __init__(self): self.items = []
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def put_item(self, **kwargs): self.items.append(kwargs["Item"])
    batch = Batch()
    class Table:
        name = "floods"
        class Meta:
            class client:
                @staticmethod
                def describe_table(**kwargs):
                    return {"Table": {"KeySchema": [{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}], "AttributeDefinitions": [{"AttributeName": "PK", "AttributeType": "S"}, {"AttributeName": "SK", "AttributeType": "S"}]}}
        meta = Meta()
        def batch_writer(self, **kwargs):
            assert kwargs["overwrite_by_pkeys"] == ["PK", "SK"]
            return batch
    class Resource:
        def Table(self, _name): return Table()
    monkeypatch.setenv("DYNAMODB_FLOOD_TABLE", "floods")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setattr(fi.boto3, "resource", lambda *_a, **_k: Resource())
    assert fi.FloodStore().upsert_records([{"location_id": "a", "event_type": "exposure_location"}]) == 1
    assert batch.items[0]["location_id"] == "a"
    assert batch.items[0]["PK"] == "FLOOD#a"
    assert batch.items[0]["SK"] == "RECORD#exposure_location#a"
    assert batch.items[0]["ingested_at"].endswith("Z")


def test_missing_region_is_clear_and_does_not_call_aws(monkeypatch):
    monkeypatch.setenv("DYNAMODB_FLOOD_TABLE", "floods")
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("AWS_DEFAULT_REGION", raising=False)
    with pytest.raises(RuntimeError, match="AWS_REGION"):
        fi.FloodStore().list_records()


def test_schema_mismatch_stops_before_scan(monkeypatch):
    class Table:
        name = "wrong"
        class Meta:
            class client:
                @staticmethod
                def describe_table(**kwargs):
                    return {"Table": {"KeySchema": [{"AttributeName": "location_id", "KeyType": "HASH"}], "AttributeDefinitions": [{"AttributeName": "location_id", "AttributeType": "S"}]}}
        meta = Meta()
        def scan(self, **kwargs): raise AssertionError("must not scan")
    class Resource:
        def Table(self, _name): return Table()
    monkeypatch.setenv("DYNAMODB_FLOOD_TABLE", "wrong")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setattr(fi.boto3, "resource", lambda *_a, **_k: Resource())
    with pytest.raises(RuntimeError, match="schema mismatch"):
        fi.FloodStore().list_records()


def test_distance_calculation():
    assert 110_000 < fi.distance_m(0, 0, 1, 0) < 112_000


def test_route_hazard_intersection_and_avoidance(monkeypatch):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    hazard = {"latitude": 12.92, "longitude": 77.54, "location_name": "closure",
              "status": "active", "confidence": "high", "event_type": "observed_flood",
              "last_verified_at": now}
    routes = [
        {"geometry": {"type": "LineString", "coordinates": [[77.53, 12.92], [77.55, 12.92]]}, "distance": 2000, "duration": 600},
        {"geometry": {"type": "LineString", "coordinates": [[77.53, 12.92], [77.53, 12.95], [77.55, 12.95], [77.55, 12.92]]}, "distance": 8000, "duration": 900},
    ]
    monkeypatch.setattr(fi, "_route", lambda *_: routes)
    result = fi.alternate_route({"origin": {"latitude": 12.92, "longitude": 77.53},
                                 "destination": {"latitude": 12.92, "longitude": 77.55},
                                 "travel_mode": "driving"}, [hazard])
    assert result["safe_route_verified"] is False
    assert result["rejected_routes"] == 1
    assert result["recommended_route"]["distance_m"] == 8000
    assert result["safe_route_verified"] is False


def test_no_candidate_clear_of_verified_hazards(monkeypatch):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    hazard = {"latitude": 12.92, "longitude": 77.53, "status": "active", "confidence": "verified",
              "event_type": "official_flood_alert", "last_verified_at": now}
    route = {"geometry": {"type": "LineString", "coordinates": [[77.53, 12.92], [77.55, 12.92]]}, "distance": 2000, "duration": 600}
    monkeypatch.setattr(fi, "_route", lambda *_: [route])
    result = fi.alternate_route({"origin": {"latitude": 12.92, "longitude": 77.53},
                                 "destination": {"latitude": 12.92, "longitude": 77.55}}, [hazard])
    assert result["recommended_route"] is None
    assert result["safe_route_verified"] is False


def test_stale_incident_is_not_used_as_hazard(monkeypatch):
    old = "2020-01-01T00:00:00Z"
    route = {"geometry": {"type": "LineString", "coordinates": [[77.53, 12.92], [77.55, 12.92]]}, "distance": 2000, "duration": 600}
    monkeypatch.setattr(fi, "_route", lambda *_: [route])
    record = {"latitude": 12, "longitude": 77, "status": "active", "confidence": "high",
              "event_type": "observed_flood", "last_verified_at": old}
    result = fi.alternate_route({"origin": {"latitude": 12.92, "longitude": 77.53},
                                 "destination": {"latitude": 12.92, "longitude": 77.55}}, [record])
    assert result["safe_route_verified"] is False
    assert result["recommended_route"]["distance_m"] == 2000


def test_route_request_validation_and_provider_failure(monkeypatch):
    invalid = client.post("/api/routes/alternate", json={"origin": {"latitude": 120, "longitude": 0},
                                                           "destination": {"latitude": 1, "longitude": 2}})
    assert invalid.status_code == 422
    monkeypatch.setattr(fi, "_route", lambda *_: [])
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    known = fi.load_inventory()[0]
    failed = client.post("/api/routes/alternate", json={"origin": {"latitude": 12.92, "longitude": 77.53},
                                                           "destination_location_id": known["location_id"]})
    assert failed.status_code == 503


def test_backend_rejects_source_outside_bengaluru():
    result = client.post("/api/routes/alternate", json={"origin": {"latitude": 28.6139, "longitude": 77.209}, "destination_location_id": "x"})
    assert result.status_code == 422
    assert "within Bengaluru" in result.json()["detail"]


def test_destination_must_exist_in_inventory(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    result = client.post("/api/routes/alternate", json={"origin": {"latitude": 12.92, "longitude": 77.53}, "destination_location_id": "not-in-inventory"})
    assert result.status_code == 422


def test_backend_uses_coordinates_from_inventory_destination(monkeypatch):
    records = [{"location_id": "known", "location_name": "Known place", "city": "Bengaluru", "state": "Karnataka", "latitude": 12.9716, "longitude": 77.5946, "event_type": "exposure_location"}]
    class Store:
        def list_records(self): return records, "local_kml"
    captured = {}
    monkeypatch.setattr(main, "FloodStore", Store)
    monkeypatch.setattr(main, "alternate_route", lambda body, rows: captured.update(body=body, records=rows) or {"ok": True})
    response = client.post("/api/routes/alternate", json={"origin": {"latitude": 12.92, "longitude": 77.53}, "destination_location_id": "known"})
    assert response.status_code == 200
    assert captured["body"]["destination"] == {"latitude": 12.9716, "longitude": 77.5946}
    assert captured["records"] == records


def test_destination_record_outside_configured_area_is_rejected(monkeypatch):
    class Store:
        def list_records(self):
            return ([{"location_id": "outside", "location_name": "Delhi point", "event_type": "exposure_location", "latitude": 28.6, "longitude": 77.2}], "dynamodb")
    monkeypatch.setattr(main, "FloodStore", Store)
    response = client.post("/api/routes/alternate", json={"origin": {"latitude": 12.9716, "longitude": 77.5946}, "destination_location_id": "outside"})
    assert response.status_code == 422


def test_route_candidate_rejects_out_of_area_or_inconsistent_geometry():
    origin = {"latitude": 12.9716, "longitude": 77.5946}
    destination = {"latitude": 12.95, "longitude": 77.61}
    invalid = {"geometry": {"type": "LineString", "coordinates": [[77.209, 28.6139], [77.61, 12.95]]}, "distance": 900000, "duration": 50000}
    assert not fi.validate_route_candidate(invalid, origin, destination)


def test_route_input_disallows_unsupported_mode():
    result = client.post("/api/routes/alternate", json={"origin": {"latitude": 12.92, "longitude": 77.53},
                                                          "destination_location_id": fi.load_inventory()[0]["location_id"],
                                                          "travel_mode": "flying"})
    assert result.status_code == 422
