# Urban Flood Intelligence

**Will my road flood? Know before you go.**

Urban Flood Intelligence is a civic-tech MVP that turns live rainfall forecasts and terrain data into a simple, street-level answer to one question: *will my road flood tonight?* It helps residents avoid dangerous routes, basements and underpasses, and helps city teams decide where to intervene first.

> **Status:** hackathon prototype. Live inputs (weather, elevation) are real; the risk model, hotspots and routes are **provisional demo data**, clearly labelled as such in every API response. This is not a flood warning service.

---

## Why this matters

Urban flooding in India is not a rare disaster. It is a recurring, predictable monsoon event that kills people in ordinary places: basements, underpasses, drains and waterlogged roads.

### India

| Statistic | Figure | Source |
| --- | --- | --- |
| Average lives lost to floods per year | **~1,600** (NDMA); **~1,670** (1953 onward, official data compiled by Factly) | NDMA; MHA / CWC data |
| Flood deaths in a single recent year | **1,815** in 2020 (up from 37 in 1953) | Central Water Commission, as reported by The Pioneer |
| Lowest / highest recent counts | 933 deaths (2012); 1,371 deaths (2021); 11,316 deaths (1977 peak) | Factly, from official data |
| Economic cost | India loses roughly **0.46% of GDP every year** to floods | Parida et al. (2020) |
| Northern India floods, 2023 | **At least 400 deaths** in one monsoon season | Policy Circle |
| Flood-prone land | ~40+ million hectares, about one-eighth of India's land area | Rashtriya Barh Ayog / Working Group on Water |

Flood deaths have **not meaningfully fallen in 50 years**: the decadal average has stayed between roughly 1,800 and 2,000 deaths per year since the 1980s, even as cities have grown and paved over natural drainage.

### Delhi

Delhi shows how fast an urban flood can turn deadly, even in the national capital.

- **28 June 2024:** Delhi recorded **228.1 mm of rain in 24 hours**, the highest June 24-hour rainfall since 1936, against a normal June average of about 80.6 mm. **11 people died in the first two days of the monsoon**, including children who drowned in rainwater-filled ditches. Reports at the time noted that forecasts had flagged extremely heavy rain for later days but not for that morning.
- **27 July 2024:** **Three civil-services aspirants drowned** when the basement library of a coaching centre in Old Rajinder Nagar flooded within minutes after heavy rain. Reports describe around 35 students in the basement, a single narrow staircase, and 14 rescued. The area had suffered recurring waterlogging for years.
- **2023:** the Yamuna floods in July 2023 inundated large parts of Delhi, and officials acknowledged the city's flood-control preparedness fell short again in 2024.

These deaths share a pattern: **people did not know a specific place was about to become dangerous.** Citywide weather alerts say "heavy rain expected." They do not say "do not go into this basement" or "this underpass will be impassable at 7 PM."

### The gap this project addresses

1. **Warnings are city-wide, risk is street-level.** A forecast for "Delhi" does not tell a student, a commuter or a parent which road, basement or underpass to avoid.
2. **Flash urban floods leave minutes, not hours.** Basement flooding can trap people before anyone reacts.
3. **City teams triage blind.** Drain-clearing and pump deployment are hard to prioritise without a ranked view of exposure.

---

## What it does

**Citizen view**

- Search a road or neighbourhood, or tap a road segment on the map.
- See a risk score, severity, peak window, rainfall and a confidence label.
- Get practical actions: move the car, avoid the underpass, take a safer route.
- Compare a safer route with the fastest route and the time/risk trade-off.
- Run a what-if scenario: change rainfall intensity, drainage capacity and rain start time.

**Municipality view**

- Ranked flood hotspots for tonight.
- A sample drainage intervention with projected risk reduction.

## Honest scope and impact

We deliberately do **not** claim a number of lives saved. No flood-risk tool can honestly promise that without field validation. What this project targets is the part of the problem that earlier, more local information can change:

- people entering basements, underpasses and low-lying roads just before water rises;
- drivers choosing flooded routes;
- city crews deciding where to send pumps and clear drains first.

To make impact measurable, the roadmap is to validate the model against historical Delhi and Bengaluru waterlogging events (for example the June and July 2024 events above), then pilot with a ward or a coaching-hub neighbourhood and measure alert lead time, false-alarm rate and route-change behaviour.

---

## How it works

