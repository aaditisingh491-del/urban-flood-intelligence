# Urban Flood Intelligence

Urban Flood Intelligence is a civic-tech MVP for answering **“Will my road flood?”** It demonstrates how localized flood-risk information can help residents choose safer routes and help city teams identify intervention priorities.

The current demo uses Bengaluru locations and sample data. The Leaflet street map is interactive, but its markers show only coordinates explicitly returned by the risk API. It is not a live flood map or a warning service.

## Features

- Search demo roads and neighbourhoods; pan and zoom the interactive map and inspect the backend-provided demo point.
- View a risk score, severity, peak window, rainfall, confidence, hourly outlook, and contributing factors.
- See practical safety suggestions and compare a safer route with the fastest route.
- Change rainfall, drainage capacity, and rainfall start time in the what-if simulator.
- Switch to Municipality Mode to inspect ranked hotspots and a sample drainage intervention.
- Use a FastAPI backend for risk, route, scenario, and hotspot demo data.

## Tech stack

- React and TypeScript, bundled with Vite
- Leaflet and React-Leaflet with OpenStreetMap tiles; Lucide icons
- Python and FastAPI, served by Uvicorn
- Deterministic mock data in the API; no database or external GIS/weather API is required

## Interactive map data and tile service

The frontend uses Leaflet with the standard OpenStreetMap tile service, which is an external service and requires network access. Map imagery availability and usage limits are governed by OpenStreetMap tile-service policies; the map includes required attribution. The risk endpoint currently returns one Bengaluru demo coordinate. The hotspot endpoint returns names and sample scores without coordinates, so the municipality map does not invent hotspot marker positions. Route geometry is also not available in the current API; route alternatives remain in the existing comparison panel rather than being drawn as paths.

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

Requirements: Node.js 20 or a compatible current LTS release, plus Python 3.10+ for the API.

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
| `GET` | `/api/risk` | Demo risk score, severity, peak time, rainfall, and confidence |
| `POST` | `/api/route-risk` | Safer and fastest demo route options; accepts `{}` and returns `routes` with `name`, `travel_time`, `flood_risk`, and `recommended` |
| `POST` | `/api/simulate` | Recalculate demo risk from rainfall, drainage, and start-time changes |
| `GET` | `/api/hotspots` | Ranked, read-only demo flood hotspots |

These demo endpoints are public and stateless: they require no authentication and do not persist changes. `POST /api/route-risk` only returns fixed demo route options; it does not create or update hotspots. There is intentionally no `POST /api/hotspots` endpoint. Hotspot changes require a separately designed administrative workflow, authorization policy, and persistent data store.

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

For local authentication, set the Cognito values in `.env.local`. For a deployed frontend build, set `VITE_API_BASE_URL` to the App Runner service URL and provide the Cognito values before running `npm run build`. Set `CORS_ORIGINS` on App Runner to the exact frontend origin so browsers can access the API. Do not put credentials or secrets in frontend environment variables; Vite variables are included in the browser bundle.

Sign-in is handled by Amazon Cognito directly from the browser; the FastAPI backend serves flood-risk data and does not provide authentication endpoints. Run the API locally with the command above, or deploy it and configure `VITE_API_BASE_URL` and `CORS_ORIGINS` for the frontend and backend to communicate.

## Current MVP limitations

- Scores, rainfall, roads, routes, and hotspots are deterministic demo data, not operational forecasts.
- The map is a stylized illustration with selectable demo roads. It has no real map tiles, geocoding, GPS, or routing.
- The simulator is a small weighted formula, not a calibrated hydrology or machine-learning model.
- No database, authentication, notifications, live weather, sensor feeds, monitoring, or municipal system integrations are included.
- Route and intervention results illustrate the workflow and should not be used for real-world decisions.

## AWS deployment architecture

The suggested MVP architecture uses AWS services configured manually in the AWS Management Console:

```text
Browser
  ├── CloudFront (HTTPS/CDN) ── private S3 bucket (Vite static build)
  └── HTTPS ── AWS App Runner (FastAPI API)
```

CloudFront serves the static Vite build from a private S3 origin using Origin Access Control (OAC). App Runner hosts the FastAPI service from the source repository. The frontend calls the App Runner URL; `CORS_ORIGINS` on App Runner allows the CloudFront origin. The MVP uses no AWS database or other managed data service.

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
