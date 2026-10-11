from datetime import datetime, timedelta
from backend import weather_service as weather


def test_destination_forecast_requests_exact_coordinates_and_normalizes_units(monkeypatch):
    now = datetime.now(weather.TIMEZONE).replace(minute=0, second=0, microsecond=0) + timedelta(hours=2)
    times = [now.strftime("%Y-%m-%dT%H:%M"), (now + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")]
    calls = []
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"timezone": "Asia/Kolkata", "generationtime_ms": 1.2,
                    "hourly_units": {"precipitation": "mm", "precipitation_probability": "%", "temperature_2m": "°C"},
                    "hourly": {"time": times, "precipitation": [1.5, 0],
                               "precipitation_probability": [60, 10], "temperature_2m": [25, 24],
                               "weather_code": [61, 2]}}
    def get(url, *, params, timeout):
        calls.append((url, params, timeout))
        return Response()
    monkeypatch.setattr(weather.httpx, "get", get)
    result = weather.get_destination_forecast(12.8675, 77.5324)
    assert calls[0][1]["latitude"] == 12.8675
    assert calls[0][1]["longitude"] == 77.5324
    assert calls[0][1]["timezone"] == "Asia/Kolkata"
    assert result["units"] == {"precipitation": "mm", "precipitation_probability": "%", "temperature": "°C"}
    assert result["slots"][0]["valid_at"].endswith("+05:30")
    assert result["slots"][0]["precipitation_mm"] == 1.5
    assert result["slots"][0]["precipitation_probability_percent"] == 60
    assert result["slots"][0]["temperature_c"] == 25
    assert result["slots"][0]["weather_code"] == 61
    assert result["provider"] == "Open-Meteo"


def test_destination_forecast_rejects_invalid_coordinates():
    import pytest
    with pytest.raises(ValueError, match="coordinates are invalid"):
        weather.get_destination_forecast(95, 200)
