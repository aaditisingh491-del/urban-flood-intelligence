# FloodSense · Urban Flood Intelligence (Bengaluru)

**Will my road flood? Know before you go.**

FloodSense is a civic-tech MVP for **Bengaluru, Karnataka**. It combines a source-backed inventory of flood-vulnerable locations, real hourly rainfall forecasts and routing-provider candidates, so residents can see weather and flood-history context for a place *before* they travel there.

> **Status:** hackathon prototype / decision-support demo. Weather forecasts, geocoding, routing and the vulnerability inventory are real, source-backed data. The risk score is a **provisional, uncalibrated** formula and is labelled that way in every response. FloodSense is **not** a flood warning service or an emergency service. A route without a mapped hazard is **not** confirmed safe.

---

## Why this matters

Urban flooding in India is a recurring, predictable monsoon event that kills people in ordinary places: underpasses, basements, drains and waterlogged roads.

### India (national context)

| Statistic | Figure | Source |
| --- | --- | --- |
| Average lives lost to floods per year | **~1,600** (NDMA); **~1,670** (1953 onward, official data compiled by Factly) | NDMA; MHA / CWC data |
| Flood deaths in a single recent year | **1,815** in 2020 (up from 37 in 1953) | Central Water Commission, as reported by The Pioneer |
| Lowest / highest recent counts | 933 deaths (2012); 1,371 deaths (2021); 11,316 deaths (1977 peak) | Factly, from official data |
| Economic cost | Roughly **0.46% of GDP every year** | Parida et al. (2020) |
| Northern India floods, 2023 | **At least 400 deaths** in one monsoon season | Policy Circle |
| Flood-prone land | ~40+ million hectares, about one-eighth of India's land area | Rashtriya Barh Ayog / Working Group on Water |

### Bengaluru

Bengaluru floods in the same places again and again. Lakes, stormwater drains (*rajakaluves*) and low-lying roads that once carried water away have been narrowed, silted up or built over, so a heavy downpour lands on a drainage network that cannot take it.

- **4–6 September 2022:** After the city's third-wettest September day on record, six overflowing lakes in eastern and south-eastern Bengaluru submerged at least 75 places and inundated nearly 4,000 homes and apartments. The Outer Ring Road (ORR) IT corridor around Bellandur and Marathahalli came to a standstill; residents used boats, tractors and coracles. The ORR companies' association estimated losses of about ₹225 crore. The BBMP reported close to 200 *rajakaluve* encroachments in the Mahadevapura zone alone.
- **21 May 2023:** A sudden afternoon downpour flooded the KR Circle underpass near Vidhana Soudha. A car carrying seven people from one family sank to neck-deep water; a young Infosys employee drowned. A Lokayukta inspection later found the underpass's drain outlets choked with silt, bottles and leaves.
- **18–20 May 2025:** About 105 mm of rain in 24 hours (IMD). Silk Board, BTM Layout, HSR Layout and Sai Layout were waterlogged, the Electronics City Elevated Expressway was shut for hours, and boats and tractors were deployed. Multiple outlets reported at least three deaths in the city, including a 12-year-old boy and a 63-year-old man electrocuted while trying to clear waterlogging; five rain-related deaths were reported statewide. The Chief Minister said the storm drains were encroached, shallow and silted.

We could not find a reliable flood-death count for Bengaluru alone, so this README gives none. These cases share a pattern: **people did not know a specific place was about to become dangerous.** Citywide alerts say "heavy rain expected"; they do not say "do not drive through the KR Circle underpass."

### The gap this project addresses

1. **Warnings are city-wide, risk is street-level.**
2. **Flash urban floods leave minutes, not hours.**
3. **The same places flood repeatedly**, yet that history is rarely turned into a simple, place-level answer.
4. **City teams triage blind** without a ranked view of exposure.

---

## What it does today

**Home dashboard (`/`)**
- **Bengaluru route planner:** search a Bengaluru source (autocomplete or map click) and pick a destination **only from the flood-vulnerable inventory**. Up to three OSRM route candidates are compared (distance, time, nearby inventory points, any fresh verified incident reports).
- **Destination risk assessment:** a provisional 0–100 score from the next six forecast hours at the destination, shown with its limits.
- **Illustrative evening outlook:** actual provider-returned hourly rain, rain chance and temperature for the destination, in `Asia/Kolkata` time.
- **Emergency Mode** (all pages): offline-capable safety guidance, 112 contact, NDMA SACHET and KSDMA links, and a local preparedness checklist.
- **Light / dark theme**, an accessible carousel, and plain-language safety advice.

