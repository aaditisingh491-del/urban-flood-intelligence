# Urban Flood Intelligence --- FloodSense

**Know the risk before you go.**

Urban Flood Intelligence (FloodSense) is a civic-tech prototype designed
to help people understand rainfall-related flood exposure, explore
vulnerable locations, compare route alternatives, and prepare for heavy
rain. It combines weather forecasts, a Bengaluru service-area boundary,
vulnerability inventory data, and route analysis in one interface.

> **Project status:** Hackathon/MVP prototype. Weather forecasts and
> routing are retrieved from external services, while flood-risk scores
> and vulnerability data have important limitations. FloodSense is not
> an official flood-warning system, and it cannot guarantee that a road
> or route is safe.

## Why this matters

Urban flooding can make basements, underpasses, drains, and low-lying
roads dangerous with little notice. Citywide weather forecasts do not
identify every dangerous street or establish whether a particular road
is passable.

FloodSense explores how more local information could help residents make
informed travel decisions and help teams investigate vulnerable
locations. Its present data and models are not validated sufficiently to
claim lives saved, predict exact flood depths, or replace official
warnings.

## Features

### Flood-risk exploration

-   Explore flood-vulnerability locations on a map.
-   Search for places using the backend geocoding service.
-   View available rainfall forecasts and destination-specific
    assessments.
-   Distinguish forecast-derived risk from verified flood incidents and
    official alerts.
-   Browse the inventory on the separate Explore page.

### Route comparison

-   Select an origin and an inventory-backed destination.
-   Request alternative routes through an OSRM-compatible routing
    service.
-   Compare available route candidates and their distance/time
    information.
-   Screen candidate routes against fresh, verified flood observations
    and official alerts available to the application.
-   Select a route and view its geometry on the map.

Route screening is limited by the evidence available to the application.
A route that avoids mapped point hazards is **not verified safe**.

### Smart Flood Alerts

-   Save Bengaluru locations in the browser.
-   Configure rainfall and precipitation-probability thresholds.
-   Manually refresh forecast-based alerts for the next six hourly
    forecast slots.
-   Review alert history and optionally enable browser notifications.

Alerts are based on forecast thresholds, not confirmed flooding. The
application does not continuously monitor locations in the background.
Saved locations, thresholds, notification preferences, and alert history
are stored in browser local storage on the current browser/device.

### Emergency Mode

-   Open a simplified flood-preparedness and safety guide.
-   Use the locally bundled instructions after the page has loaded.
-   Access official emergency resources, including India's emergency
    number **112**, NDMA SACHET, and the Karnataka State Disaster
    Management Authority.
-   Use the preparedness checklist stored in browser local storage.

Emergency Mode does not make the entire application work offline. Maps,
forecasts, route calculations, backend assessments, and external
resources require connectivity. Follow official emergency instructions
and responder advice.

### Interface and authentication

-   Light Mode and Dark Mode.
-   Amazon Cognito sign-in using AWS Amplify v6 Auth APIs.
-   A dedicated `/signin` route.
-   Responsive map-based interface with accessible controls.

Authentication requires valid Cognito configuration and must be tested
with an actual account. The application does not create or modify AWS
Cognito resources automatically.

## How it works

``` text
React + TypeScript + Vite
          |
          | /api requests
          v
Python + FastAPI backend
          |
          +-- Open-Meteo geocoding and weather forecasts
          +-- Elevation and service-area validation
          +-- Flood inventory and assessment
          +-- OSRM-compatible route alternatives
          +-- Optional DynamoDB persistence

Amazon Cognito + Amplify v6
          |
          +-- Browser-based sign-in
```

The frontend communicates with FastAPI for location validation,
forecasts, flood records, assessments, and routing. Cognito handles
authentication separately in the browser.

## Technology stack

  Area                      Technology
  ------------------------- ----------------------------------------
  Frontend                  React, TypeScript, Vite
  Maps                      Leaflet and OpenStreetMap tiles
  Backend                   Python, FastAPI, Uvicorn
  Weather and geocoding     Open-Meteo
  Routing                   OSRM-compatible routing service
  Authentication            Amazon Cognito, AWS Amplify v6 Auth
  Optional storage          Amazon DynamoDB
  Testing                   pytest and frontend test scripts
  Deployment architecture   AWS App Runner, private S3, CloudFront

## Service area and data sources

The configured operational service area is Bengaluru. Backend validation
uses the polygon in:

`backend/data/bengaluru-service-area.geojson`

The application uses a bundled KSRSAC vulnerability inventory. These
records describe contextual vulnerability or exposure; they are not
proof that a flood is occurring at that location now.

