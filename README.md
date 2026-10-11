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
- Python and FastAPI, served by Uvicorn locally and by AWS Lambda (via Mangum) when deployed
- WeatherAPI (forecast) and Open-Meteo (elevation) as live data sources
- pytest for API tests
- AWS: CloudFront, S3, Lambda with a Function URL (see deployment)

## Project structure

```text
.
├── backend/
│   ├── main.py                  # FastAPI app and endpoints
│   ├── weather_service.py       # Live weather and rainfall forecast
│   ├── gis_service.py           # Elevation lookup
│   ├── risk_model.py            # Provisional risk scoring
│   ├── lambda_handler.py        # AWS Lambda entry point (Mangum adapter)
│   ├── requirements.txt         # Local development dependencies
│   └── requirements-lambda.txt  # Dependencies packaged for Lambda
├── tests/
│   └── test_api.py              # Endpoint tests with mocked data sources
├── src/
│   ├── main.tsx                 # React UI and API integration
│   ├── style.css
│   ├── interactions.css
│   └── vite-env.d.ts
├── index.html
├── package.json
├── requirements.txt             # Root entry point for local installs
├── tsconfig.json
└── vite.config.ts               # Local /api proxy to FastAPI
```

## Run locally

### Backend

Requires Python 3.10+.

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
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

Docs: <http://localhost:8000/docs>. Without a valid `WEATHERAPI_KEY`, `/api/risk` returns a safe `UNAVAILABLE` response (HTTP 200, `level: "UNAVAILABLE"`, risk `0`). The UI shows that response as-is, so a 0% score usually means the key is missing or invalid. The UI only falls back to its built-in sample values when a request fails outright (for example the API is not running, or an endpoint returns 404).

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

The tests mock the weather and elevation calls, so they need no API key or internet access.

## API endpoints

All routes are prefixed with `/api`.

| Method | Endpoint | Purpose | Data |
| --- | --- | --- | --- |
| `GET` | `/api/risk` | Risk score, level, peak time, rainfall forecast, elevation, data sources | Live inputs, provisional model |
| `POST` | `/api/simulate` | Recompute risk for rainfall, drainage and start-time changes | Live baseline, demo coefficients |
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

Locally, backend variables live in `backend/.env`. In AWS they are Lambda environment variables. Vite variables are baked into the public browser bundle, so never put secrets in `VITE_*` variables.

## Current limitations

- The risk score is a simple weighted formula, **not** a calibrated hydrological or machine-learning model.
- Drainage condition is an **assumed** input; hotspots, routes, the hourly outlook and the "why this road" breakdown are illustrative demo values.
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

---

## AWS deployment

### Architecture

```text
Browser
  ├── CloudFront (HTTPS/CDN) ── private S3 bucket   (Vite static build)
  └── HTTPS ── Lambda Function URL ── FastAPI (Mangum)
```

CloudFront serves the static build from a private S3 bucket using Origin Access Control (OAC). The FastAPI app runs in AWS Lambda behind a Function URL, which provides HTTPS with no extra services. `CORS_ORIGINS` on the Lambda function must contain the CloudFront origin. No infrastructure-as-code is included; the steps below use the AWS Console.

> **Why Lambda and not App Runner?** AWS closed App Runner to new customers on April 30, 2026. If your account already uses App Runner you can still deploy there with the start command `uvicorn backend.main:app --host 0.0.0.0 --port 8000`; otherwise use the steps below. AWS recommends Amazon ECS Express Mode for container hosting, which needs a Dockerfile and a container registry and is not covered here.

### Step 0: Prepare

1. Create an AWS account and enable MFA on the root user.
2. In **Billing → Budgets**, create a small budget alert (for example, $5).
3. Pick one region for Lambda and S3 (for example Asia Pacific (Mumbai) `ap-south-1`) and stay in it. CloudFront is global.
4. Get your WeatherAPI key.

### Step 1: Package the backend

Make sure these two files exist.

`backend/requirements-lambda.txt`

```text
fastapi
httpx
python-dotenv
mangum
```

`backend/lambda_handler.py`

```python
from mangum import Mangum
from backend.main import app

handler = Mangum(app, lifespan="off")
```

Build the zip from the project root. The `--platform` flags download Linux-compatible libraries, since Lambda runs on Linux:

