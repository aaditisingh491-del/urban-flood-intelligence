
from fastapi.testclient import TestClient

from backend import main

client = TestClient(main.app)


def test_risk_endpoint(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_weather_data",
        lambda: {
            "location": "Bengaluru",
            "rainfall": 2.0,
            "rainfall_forecast_6h_mm": 25.0,
            "chance_of_rain": 70,
            "peak_time": "3:00 AM",
            "data_source": "WeatherAPI",
        },
    )

    monkeypatch.setattr(
        main,
        "get_elevation",
        lambda latitude, longitude: {
            "elevation_m": 894.0,
            "data_source": "Open-Meteo Elevation API",
        },
    )

    response = client.get("/api/risk")

    assert response.status_code == 200

    data = response.json()
    assert data["location"] == "Bengaluru"
    assert data["risk"] == 62
    assert data["level"] == "MODERATE"
    assert data["elevation_m"] == 894.0
    assert data["model_status"] == "PROVISIONAL_UNCALIBRATED"


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


def test_hotspots_endpoint():
    response = client.get("/api/hotspots")

    assert response.status_code == 200

    data = response.json()
    assert len(data["hotspots"]) == 5
    assert data["model_status"] == "DEMO_DATA_NOT_LIVE"

    for hotspot in data["hotspots"]:
        assert 0 <= hotspot["risk"] <= 100
        assert hotspot["data_status"] == "DEMO"


def test_route_risk_endpoint():
    response = client.post("/api/route-risk", json={})

    assert response.status_code == 200
    assert response.json() == {
        "routes": [
            {
                "name": "4th Cross Road",
                "travel_time": 41,
                "flood_risk": 24,
                "recommended": True,
            },
            {
                "name": "80 Feet Road",
                "travel_time": 35,
                "flood_risk": 82,
                "recommended": False,
            },
        ]
    }


def test_route_risk_rejects_unsupported_request_fields():
    response = client.post(
        "/api/route-risk",
        json={"rainfall_delta": 20},
    )

    assert response.status_code == 422


def test_hotspots_endpoint_is_read_only():
    response = client.post("/api/hotspots", json={})

    assert response.status_code == 405