Open-Meteo provides weather forecasts and geocoding. OSRM-compatible
services provide candidate routes. OpenStreetMap provides map tiles.

The application does not currently have a configured, comprehensive live
feed of verified flood reports, road closures, water-level sensors, or
official flood incidents. Government resources are linked for users;
those links should not be described as automatically ingested data
unless a verified integration has been configured.

### Important interpretation rules

-   Rainfall forecasts do not confirm that flooding has occurred.
-   A model score is not a calibrated probability of flooding.
-   Elevation alone does not establish local flood risk.
-   A vulnerability inventory is not a live incident feed.
-   Route alternatives are candidates, not safety guarantees.
-   An empty incident list does not mean that a city is flood-free.

## Risk model and limitations

The application may show rainfall-derived risk assessments, inventory
context, and route screening. These outputs depend on the data currently
available to the backend.

The risk model has not been established as a calibrated hydrological or
machine-learning flood prediction system. Historical validation,
reliable local drainage measurements, verified incident feeds, and field
testing are needed before the outputs can support operational decisions.

Do not use FloodSense as a substitute for official warnings, evacuation
instructions, emergency responders, or local authority guidance.

## Run locally on Windows

### Prerequisites

-   Python installed and available as `python`
-   Node.js compatible with the project's Vite version
-   npm
-   Git, if cloning the repository

### 1. Clone the repository

``` powershell
git clone https://github.com/aaditisingh491-del/urban-flood-intelligence.git
cd urban-flood-intelligence
```

If you already have the repository, open PowerShell in its project root
instead.

### 2. Install frontend dependencies

``` powershell
npm ci
```

If `npm ci` reports that the lockfile is missing or inconsistent,
inspect the error before deciding whether `npm install` is appropriate.

### 3. Set up the Python backend

``` powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

If PowerShell blocks virtual-environment activation, you can use the
environment's Python executable directly:

``` powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### 4. Start the backend

From the project root, open a PowerShell terminal:

``` powershell
$env:CORS_ORIGINS = "http://localhost:5173"
python -m uvicorn backend.main:app --reload --port 8000
```

If your checkout uses a different ASGI module, use the module path
defined by that checkout's deployment configuration.

API documentation, when the backend is running, is available at:

`http://localhost:8000/docs`

### 5. Start the frontend

Open a **second PowerShell terminal** in the project root:

``` powershell
npm run dev
```

Open:

`http://localhost:5173`

Vite uses the project's development configuration to proxy API requests
to the local backend.

### 6. Build and test

``` powershell
npm run build
python -m pytest -q
npm test
```

Run the commands supported by the scripts in `package.json`. A
successful build does not by itself prove that Cognito authentication,
external services, or a deployed AWS environment work correctly.

## Environment configuration

### Frontend

Create `.env.local` in the project root if you need to configure
frontend environment variables. The file is intended for local
configuration and should not be committed.

``` dotenv
VITE_API_BASE_URL=
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_CLIENT_ID=
```

For local development, leave `VITE_API_BASE_URL` empty when using the
Vite `/api` proxy.

Set the Cognito variables to the appropriate existing user pool ID and
public app client ID for your environment. Vite exposes variables
prefixed with `VITE_` to the browser, so **never put AWS access keys,
client secrets, or other private credentials in them**.

Restart the frontend after changing environment variables.

### Public account registration

The sign-in page uses the existing Amazon Cognito User Pool through Amplify v6. It now offers **Create an account** and uses Cognito `SignUp` and `ConfirmSignUp`; email confirmation remains controlled by the existing pool configuration. This repository has no CDK, CloudFormation, Terraform, or other Cognito infrastructure definition, so a frontend change cannot turn on registration in the live pool.

If Cognito responds that sign-up is not permitted, an administrator must enable it in the existing pool: open **Amazon Cognito → User Pools → the existing pool → Sign-up → Self-service sign-up → Edit**, select **Enable self-registration**, and save. Keep the pool's verification/confirmation settings and app client unchanged. AWS warns that this allows anyone with access to the public app client to attempt registration, so enable it only if public sign-up is intended. Cognito must also have a working email verification method for code confirmation. AWS's instructions are in [Allow self-service sign-up](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html).

No AWS resource was changed by this repository update. After the pool setting is enabled, restart/redeploy the frontend and test sign-up, email confirmation, and sign-in using a new test address.

### Backend

Backend settings are supplied through environment variables or the
deployment environment. Depending on the features enabled, these can
include:

  -----------------------------------------------------------------------
  Variable                            Purpose
  ----------------------------------- -----------------------------------
  `CORS_ORIGINS`                      Allowed frontend origins

  `AWS_REGION`                        AWS region for optional DynamoDB
                                      storage

  `DYNAMODB_FLOOD_TABLE`              Optional flood inventory table

  `OSRM_BASE_URL`                     Configured routing service URL

  `BENGALURU_SERVICE_AREA_GEOJSON`    Optional path to a service-area
                                      polygon
  -----------------------------------------------------------------------