```text
React + Vite UI
      │  /api/risk, /api/simulate, /api/hotspots, /api/route-risk
      ▼
FastAPI backend
  ├── weather_service.py   WeatherAPI: current rain, 6h / 12h hourly forecast, peak hour
  ├── gis_service.py       Open-Meteo Elevation API: terrain height for a coordinate
  └── risk_model.py        Provisional score: rainfall + chance of rain + assumed drainage
```

**Risk score (provisional, uncalibrated)**

| Component | Weight | Note |
| --- | --- | --- |
| 6-hour forecast rainfall | up to 60 | 1.5 points per mm, capped |
| Chance of rain | up to 20 | 0.2 points per percent |
| Drainage condition | 0 / 10 / 20 | Good / moderate or unknown / poor. **Currently an assumed input**, not measured data |
| Elevation | not scored | Reported only. Absolute elevation is not a flood indicator without local relative-terrain data |

Levels: **HIGH** ≥ 70, **MODERATE** ≥ 40, otherwise **LOW**. Every response carries `model_status`, `confidence` and a `warning` field so the limits are never hidden.

## Tech stack

- React and TypeScript, bundled with Vite; SVG/CSS illustrative map; Lucide icons
- Python and FastAPI, served by Uvicorn
- WeatherAPI (forecast) and Open-Meteo (elevation) as live data sources
- pytest for API tests
- AWS: CloudFront, S3, App Runner (see deployment)

## Project structure

```text
.
├── backend/
│   ├── main.py              # FastAPI app and endpoints
│   ├── weather_service.py   # Live weather and rainfall forecast
│   ├── gis_service.py       # Elevation lookup
│   ├── risk_model.py        # Provisional risk scoring
│   └── requirements.txt
├── tests/
│   └── test_api.py          # Endpoint tests with mocked data sources
├── src/
│   ├── main.tsx             # React UI and API integration
│   ├── style.css
│   ├── interactions.css
│   └── vite-env.d.ts
├── index.html
├── package.json
├── requirements.txt         # Root entry point for source deployments
├── tsconfig.json
└── vite.config.ts           # Local /api proxy to FastAPI
```

## Run locally

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Create `backend/.env` (it is git-ignored):

```bash
WEATHERAPI_KEY=your_key_here
WEATHERAPI_LOCATION=Bengaluru   # optional, defaults to Bengaluru
```

Start the API:

```bash
uvicorn backend.main:app --reload --port 8000
```

Docs: <http://localhost:8000/docs>. Without a valid `WEATHERAPI_KEY`, `/api/risk` returns a safe `UNAVAILABLE` response and the UI falls back to sample values.

### Frontend

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to `http://127.0.0.1:8000`. Build with `npm run build` (output in `dist/`).

### Tests

```bash
pytest
```

## API endpoints

All routes are prefixed with `/api`.

| Method | Endpoint | Purpose | Data |
| --- | --- | --- | --- |
| `GET` | `/api/risk` | Risk score, level, peak time, rainfall forecast, elevation, data sources | Live inputs, provisional model |
| `POST` | `/api/simulate` | Recompute risk for rainfall, drainage and start-time changes | Demo coefficients |
| `GET` | `/api/hotspots` | Ranked hotspots | Demo data (`DEMO_DATA_NOT_LIVE`) |
| `POST` | `/api/route-risk` | Safer vs fastest route | Not yet implemented in the API; the UI falls back to sample routes |

Example simulator request:

```json
{ "rainfall_delta": 20, "drainage_delta": 10, "start_shift": -2 }
```

## Environment variables

| Variable | Used by | Purpose | Default |
| --- | --- | --- | --- |
| `WEATHERAPI_KEY` | Backend | WeatherAPI key. **Secret.** | none (required for live data) |
| `WEATHERAPI_LOCATION` | Backend | City to forecast | `Bengaluru` |
| `CORS_ORIGINS` | Backend | Comma-separated allowed frontend origins | `http://localhost:5173` |
| `VITE_API_BASE_URL` | Frontend build | API origin prepended to `/api` in a deployed build. Public, never a secret | empty |

## Current limitations

- The risk score is a simple weighted formula, **not** a calibrated hydrological or machine-learning model.
- Drainage condition is an **assumed** input; hotspots, routes and the "why this road" breakdown are illustrative demo values.
- Coordinates for elevation are currently a fixed demo point in Bengaluru.
- The map is a stylised illustration: no map tiles, geocoding, GPS or routing.
- No database, authentication, notifications, sensor feeds or municipal integrations.
- Results must not be used for real-world safety decisions.

## Roadmap

