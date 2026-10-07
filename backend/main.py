import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Urban Flood Intelligence API", version="0.1.0")
cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_methods=["*"], allow_headers=["*"])

class Scenario(BaseModel):
    rainfall_delta: float = 0
    drainage_delta: float = 0
    start_shift: int = 0

@app.get("/api/risk")
def risk():
    return {"risk": 78, "level": "HIGH", "peak_time": "7:00 PM", "rainfall": 42, "confidence": "HIGH"}

@app.post("/api/route-risk")
def route_risk():
    return {"routes": [{"name": "4th Cross Road", "travel_time": 41, "flood_risk": 24, "recommended": True}, {"name": "80 Feet Road", "travel_time": 35, "flood_risk": 82, "recommended": False}]}

@app.post("/api/simulate")
def simulate(s: Scenario):
    value = max(5, min(98, round(78 + s.rainfall_delta * 0.65 - s.drainage_delta * 0.45)))
    peak = "5:00 PM" if s.start_shift < 0 else "9:00 PM" if s.start_shift > 0 else "7:00 PM"
    return {"current_risk": 78, "scenario_risk": value, "peak_time": peak}

@app.get("/api/hotspots")
def hotspots():
    return {"hotspots": [{"name": "Koramangala 5th Block", "risk": 91}, {"name": "XYZ Junction", "risk": 87}, {"name": "MG Road Underpass", "risk": 82}, {"name": "ABC Layout", "risk": 79}, {"name": "Lake Road", "risk": 74}]}