Keep backend credentials out of source control. Use an AWS profile or
IAM role rather than committing access keys.

Without `DYNAMODB_FLOOD_TABLE`, the backend can use its configured local
inventory mode. DynamoDB resources are not created automatically.

## API reference

The exact routes and schemas are defined by the FastAPI application. The
current implementation includes routes for the following functions;
inspect `/docs` on the running backend for the exact methods,
parameters, and response schemas.

  ----------------------------------------------------------------------------
  Endpoint                                 Purpose
  ---------------------------------------- -----------------------------------
  `/health`                                Backend health and storage mode

  `/api/floods`                            Flood and exposure inventory

  `/api/floods/summary`                    Inventory summary by evidence
                                           category

  `/api/floods/{location_id}/assessment`   Destination assessment and
                                           available forecast context

  `/api/geocode?q=...`                     Backend-proxied place search

  `/api/service-area`                      Configured service-area GeoJSON

  `/api/locations/validate`                Validate a source coordinate

  `/api/locations/forecast`                Forecast for validated coordinates

  `/api/routes/alternate`                  Request route alternatives and
                                           hazard screening

  `/api/hotspots`                          Hotspot endpoint; populated results
                                           depend on available evidence

  `/api/risk`                              Retired endpoint; returns HTTP 410
                                           in the current implementation

  `/api/simulate`                          Recalculate the demonstration risk
                                           scenario
  ----------------------------------------------------------------------------

Flood inventory ingestion is an operator-side task, not a public
endpoint.

## Optional DynamoDB storage

DynamoDB persistence is optional. When enabled, the flood table is
expected to use a string partition key `PK` and a string sort key `SK`,
as validated by the current implementation.

Before configuring a table:

1.  Confirm the intended AWS account and region.
2.  Verify the table name and key schema.
3.  Prefer a separate flood table unless an existing table's purpose and
    schema have been confirmed.
4.  Configure the appropriate IAM permissions for reading or ingesting
    records.
5.  Run ingestion in dry-run mode before writing data.
6.  Verify written records and API results.

The repository includes infrastructure templates and policy examples.
Review their placeholders and permissions before using them. No table,
policy, or other AWS resource is created automatically by running the
application.

Only upload records with genuine source evidence. Sample-only data must
not be presented as verified incidents.

## Deployment overview

The intended deployment architecture is:

``` text
Browser
   |
   +-- HTTPS --> CloudFront --> Private S3 frontend
   |
   +-- HTTPS --> AWS App Runner --> FastAPI backend
                                      |
                                      +-- Optional DynamoDB
```

For deployment:

1.  Configure the backend service to install the root `requirements.txt`
    and start the FastAPI application using the repository's deployment
    configuration.
2.  Configure the backend's CORS origins and required environment
    variables.
3.  Build the frontend with the correct deployed API origin in
    `VITE_API_BASE_URL`.
4.  Upload the generated `dist/` contents to the private S3 origin.
5.  Configure CloudFront access to the bucket and SPA fallback behavior.
6.  Test direct loading and refreshing of routes such as `/signin`,
    `/explore`, and `/alerts`.
7.  Test authentication, backend connectivity, map loading, and routing
    in the deployed environment.

Use IAM roles and managed secrets for production. Public weather and
routing services may have usage restrictions and are not a substitute
for an SLA-backed production service.

## Roadmap

-   Validate risk scores against historical urban waterlogging events.
-   Integrate verified, location-specific flood observations and
    official alerts where reliable sources and permissions are
    available.
-   Improve route hazard coverage and show data freshness clearly.
-   Validate the model using local terrain, drainage, and observed flood
    data.
-   Test alert lead time, false-positive rate, and user response in a
    controlled pilot.
-   Improve accessibility, resilience, and automated test coverage.
-   Establish operational monitoring and service-level expectations
    before any real-world emergency use.

## Contributing

1.  Create a branch for your change.
2.  Keep demo data separate from verified observations and official
    alerts.
3.  Label provisional or forecast-derived values clearly.
4.  Run the frontend build and relevant backend/frontend tests before
    opening a pull request.
5.  Never commit credentials, `.env` files, local caches, generated
    build output, or virtual-environment folders.

## Safety notice

FloodSense is an experimental decision-support prototype. It is not an
emergency service, official warning system, or guarantee of route
safety. In an emergency, call **112** in India and follow instructions
from official authorities and emergency responders.
