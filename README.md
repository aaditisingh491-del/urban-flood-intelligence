# Urban Flood Intelligence

Urban Flood Intelligence is a civic-tech MVP for answering **“Will my road flood?”** It demonstrates how localized flood-risk information can help residents choose safer routes and help city teams identify intervention priorities.

The Bengaluru layer includes a source-backed vulnerability inventory and a manual, risk-aware route-planning workflow. It is not an emergency warning service. Vulnerability locations are not flood incidents, and route results cannot guarantee road safety.

## Features

- Select a source by choosing an in-boundary map point or a validated Bengaluru geocoding suggestion; destinations are restricted to backend inventory IDs.
- Browse source-backed vulnerability records on the separate `/explore` page; the homepage does not contain an inventory list.
- View destination-specific Open-Meteo evening forecast slots and an uncalibrated rainfall-context model score, clearly distinguished from active verified incidents.
- Request OSRM route candidates and screen them against fresh, verified active flood records; no route is represented as confirmed safe.
- Switch between persistent Light Mode and Dark Mode.
- Use a FastAPI backend with optional DynamoDB persistence and a local KML inventory mode.

## Tech stack

- React and TypeScript, bundled with Vite
- Leaflet and React-Leaflet with OpenStreetMap tiles; Lucide icons
- Python and FastAPI, served by Uvicorn
- Optional DynamoDB persistence and a local KML inventory mode
- Open-Meteo geocoding and OSRM routing adapters

## Interactive map data and tile service

The frontend uses Leaflet with the standard OpenStreetMap tile service, which is an external service and requires network access. Map imagery availability and usage limits are governed by OpenStreetMap tile-service policies; the map includes required attribution. The original rainfall model map remains separate from the flood inventory. The Bengaluru route map plots the configured service-area polygon, source-backed KSRSAC vulnerability points, the searched origin, selected inventory destination, and routing-provider geometry. Clicking inside the configured boundary selects the source after backend validation; map clicks never set the destination. Locations in the inventory do not assert a live flood.

### Bengaluru service area

