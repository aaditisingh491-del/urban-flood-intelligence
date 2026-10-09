
import httpx

ELEVATION_API_URL = "https://api.open-meteo.com/v1/elevation"


def get_elevation(latitude: float, longitude: float) -> dict:
    """Fetch terrain elevation for a latitude/longitude."""

    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90.")

    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180.")

    response = httpx.get(
        ELEVATION_API_URL,
        params={
            "latitude": latitude,
            "longitude": longitude,
        },
        timeout=10.0,
    )
    response.raise_for_status()
    data = response.json()

    elevations = data.get("elevation", [])
    if not elevations:
        raise RuntimeError("Elevation data was not returned.")

    return {
        "latitude": latitude,
        "longitude": longitude,
        "elevation_m": elevations[0],
        "data_source": "Open-Meteo Elevation API",
    }