```bash
mkdir build
pip install -r backend/requirements-lambda.txt --target build \
  --platform manylinux2014_x86_64 --only-binary=:all: \
  --python-version 3.12 --implementation cp
cp -r backend build/backend
rm -f build/backend/.env
cd build
zip -r ../api.zip .
cd ..
```

Zip the **contents** of `build/` so `backend/` sits at the top level of the zip, and confirm no `.env` file is inside.

### Step 2: Create the Lambda function

1. In the AWS Console, open **Lambda → Create function → Author from scratch**.
2. Name: `flood-api`. Runtime: **Python 3.12**. Architecture: **x86_64**.
3. On the **Code** tab, **Upload from → .zip file** and select `api.zip`.
4. In **Runtime settings → Edit**, set the handler to `backend.lambda_handler.handler`.
5. In **Configuration → General configuration**, set **Timeout: 30 seconds** and **Memory: 512 MB**. The default 3-second timeout is too short because the API calls two external services.
6. In **Configuration → Environment variables**, add `WEATHERAPI_KEY`, `WEATHERAPI_LOCATION` and `CORS_ORIGINS` (use `http://localhost:5173` for now). For a longer-lived deployment, keep `WEATHERAPI_KEY` in AWS Secrets Manager or SSM Parameter Store instead of plain text.
7. In **Configuration → Function URL**, create a URL with **Auth type: NONE**. Leave the Function URL's own CORS setting **off**, because FastAPI already handles CORS and enabling both causes duplicate-header errors.
8. Copy the Function URL, for example `https://abc123.lambda-url.ap-south-1.on.aws`.

Test it by opening `<function-url>/api/hotspots` and `<function-url>/api/risk` in a browser.

### Step 3: Build the frontend

Set the API URL (no trailing slash), then build.

macOS/Linux:

```bash
npm ci
VITE_API_BASE_URL="https://abc123.lambda-url.ap-south-1.on.aws" npm run build
```

Windows PowerShell:

```powershell
npm ci
$env:VITE_API_BASE_URL="https://abc123.lambda-url.ap-south-1.on.aws"; npm run build
```

### Step 4: Host the frontend (S3 + CloudFront)

1. **S3 → Create bucket.** Use a unique name and the same region. Keep **Block all public access** enabled.
2. Upload the **contents** of `dist/` (`index.html` and `assets/`) to the bucket root.
3. **CloudFront → Create distribution.** Origin: your S3 bucket with **Origin access control (OAC)**. Viewer protocol policy: **Redirect HTTP to HTTPS**. Default root object: `index.html`.
4. Copy the bucket policy that CloudFront suggests and paste it into **S3 → your bucket → Permissions → Bucket policy**.
5. Wait until the distribution is **Enabled**, then copy its domain, for example `https://d1234abcd.cloudfront.net`.

### Step 5: Connect frontend and backend

In **Lambda → Configuration → Environment variables**, set:

```text
CORS_ORIGINS=https://d1234abcd.cloudfront.net
```

Use the exact origin: `https://`, no trailing slash. Separate multiple origins with commas.

### Step 6: Verify

Open the CloudFront URL. In the browser developer tools (Network tab), `/api/risk` and `/api/hotspots` should return 200. `/api/route-risk` returns 404, which is expected until it is implemented.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| CORS error in the browser console | `CORS_ORIGINS` does not exactly match the CloudFront origin |
| Risk shows 0% / `UNAVAILABLE` | Missing or wrong `WEATHERAPI_KEY`, or Lambda timeout still at 3 seconds. Check CloudWatch logs (**Monitor → View CloudWatch logs**) |
| `403 Forbidden` on the Function URL | Auth type is not `NONE`, or the public-access resource policy is missing |
| `Internal server error` / import error | Wrong handler name, or the zip has an extra folder level |
| `No module named pydantic_core` | Packaged without the `--platform` flags |
| Old content after re-uploading the frontend | Create a CloudFront invalidation for `/*` |

### Updating a deployment

- **Backend:** rebuild `api.zip` and upload it again in Lambda.
- **Frontend:** run `npm run build`, upload the new `dist/` contents to S3, then create a CloudFront invalidation for `/*`.

### Cleaning up

To avoid charges, disable and delete the CloudFront distribution, empty and delete the S3 bucket, and delete the Lambda function. Review account, region, access and cost settings in the console before creating resources.

---

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
4. Never commit credentials, `.env` files, `build/`, `api.zip`, local caches, or generated build and virtual-environment folders.