1. **Calibrate** against historical waterlogging events (Delhi June and July 2024, Bengaluru monsoon floods).
2. **Real drainage and terrain context:** relative elevation, low-lying basins, underpasses, basement density, ward drain maps.
3. **Hyperlocal nowcasting** (0–3 hour) with radar and ground-sensor feeds.
4. **Alerts** by SMS, WhatsApp and push to subscribed wards, with Hindi and regional-language support.
5. **Real routing and maps** with flood-aware route scoring.
6. **Municipal workflow:** pump dispatch, drain-clearing priorities and post-event feedback.
7. Make the location configurable so the same engine runs for Delhi, Bengaluru and other cities.

## AWS deployment architecture

```text
Browser
  ├── CloudFront (HTTPS/CDN) ── private S3 bucket (Vite static build)
  └── HTTPS ── AWS App Runner (FastAPI API)
```

CloudFront serves the static build from a private S3 bucket using Origin Access Control. App Runner hosts the FastAPI service. `CORS_ORIGINS` on App Runner allows the CloudFront origin. No infrastructure-as-code is included; the steps below use the AWS Console.

### Manual AWS Console deployment

1. **Create the API service.** In App Runner, create a service from the GitHub repository and branch, using the Python runtime. Source directory: repository root. Build command: `pip install -r requirements.txt`. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`. Set the port to `8000`.
2. **Set API configuration.** Add `CORS_ORIGINS` (the CloudFront origin, for example `https://d123example.cloudfront.net`) and `WEATHERAPI_KEY` as App Runner environment variables. Store `WEATHERAPI_KEY` as a secret (AWS Secrets Manager or SSM Parameter Store) rather than plain text. Redeploy after changes and copy the App Runner service URL.
3. **Build the frontend.** Run `VITE_API_BASE_URL="https://your-service.region.awsapprunner.com" npm run build`.
4. **Create the static origin.** Create an S3 bucket with Block Public Access enabled and upload the *contents* of `dist/` to the bucket root.
5. **Create CloudFront.** Use the bucket as origin with Origin Access Control, set the default root object to `index.html`, allow HTTPS, and apply the bucket policy CloudFront suggests.
6. **Finish and verify.** Set the exact CloudFront origin in `CORS_ORIGINS`, redeploy if needed, invalidate the CloudFront cache after later uploads, and confirm the API data loads.

Review account, region, access and cost settings in the console before creating services.

## Sources for the statistics above

- India flood fatalities and averages (NDMA, MHA, CWC data): Factly, "Average annual economic impact due to floods" <https://factly.in/data-average-annual-economic-impact-due-to-floods-is-more-than-rs-25000-crores-after-the-year-2010>
- CWC flood deaths 1953–2020 and average annual loss: The Pioneer, "India needs an integrated approach to flood management" <https://www.dailypioneer.com/2023/columnists/india-needs-an-integrated-approach-to-flood-management.html>
- Flood loss as share of GDP (Parida et al., 2020): FLAME University / BusinessLine <https://flame.edu.in/in-the-media/india-needs-robust-flood-management-policy>
- NDMA ~1,600 deaths per year and 2023 Northern India floods: Policy Circle <https://www.policycircle.org/opinion/climate-change-rains-floods/amp/>
- Delhi, 28 June 2024 rainfall record: The Tribune <https://www.tribuneindia.com/news/delhi/national-capital-faces-rain-fury-records-highest-downpour-in-88-years-634932>
- Delhi, 11 deaths in two days of monsoon: Siasat / PTI <https://www.siasat.com/11-killed-in-first-two-days-of-monsoon-in-delhi-3053620/amp/>
- Rajinder Nagar basement deaths, 27 July 2024: PTI via Deccan Herald <https://www.deccanherald.com/amp/story/india%2Fdelhi%2Fthree-civil-services-aspirants-die-as-basement-of-coaching-centre-flooded-in-delhi-3125296> and Newslaundry <https://www.newslaundry.com/2024/07/28/2-arrests-after-3-deaths-but-tragedies-waiting-to-happen-in-delhis-ias-coaching-hub>

Figures are drawn from news reports and secondary summaries of official data. Verify against NDMA, MHA, CWC and IMD publications before using them in formal submissions.

## Contributing

1. Create a branch for your change.
2. Keep demo data separate from UI behaviour, and keep every demo value labelled as such.
3. Before opening a pull request, run `npm run build` and `pytest`.
4. Never commit credentials, `.env` files, local caches, or generated build and virtual-environment folders.