**Explore (`/explore`)**
- Browse and search the ~200 source-backed flood-vulnerable locations by name, ward or zone, then send one to the planner as the destination.

**Smart Alerts (`/alerts`)**
- Save up to 12 Bengaluru places (stored **only in your browser**), set rainfall and probability thresholds, and manually refresh to get **forecast-based** alerts (6 h rainfall sum ≥ threshold *and* max precipitation probability ≥ threshold). Optional browser notifications. No background scheduler.

**Sign in (`/signin`)**
- Optional Amazon Cognito sign-in / registration / verification via AWS Amplify v6.

## Honest scope

- Inventory points are **static vulnerability locations, not active floods or road closures.**
- The app only treats a record as a current hazard if it is an `observed_flood` or `official_flood_alert`, status `active`, confidence `high`/`verified`, and verified within 24 h. The bundled data contains none, so route comparisons usually report "no fresh verified reports; absence of reports does not establish safety."
- `/api/risk` (city-wide score) is retired (HTTP 410) and `/api/hotspots` returns an empty list with `NO_VERIFIED_HOTSPOT_SCORES`: no fabricated scores are served.
- We do not claim lives saved. The roadmap is to validate against the 2022, 2023 and 2025 events above and pilot in a ward such as Koramangala or a corridor such as the ORR.

---

## Architecture

```text
React 19 + Vite + TypeScript (react-router, react-leaflet, Amplify Auth)
        │  /api/*
        ▼
FastAPI backend (backend/main.py)
  ├── flood_intelligence.py   KML inventory loader, optional DynamoDB store,
  │                           Open-Meteo geocoder, OSRM routing, hazard screening,
  │                           Bengaluru service-area polygon (Shapely)
  ├── weather_service.py      Open-Meteo hourly forecast (no API key)
  ├── risk_model.py           Provisional score: rainfall + chance of rain + assumed drainage
  ├── ingest_floods.py        Validate and idempotently ingest records into DynamoDB
  └── gis_service.py          Open-Meteo elevation helper (not used by current endpoints)

Data: backend/data/flood_prone_locations.kml (KSRSAC via OpenCity),
      backend/data/bengaluru-service-area.geojson
```

### Data sources

