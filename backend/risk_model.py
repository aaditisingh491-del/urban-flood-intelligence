
def calculate_flood_risk(
    rainfall_6h_mm: float,
    chance_of_rain: int,
    elevation_m: float | None = None,
    drainage_condition: str = "unknown",
) -> dict:
    """
    Provisional demonstration score.
    Elevation is not used as an absolute flood-risk indicator;
    local relative-terrain data is needed for reliable scoring.
    """

    rainfall_score = min(60.0, max(0.0, rainfall_6h_mm) * 1.5)
    rain_probability_score = min(
        20.0, max(0, min(100, chance_of_rain)) * 0.2
    )

    drainage_scores = {
        "good": 0,
        "moderate": 10,
        "poor": 20,
        "unknown": 10,
    }
    drainage_score = drainage_scores.get(
        drainage_condition.lower(), 10
    )

    # Elevation is reported, but not scored without local terrain context.
    score = round(
        min(100.0, rainfall_score + rain_probability_score + drainage_score)
    )

    if score >= 70:
        level = "HIGH"
    elif score >= 40:
        level = "MODERATE"
    else:
        level = "LOW"

    return {
        "risk": score,
        "level": level,
        "rainfall_score": round(rainfall_score, 1),
        "rain_probability_score": round(rain_probability_score, 1),
        "drainage_score": drainage_score,
        "elevation_m": elevation_m,
        "model_status": "PROVISIONAL_UNCALIBRATED",
        "warning": (
            "Drainage condition is an assumed input unless verified "
            "with real drainage data. Elevation is not yet used to "
            "infer flood susceptibility."
        ),
    }