All route origins, geocoding suggestions, inventory destinations, and accepted route geometries are checked against the GeoJSON polygon bundled at `backend/data/bengaluru-service-area.geojson`. It was obtained from the [Bengaluru boundary FeatureServer layer](https://services1.arcgis.com/HmwnYiJTBZ4UkySc/ArcGIS/rest/services/Flooding_zones_in_bengaluru_WFL1/FeatureServer/11) (polygon layer; the service metadata identifies a Bengaluru city boundary). This is the app's operational service area, not a legal or administrative boundary determination. Replace it with an approved GeoJSON polygon by setting `BENGALURU_SERVICE_AREA_GEOJSON` to the file path in the backend environment; restart the API after updates. Backend coordinate checks use polygon containment, not city-name text. Route geometry is checked in projected metres with configurable snapping/boundary tolerances.

The `/explore` route is a separate inventory page. BrowserRouter direct links and refreshes work with Vite's development fallback. For static hosting, configure the existing CloudFront distribution to serve `index.html` for SPA paths (custom 403/404 response mapping to `/index.html`, response code 200), then test a direct `/explore` refresh.

## Project structure

```text
.
├── backend/
│   ├── main.py              # FastAPI app and deterministic demo endpoints
│   └── requirements.txt     # Python dependencies
├── src/
│   ├── main.tsx             # React UI and API integration
│   ├── style.css            # Main responsive styles
│   ├── interactions.css     # Map hit targets and interaction styles
│   └── vite-env.d.ts        # Vite type declarations
├── index.html               # Vite HTML entry point
├── package.json             # Frontend scripts and dependencies
├── package-lock.json        # Locked npm dependency tree
├── requirements.txt         # Root dependency entry point for source deployments
├── tsconfig.json
└── vite.config.ts           # Local /api proxy to FastAPI
```

## Run the frontend locally

Requirements: Node.js 20.19+ (or a supported current LTS release) and Python 3.10+ for the API.

From the project root:

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually <http://localhost:5173>). The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`.

To create a production frontend build:

```bash
npm run build
```

The static site is written to `dist/`.

## Run the FastAPI backend locally

From the project root, create and activate a virtual environment, install the backend requirements, then start Uvicorn:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The API is available at <http://localhost:8000>. Interactive API documentation is at <http://localhost:8000/docs>.

## API endpoints

All routes are prefixed with `/api`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/risk` | Retired generic city-wide score endpoint (HTTP 410); select an inventory ID for destination analysis |
| `POST` | `/api/simulate` | Recalculate demo risk from rainfall, drainage, and start-time changes |
| `GET` | `/api/hotspots` | Read-only endpoint; returns an empty list until verified hotspot scores are available |
| `GET` | `/api/floods` | Paginated flood/exposure inventory and filters |
| `GET` | `/api/floods/summary` | Separate evidence-category counts and storage mode |
| `GET` | `/api/floods/{location_id}/assessment` | Validated inventory destination, nearby verified incidents, provisional forecast-derived score, and Open-Meteo hourly forecast |
| `GET` | `/api/geocode?q=...` | Backend-proxied Open-Meteo place search |
| `GET` | `/api/service-area` | Configured Bengaluru service-area GeoJSON |
| `POST` | `/api/locations/validate` | Validate a manually selected source coordinate |
| `POST` | `/api/routes/alternate` | OSRM route candidates screened against fresh, verified incidents/alerts |
| `GET` | `/health` | Backend health and storage mode |

The generic `/api/risk` endpoint is retired (HTTP 410), and `/api/hotspots` returns no scores until verified hotspot evidence is available. Flood inventory writes happen only through the operator command `python -m backend.ingest_floods`; there is no public ingestion endpoint. Configure deployment authentication and rate limiting before exposing the route API to the public.

Example simulator request:

```json
{
  "rainfall_delta": 20,
  "drainage_delta": 10,
  "start_shift": -2
}
```

## Environment variables

No environment file is required for local development. Local configuration files such as `.env` and `.env.*` are ignored by Git.

| Variable | Used by | Purpose | Default |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Frontend build | API origin prepended to `/api` in a deployed frontend. Leave unset locally to use Vite's `/api` proxy. | Empty |
| `CORS_ORIGINS` | FastAPI backend | Comma-separated allowed frontend origins. Set this to the deployed frontend origin(s) in AWS. | `http://localhost:5173` |
| `VITE_COGNITO_USER_POOL_ID` | Frontend build | Cognito user pool used for sign-in, sign-up, and email verification. | Required for authentication |
| `VITE_COGNITO_CLIENT_ID` | Frontend build | Public app client ID for the Cognito user pool. | Required for authentication |
| `AWS_REGION` | Backend | DynamoDB region; credentials come from the standard AWS provider chain or an attached role. | Unset |
| `DYNAMODB_FLOOD_TABLE` | Backend | DynamoDB table name. Unset selects local KML mode. | Unset |
| `OSRM_BASE_URL` | Backend | OSRM-compatible routing API. | Public OSRM demo |
| `FLOOD_HAZARD_BUFFER_METERS` | Backend | Screening distance for verified active point hazards, clamped to 100–5000 m. | 500 |
| `BENGALURU_SERVICE_AREA_GEOJSON` | Backend | Optional path to replace the bundled service-area polygon. | Bundled GeoJSON |
| `BENGALURU_ROUTE_SNAP_TOLERANCE_METERS` | Backend | Maximum endpoint-to-route snapping difference. | 5000 |
| `BENGALURU_ROUTE_BOUNDARY_TOLERANCE_METERS` | Backend | Small geometry tolerance beyond the service polygon for routing edges. | 1000 |

For local authentication, set the Cognito values in `.env.local`. For a deployed frontend build, set `VITE_API_BASE_URL` to the App Runner service URL and provide the Cognito values before running `npm run build`. Set `CORS_ORIGINS` on App Runner to the exact frontend origin so browsers can access the API. Do not put credentials or secrets in frontend environment variables; Vite variables are included in the browser bundle.

## Flood records, data limits, and routing

The bundled `backend/data/flood_prone_locations.kml` contains 200 named point locations in Bengaluru. The source listing identifies KSRSAC as the source: [OpenCity — Flooding Locations in Bengaluru Urban](https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban). The imported layer is a static vulnerability inventory. The source record does not supply observed timestamps, water levels, current status, or road closures, so API records are `event_type=exposure_location`, `status=unverified`, `confidence=low`, and `data_type=static_vulnerability_inventory`. They are not counted as active incidents and are never route closures. Confirm the dataset's current reuse terms with the publisher before redistributing beyond this demonstration; the repository copy has no accompanying license file.

NDMA SACHET publishes current CAP alerts and a documented CAP XML endpoint; its consumer guide requires an agency-issued identifier and ETag caching. No feed identifier or subscription credentials are configured here, so the app does not ingest or count those alerts. See the [SACHET CAP portal](https://sachet.ndma.gov.in/CapFeed) and [CAP integration guide](https://sachet.ndma.gov.in/docs/Integration_Guide_For_Agencies.pdf). CWC publishes official flood bulletins, and IMD documents rainfall APIs, but the IMD API requires the consumer public IP to be whitelisted; neither was used as a location-level machine feed in this build. Existing Open-Meteo weather integration is a rainfall/model input, not an observed flood feed. Open-Meteo free API use is limited to non-commercial use and requires CC BY 4.0 attribution; commercial use requires its paid service. See [Open-Meteo terms](https://open-meteo.com/en/terms) and [API documentation](https://open-meteo.com/en/docs). The dashboard reports zeros for current verified floods, official alerts, and historical incidents until such records are sourced and ingested. Do not interpret that as a flood-free city.

Geocoding is proxied through Open-Meteo so no key reaches the browser. Routing uses an OSRM-compatible provider; `router.project-osrm.org` is best-effort, limited to reasonable non-commercial use, and requests should not exceed one per second. Provide OpenStreetMap and OSRM attribution. See [OSRM demo service guidance](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server). For production, configure a contracted or self-hosted route service and add service-level rate limiting/authentication.

Routes are risk-aware candidates, not safety assurances. Only fresh (last verified within 24 hours), high-confidence active observations or official alerts are considered route hazards, using a configurable point buffer (`FLOOD_HAZARD_BUFFER_METERS`, default 500 m). Historical and inventory points are contextual. The API returns a recommended candidate only when it avoids the currently mapped active verified point hazards; `safe_route_verified` remains false because point reports cannot establish road conditions. When there is no verified current flood data, the UI explicitly says route safety cannot be verified. A point buffer cannot establish road flooding or safety; official closures and hazard polygons should replace point screening when available.


The homepage does not embed the vulnerability inventory list; inventory browsing stays on `/explore`. Selecting an inventory destination fetches `/api/floods/{location_id}/assessment`, which resolves the destination coordinates from backend inventory rather than trusting browser coordinates. The response reports verified active records within 1 km, the static inventory source, and hourly Open-Meteo values (precipitation in mm, precipitation probability in %, temperature in °C, WMO weather code) with Asia/Kolkata valid timestamps. The displayed 0–100 score is the existing uncalibrated rainfall-context model, never a probability; it is omitted when the forecast is unavailable. Rainfall does not confirm flooding. The forecast UI shows returned evening hours only and reports when no upcoming evening slots exist.

The theme control supports Light Mode and Dark Mode, persists `floodsense-theme` in local storage, and initializes the saved theme before the app renders. Dark mode is the default when no preference is saved.

## Local setup (Windows PowerShell)

From the repository root, install the checked-in frontend dependencies and backend requirements:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env.local` for the frontend placeholders. Vite loads `VITE_*` settings from `.env.local`. Backend variables are process environment variables; for local DynamoDB-free mode, only the default `CORS_ORIGINS` is needed:

```powershell
$env:CORS_ORIGINS = "http://localhost:5173"
uvicorn backend.main:app --reload --port 8000
```

In a second PowerShell window:

```powershell
npm run dev
```

From a fresh Windows PowerShell session, the setup and backend command are:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Copy-Item .env.example .env.local
$env:CORS_ORIGINS = "http://localhost:5173"
uvicorn backend.main:app --reload --port 8000
```

Open a second PowerShell window at the project root and run `npm run dev`. `.env.local` is for Vite settings; AWS settings are backend process variables (or supplied by your AWS profile/role).

For production build and tests:

```powershell
npm run build
python -m pytest -q
npm test
```

Without `DYNAMODB_FLOOD_TABLE`, the API reads the bundled KML as `storage_mode=local_kml`; it does not write to AWS. Geocoding and route lookup need network access.

## DynamoDB table and ingestion

Flood storage uses a separate configurable DynamoDB table with string partition key `PK` and string sort key `SK`, on-demand billing, and deterministic keys `PK=FLOOD#<location_id>`, `SK=RECORD#<event_type>#<source_record_id-or-observed_at-or-location_id>`. The eight items in your existing table have not been inspected from this checkout; do not point `DYNAMODB_FLOOD_TABLE` at it. The checked-in legacy `hotspot_repository.py` belongs to the unrelated hotspot snapshot feature and queries a `location_id` key; it is not used by flood storage. Because the given `PK`/`SK` table's purpose is unknown and it is already populated, configure a separate flood table unless you personally verify its purpose and decide to use it. This code validates the PK/SK names and String types before scanning or writing. Scans are paginated; for a larger multi-city feed, use geohash/H3 cell partitions or a purpose-built geospatial index because DynamoDB has no native spatial index.

Set `AWS_REGION` and `DYNAMODB_FLOOD_TABLE` and supply credentials through the standard AWS credential chain or the App Runner instance role. The least-privilege example is `infra/flood-table-policy.json`; replace `REGION`, `ACCOUNT_ID`, and the table name. Flood API reads require `dynamodb:Scan` and `dynamodb:DescribeTable`; ingestion requires `dynamodb:BatchWriteItem` and `dynamodb:DescribeTable`. Grant only the actions required by the task role.

Create a table only when you choose to provision it (no AWS resource is created by this app):

```powershell
$env:AWS_REGION = "<your-table-region>"
$env:DYNAMODB_FLOOD_TABLE = "<your-new-flood-table-name>"
aws dynamodb create-table --cli-input-json file://infra/dynamodb-flood-table.json --region $env:AWS_REGION
aws dynamodb wait table-exists --table-name $env:DYNAMODB_FLOOD_TABLE --region $env:AWS_REGION
python -m backend.ingest_floods --dry-run
python -m backend.ingest_floods
```

The command idempotently upserts source-backed KML inventory records with `batch_writer()` retries. A successful command means DynamoDB accepted the batch writes; this repository session has no configured table/credentials and no writes have been performed. Verify records in the DynamoDB console and query `GET /api/floods` to confirm `storage_mode=dynamodb`.

### Beginner AWS setup and teammate uploads

1. In AWS Console, choose **DynamoDB → Tables**. Open the existing table and note its exact table name, region shown in the console region selector, and **Overview → General information → Primary key**. Verify partition and sort key names and types. Do not use the existing populated table unless you have confirmed its purpose and are authorized to add flood records. This code expects String `PK` + String `SK`; the safest default is a separate table.
2. Create a separate table only after you choose its name/region: use **Create table**, partition key `PK` (String), sort key `SK` (String), and **Customize settings → On-demand**. No resource is created automatically by this app. `infra/dynamodb-flood-table.json` is a template; replace its table name with your chosen name before using AWS CLI.
3. On your computer, authenticate with AWS IAM Identity Center (`aws configure sso` then `aws sso login --profile <profile>`) or another standard AWS profile. Do not put access keys in this repository or send personal keys to teammates. AWS SDK uses the standard credential chain; deployment should use an attached task/instance role.
4. In PowerShell, set `$env:AWS_PROFILE = '<your-profile>'`, `$env:AWS_REGION = '<region>'`, and `$env:DYNAMODB_FLOOD_TABLE = '<table-name>'`. Keep these process-scoped or in an ignored local config. `.env.example` contains blank placeholders only.
5. Use `infra/flood-read-policy.json` for the API role (`DescribeTable` + `Scan`) and `infra/flood-ingest-policy.json` for an upload-only teammate (`DescribeTable` + `BatchWriteItem`). `infra/flood-table-policy.json` combines both when a single role must serve both purposes. Replace the account, region, and table placeholders. Policies are table-scoped. Teammates should assume their own role/profile and receive no personal credentials from you.
6. Validate and preview a file: `python -m backend.ingest_floods --input path\to\records.json --dry-run`. Then write: `python -m backend.ingest_floods --input path\to\records.json`. For repository KML inventory use the same commands without `--input`. A zero/error exit or write failure is not success; summary counts are printed. `backend/data/sample-upload.json` is deliberately marked sample-only and will be skipped even without dry-run.
7. Verify in **DynamoDB → Explore table items**. Filter partition key beginning `FLOOD#`; confirm `SK` and source attributes. Then call `GET /api/floods` with the backend configured for the same table. Do not count sample-only records as incidents.

Upload format: `.json` may be an array or `{"records": [...]}`; `.csv` uses the same field names as headers. Required fields are `location_id`, `location_name`, `city`, `state`, `country`, `latitude`, `longitude`, `event_type`, `status`, `confidence`, `source_name`, absolute HTTP(S) `source_url`, timezone-aware ISO 8601 `fetched_at`, and `data_type`. `event_type` must be `observed_flood`, `official_flood_alert`, `historical_flood`, `rainfall_based_risk`, or `exposure_location`; status must be `active`, `resolved`, `historical`, or `unverified`. Coordinates must be numeric and in range; severity is low/moderate/high/critical or null. Optional timestamps (`observed_at`, `last_verified_at`, `expires_at`) must be ISO 8601 with timezone; they are normalized to UTC. `location_id` must be a stable ID; include upstream `source_record_id` when available. Duplicate IDs in one file are skipped; deterministic PK/SK upserts are idempotent. DynamoDB adds `ingested_at` separately from source `fetched_at`. Source evidence must be genuine; historical records remain historical. `sample_only=true` rows are always skipped.

Active `observed_flood` and `official_flood_alert` uploads additionally require `confidence=high` or `verified` and an `observed_at` or `last_verified_at` timestamp. `historical_flood` requires `status=historical` or `resolved`. Confidence must be `none`, `low`, `medium`, `high`, or `verified`. Optional `rainfall_mm` and `water_level` must be non-negative numbers. The ingestion validator checks data shape and provenance fields; it cannot independently authenticate the human uploader's source claims.

Route requests accept `{ "origin": {"latitude": 12.9, "longitude": 77.6}, "destination_location_id": "<id from GET /api/floods>", "travel_mode": "driving" }`. The API resolves destination coordinates from the configured inventory and rejects missing or unknown IDs and raw destination coordinates.

Troubleshooting: `NoCredentialsError` means log in with SSO/profile or attach a role; `ResourceNotFoundException` usually means wrong table name/region; `AWS_REGION` missing means set the selected table region; schema mismatch means the table must use String `PK` and String `SK`; `AccessDeniedException` means update the specific role with the table-scoped actions above; CORS errors mean add the exact browser origin to `CORS_ORIGINS`. DynamoDB integration code, validation, and mocked tests are implemented. Live AWS access, existing table inspection, real IAM authorization, and any upload have not been tested from this workspace.

## Deployment configuration

Keep the existing S3/CloudFront + App Runner architecture. Configure the App Runner role with the least-privilege flood-table policy, set `AWS_REGION`, `DYNAMODB_FLOOD_TABLE`, `OSRM_BASE_URL`, and exact `CORS_ORIGINS`, and deploy the existing root `requirements.txt` / `Procfile` configuration. Build the frontend with `VITE_API_BASE_URL` set to the API origin and upload `dist/` to the existing private S3 origin. Do not place AWS keys or provider secrets in `VITE_*` settings. The free Open-Meteo endpoints and public OSRM service are not an SLA-backed production setup.

Sign-in is handled by Amazon Cognito directly from the browser; the FastAPI backend serves flood-risk data and does not provide authentication endpoints. Run the API locally with the command above, or deploy it and configure `VITE_API_BASE_URL` and `CORS_ORIGINS` for the frontend and backend to communicate.

## Current MVP limitations

- The rainfall risk formula and municipal hotspot panel are demonstrations, not calibrated forecasts or official alerts.
- The flood inventory is a static KSRSAC vulnerability layer with 200 points, not an active incident feed or road-closure feed.
- Open-Meteo geocoding and public OSRM routing are external best-effort services. Route results cannot establish that roads are safe.
- The simulator is a small weighted formula, not a calibrated hydrology or machine-learning model.
- DynamoDB is optional and was not provisioned by this repository. Local mode reads the bundled inventory without AWS credentials.
- No live verified flood reports, water-level sensors, emergency alert integrations, or municipal closure feeds are currently populated.
- Route and intervention results are decision-support demonstrations; follow official emergency guidance.

## AWS deployment architecture

The suggested MVP architecture uses AWS services configured manually in the AWS Management Console:

```text
Browser
  ├── CloudFront (HTTPS/CDN) ── private S3 bucket (Vite static build)
  └── HTTPS ── AWS App Runner (FastAPI API)
```

CloudFront serves the static Vite build from a private S3 origin using Origin Access Control (OAC). App Runner hosts the FastAPI service from the source repository. The frontend calls the App Runner URL; `CORS_ORIGINS` on App Runner allows the CloudFront origin. Flood records use DynamoDB when configured; local development reads the bundled KML inventory and does not claim an AWS write.

## Manual AWS Console deployment

No AWS infrastructure is provisioned by this repository. It contains no CDK, Terraform, CloudFormation, Pulumi, or other infrastructure-as-code.

1. **Create the API service.** In the AWS Console, create an App Runner service from the GitHub repository and branch. Select the Python runtime offered in the console. Use the repository root as the source directory, set the build command to `pip install -r requirements.txt`, and set the start command to `uvicorn backend.main:app --host 0.0.0.0 --port 8000`. Configure the App Runner service's HTTP port as `8000`.
2. **Set API configuration.** In App Runner service environment variables, set `CORS_ORIGINS` to the eventual CloudFront distribution origin, for example `https://d123example.cloudfront.net`. Redeploy after changing it. Copy the resulting App Runner service URL.
3. **Build the frontend for the API.** In a local terminal, set `VITE_API_BASE_URL` to the App Runner URL, then run `npm run build`. For example: `VITE_API_BASE_URL="https://your-service.region.awsapprunner.com" npm run build`. This value is a public API URL, not a secret.
4. **Create the static origin.** In the AWS Console, create an S3 bucket for the frontend. Keep Block Public Access enabled. Upload the *contents* of `dist/` to the bucket root.
5. **Create CloudFront.** Create a CloudFront distribution with the S3 bucket as its origin. Use Origin Access Control so CloudFront can read the private bucket, set the default root object to `index.html`, and allow HTTPS. Apply the bucket policy suggested by the CloudFront console.
6. **Finish and verify.** Copy the CloudFront distribution domain, set that exact origin in App Runner's `CORS_ORIGINS`, and redeploy the API if needed. Invalidate the CloudFront cache after uploading a later build. Open the CloudFront URL and confirm the API data loads.

These instructions are a starting point for a demo deployment. Review AWS account, region, access, and cost settings in the console before creating services.

## Contributing

1. Create a branch for your change.
2. Keep demo data separate from UI behavior where practical, and preserve the local no-external-API workflow.
3. Before opening a pull request, run `npm run build` and verify the affected API route locally.
4. Never commit credentials, `.env` files, local caches, or generated build/virtual-environment folders.

## Hero photograph attribution

Hero carousel photographs are historical demonstration imagery, not live Bengaluru observations.

- **Hyderabad (14 October 2020):** “2020 Hyderabad floods.jpg” by Strike Eagle, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:2020_Hyderabad_floods.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The local copy is resized to 1600 px wide for web display.
- **Tatanagar, Bengaluru (22 October 2024):** “Flooding in Bangalore.jpg” by Shyamal, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Flooding_in_Bangalore.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The local 1280 px image is served as a Commons thumbnail.
- **Bhubaneswar (31 August 2025):** “Urban flooding in Bhubaneswar.jpg” by Nathularog, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Urban_flooding_in_Bhubaneswar.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The local 1280 px image is served as a Commons thumbnail.
- **Rockingham, Western Australia (5 June 2023):** “Flooded stormwater drainage canal at Rockingham, Western Australia, June 2023 05.jpg” by Calistemon, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Flooded_stormwater_drainage_canal_at_Rockingham,_Western_Australia,_June_2023_05.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The local image is a 1280 px Commons thumbnail.
- **Arvada, Colorado (15 September 2013):** “Sandbags for colorado flood.jpg” by Air National Guard Staff Sgt. Nicole Manzanares, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sandbags_for_colorado_flood.jpg), public domain as a U.S. federal government work.