| Purpose | Source | Notes |
| --- | --- | --- |
| Flood-vulnerable locations | KSRSAC flooding locations in Bengaluru Urban, via [OpenCity](https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban) | Static inventory; `status: unverified`, `confidence: low` |
| Weather | [Open-Meteo](https://open-meteo.com/) forecast | Hourly precipitation, probability, temperature, weather code. No key. Attribution is shown in the UI |
| Geocoding | Open-Meteo geocoding | Results outside the Bengaluru polygon are discarded |
| Routing | OSRM (public demo server by default) | Best-effort; set `OSRM_BASE_URL` for production |
| Map tiles | OpenStreetMap | Attribution shown on maps |
| Service area | `bengaluru-service-area.geojson` | A configured service area, not a legal boundary claim |

### Provisional risk score (uncalibrated, not a probability)

| Component | Weight | Note |
| --- | --- | --- |
| 6-hour forecast rainfall | up to 60 | 1.5 points per mm, capped |
| Max precipitation probability | up to 20 | 0.2 points per percent |
| Drainage condition | 0 / 10 / 20 | Good / moderate or unknown / poor. **Assumed (`unknown` = 10)**, not measured |
| Elevation | not scored | Absolute elevation is not a flood indicator without local relative-terrain data |

Levels: **HIGH** ≥ 70, **MODERATE** ≥ 40, otherwise **LOW**. Responses carry `model_status: PROVISIONAL_UNCALIBRATED` and a warning. If the forecast fails, the assessment returns `model_score: null` and category `UNAVAILABLE` rather than guessing.

---

## Run locally

### Backend (Python 3.10+)

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Docs: <http://localhost:8000/docs>. With no AWS configuration the API serves the bundled KML inventory (`storage_mode: local_kml`). No weather API key is needed.

### Frontend (Node.js 20.19+ or 22.12+)

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to `http://127.0.0.1:8000`. Build with `npm run build` (output in `dist/`).

For sign-in, create `.env.local`:

```bash
VITE_COGNITO_USER_POOL_ID=ap-south-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=your_app_client_id
```

Without these, the sign-in page shows a clear configuration message; the rest of the app works.

### Tests

```bash
pytest          # backend: API, inventory, routing, weather, ingestion (network is mocked)
npm test        # frontend: Vitest + Testing Library
```

## Environment variables

Copy `.env.example`. Vite (`VITE_*`) values are baked into the public bundle: **never put secrets there.**

| Variable | Used by | Purpose |
| --- | --- | --- |
| `AWS_REGION` | Backend | Region for DynamoDB mode |
| `DYNAMODB_FLOOD_TABLE` | Backend | Enables DynamoDB mode. Empty = local KML mode |
| `OSRM_BASE_URL` | Backend | Routing service (defaults to the public OSRM demo) |
| `FLOOD_HAZARD_BUFFER_METERS` | Backend | Screening buffer around verified incident points (default 500) |
| `FLOOD_INVENTORY_CONTEXT_BUFFER_METERS` | Backend | Buffer for nearby inventory context (default 500) |
| `CORS_ORIGINS` | Backend | Comma-separated allowed origins (default `http://localhost:5173`) |
| `BENGALURU_SERVICE_AREA_GEOJSON` | Backend | Override the service-area polygon |
| `BENGALURU_ROUTE_SNAP_TOLERANCE_METERS` | Backend | Endpoint snap tolerance for route validation (default 5000) |
| `BENGALURU_ROUTE_BOUNDARY_TOLERANCE_METERS` | Backend | Boundary tolerance for route validation (default 1000) |
| `VITE_API_BASE_URL` | Frontend build | API origin in a deployed build. Empty uses the dev proxy |
| `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` | Frontend build | Cognito sign-in |

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check; verifies DynamoDB when configured |
| `GET` | `/api/geocode?q=` | Place search, restricted to Bengaluru |
| `GET` | `/api/service-area` | Service-area GeoJSON |
| `POST` | `/api/locations/validate` | Check a coordinate is inside Bengaluru |
| `GET` | `/api/locations/forecast?latitude=&longitude=` | Hourly Open-Meteo forecast for a Bengaluru point |
| `GET` | `/api/floods` | Paginated, filterable inventory (`event_type`, `q`, `status`, `sort_by`, `page`, …) |
| `GET` | `/api/floods/summary` | Counts by record type, stale/unverified count |
| `GET` | `/api/floods/{location_id}/assessment` | Destination assessment: provisional score + forecast + nearby verified incidents |
| `POST` | `/api/routes/alternate` | Route candidates from a Bengaluru origin to an inventory destination |
| `GET` | `/api/hotspots` | Always empty (`NO_VERIFIED_HOTSPOT_SCORES`) |
| `GET` | `/api/risk` | Retired (410): no city-wide score |
| `POST` | `/api/simulate` | Legacy demo scenario endpoint (uses demonstration coefficients; not a hydrological simulation) |

Geocode, route, forecast and assessment endpoints are rate-limited to 30 requests/minute per client to respect free-provider quotas.

Example route request:

```json
{ "origin": { "latitude": 12.9352, "longitude": 77.6245 },
  "destination_location_id": "ksrsac-…", "travel_mode": "driving" }
```

## Flood record storage and ingestion

By default records come from the bundled KML. To use DynamoDB:

1. Create the table from `infra/dynamodb-flood-table.json` (string keys `PK` and `SK`, on-demand billing).
2. Attach a read policy (`infra/flood-read-policy.json`) to the API role and a write policy (`infra/flood-ingest-policy.json`) to whoever ingests. `infra/flood-table-policy.json` combines both. Replace the placeholders.
3. Set `AWS_REGION` and `DYNAMODB_FLOOD_TABLE`.
4. Ingest and validate:

```bash
python -m backend.ingest_floods --dry-run                  # validate bundled inventory
python -m backend.ingest_floods --input records.json       # JSON array or CSV
```

The ingester requires source name/URL and timestamps, rejects coordinates outside Bengaluru, skips duplicates and `sample_only` rows, and refuses to write anything if any row fails validation. Active observations or alerts require `high`/`verified` confidence and an observation timestamp. See `backend/data/sample-upload.json` for the (non-ingestable) shape.

## Deployment

- **Backend:** any ASGI host. The `Procfile` runs `uvicorn backend.main:app --host 0.0.0.0 --port 8000`. Set `CORS_ORIGINS` to your frontend origin, use a managed or self-hosted OSRM, and grant the runtime role the read policy if using DynamoDB.
- **Frontend:** `VITE_API_BASE_URL="https://your-api" npm run build`, then host `dist/` on any static host (for example private S3 + CloudFront with Origin Access Control, default root object `index.html`, and an SPA fallback to `index.html` so `/explore`, `/alerts` and `/signin` work on refresh). Invalidate the CDN cache after each upload.
- **AWS Lambda (optional):** FastAPI can run behind a Function URL using Mangum, but that adapter and a handler file are not part of this repo's `requirements.txt`; add them yourself and raise the Lambda timeout (provider calls plus a ~1 s OSRM rate-limit pause per route request).

| Symptom | Likely cause |
| --- | --- |
| CORS error in the browser | `CORS_ORIGINS` does not exactly match the frontend origin (`https://`, no trailing slash) |
| Route search returns 429 / 503 / 504 | Public OSRM demo is rate-limiting or slow; retry or self-host |
| "Place search is unavailable" | Open-Meteo geocoding unreachable from the backend |
| Destination list empty | Inventory failed to load, or DynamoDB table/region/schema mismatch (see the error text) |
| Sign-in page shows a configuration error | Missing `VITE_COGNITO_*` values |

## Current limitations

- The risk score is a simple weighted formula, not a calibrated hydrological or machine-learning model; drainage is an assumed input.
- The inventory is a static list of known vulnerable points; it is incomplete and not a live incident feed. No verified road-closure, sensor or municipal data is integrated.
- Forecasts describe destination-area weather, not conditions along each road segment.
- Route screening uses point buffers, not road-level hazard data. The public OSRM server is best-effort.
- Smart Alerts are manual-refresh, browser-local and forecast-only; there is no SMS/WhatsApp/push backend.
- Results must not be used as the sole basis for real-world safety decisions. In immediate danger, call **112** and follow official guidance (NDMA SACHET, Karnataka SDMA).

## Roadmap

1. **Calibrate** against Bengaluru waterlogging events (September 2022, May 2023, May 2025).
2. **Real drainage and terrain context:** relative elevation, low-lying basins, underpasses, *rajakaluve* and lake networks, ward drain maps.
3. **Verified incident ingestion** (BBMP / KSNDMC / official alerts) so route screening has fresh data.
4. **Hyperlocal nowcasting** (0–3 h) with radar and ground-sensor feeds.
5. **Server-side alerts** by SMS, WhatsApp and push, in Kannada and English.
6. **Municipal workflow:** pump dispatch and drain-clearing priorities.
7. Make the service area configurable so the same engine can run for other cities.

---

## Sources for the statistics above

- India flood fatalities and averages (NDMA, MHA, CWC): Factly <https://factly.in/data-average-annual-economic-impact-due-to-floods-is-more-than-rs-25000-crores-after-the-year-2010>
- CWC flood deaths 1953–2020: The Pioneer <https://www.dailypioneer.com/2023/columnists/india-needs-an-integrated-approach-to-flood-management.html>
- Flood loss as share of GDP (Parida et al., 2020): FLAME University / BusinessLine <https://flame.edu.in/in-the-media/india-needs-robust-flood-management-policy>
- NDMA ~1,600 deaths per year and 2023 Northern India floods: Policy Circle <https://www.policycircle.org/opinion/climate-change-rains-floods/amp/>
- Bengaluru, September 2022: Deccan Herald <https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Frain-brings-bengalurus-it-corridor-to-a-standstill-1142546.html>
- ORR loss estimate and *rajakaluve* encroachments: Deccan Herald <https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Fbengaluru%2Fbbmp-building-parallel-drains-to-stop-flooding-on-orr-1141693.html>
- KR Circle underpass, May 2023: South First <https://thesouthfirst.com/karnataka/woman-dies-after-car-with-andhra-pradesh-family-zooms-into-rain-flooded-bengaluru-underpass>
- Lokayukta inspection of the underpass drains: Deccan Herald <https://www.deccanherald.com/amp/city/top-bengaluru-stories/lokayukta-probe-reveals-drainage-issues-in-kr-circle-underpass-1225721.html>
- Bengaluru, May 2025: The Federal <https://thefederal.com/category/states/south/karnataka/bengaluru-floods-toll-rises-to-3-child-elderly-man-electrocuted-more-rain-187800>
- Statewide toll and Silk Board / Sai Layout, May 2025: The Tribune <https://www.tribuneindia.com/news/india/rain-continues-to-batter-bengaluru-death-toll-climbs-to-5>
- Chief Minister's remarks on drains, May 2025: AFP via The Peninsula <https://thepeninsulaqatar.com/article/20/05/2025/one-dead-as-rains-choke-indias-tech-capital>
- Koramangala, Indiranagar waterlogging, May 2025: All India Radio <https://www.newsonair.gov.in/bengaluru-several-areas-inundated-by-overnight-rainfall>

Figures come from news reports and secondary summaries of official data. Verify against NDMA, MHA, CWC and IMD publications before using them formally.

## Contributing

1. Create a branch for your change.
2. Never present inventory points or forecasts as confirmed floods; keep provisional values labelled.
3. Before opening a pull request, run `npm run build`, `npm test` and `pytest`.
4. Never commit credentials, `.env*` files, build output, local caches or virtual environments.
