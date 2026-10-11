
from fastapi.testclient import TestClient

from backend import main

client = TestClient(main.app)


def test_generic_risk_endpoint_rejects_citywide_score():
    response = client.get("/api/risk")
    assert response.status_code == 410
    assert "Select a Bengaluru inventory destination" in response.json()["detail"]


def test_simulate_endpoint(monkeypatch):
    monkeypatch.setattr(
        main,
        "risk",
        lambda: {
            "risk": 50,
            "level": "MODERATE",
            "peak_time": "3:00 AM",
        },
    )

    response = client.post(
        "/api/simulate",
        json={
            "rainfall_delta": 0,
            "drainage_delta": 0,
            "start_shift": 0,
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["current_risk"] == 50
    assert data["scenario_risk"] == 50
    assert data["scenario_level"] == "MODERATE"


def test_hotspots_endpoint_does_not_return_fabricated_scores():
    response = client.get("/api/hotspots")
    assert response.status_code == 200
    body = response.json()
    assert body["hotspots"] == []
    assert body["model_status"] == "NO_VERIFIED_HOTSPOT_SCORES"
    assert "verified" in body["warning"]


def test_hotspots_endpoint_is_read_only():
    response = client.post("/api/hotspots", json={})

    assert response.status_code == 405


def test_destination_assessment_uses_inventory_coordinates_and_forecast(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    record = main.FloodStore().list_records()[0][0]
    calls = []
    def forecast(latitude, longitude):
        calls.append((latitude, longitude))
        return {"provider": "Open-Meteo", "attribution": "Weather data by Open-Meteo.com",
                "timezone": "Asia/Kolkata", "generated_at": "2026-10-11T12:00:00+05:30",
                "units": {"precipitation": "mm", "precipitation_probability": "%", "temperature": "°C"},
                "slots": [{"valid_at": f"2026-10-11T{hour:02d}:00:00+05:30", "precipitation_mm": 2.0,
                           "precipitation_probability_percent": 40, "temperature_c": 24.0, "weather_code": 61}
                          for hour in range(17, 23)]}
    monkeypatch.setattr(main, "get_destination_forecast", forecast)
    response = client.get(f"/api/floods/{record['location_id']}/assessment")
    assert response.status_code == 200
    body = response.json()
    assert calls == [(record["latitude"], record["longitude"])]
    assert body["location"]["location_id"] == record["location_id"]
    assert body["assessment_type"] == "inventory_vulnerability_with_weather_context"
    assert body["model_score"] is not None and body["model_score"] <= 100
    assert body["forecast"]["provider"] == "Open-Meteo"
    assert body["forecast"]["units"]["precipitation"] == "mm"
    assert len(body["forecast"]["slots"]) == 6
    assert body["forecast"]["slots"][0]["valid_at"].endswith("+05:30")
    assert "assumed" in body["model_warning"].lower()


def test_unknown_assessment_destination_rejected(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    assert client.get("/api/floods/not-an-inventory-place/assessment").status_code == 404


def test_assessment_forecast_failure_is_honestly_unavailable(monkeypatch):
    monkeypatch.delenv("DYNAMODB_FLOOD_TABLE", raising=False)
    record = main.FloodStore().list_records()[0][0]
    monkeypatch.setattr(main, "get_destination_forecast", lambda *_: (_ for _ in ()).throw(RuntimeError("offline")))
    response = client.get(f"/api/floods/{record['location_id']}/assessment")
    assert response.status_code == 200
    body = response.json()
    assert body["model_score"] is None
    assert body["model_category"] == "UNAVAILABLE"
    assert body["forecast"] is None
    assert body["forecast_error"]
