

import React, { useEffect, useState } from 'react';

import './cognito';

import { createRoot } from 'react-dom/client';

import {

  Activity,

  ArrowDownRight,

  ArrowRight,

  CarFront,

  ChevronDown,

  CloudRain,

  Clock3,

  Compass,

  Droplets,

  LocateFixed,

  MapPin,


  Minus,

  Plus,

  Search,

  ShieldCheck,

  SlidersHorizontal,

  Sparkles,

  UserRound,

  Waves,

} from 'lucide-react';

import './style.css';

import './interactions.css';

import AuthModal from './AuthModal';
import InteractiveMap from './InteractiveMap';

import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';

type AppUser = {
  username: string;
  firstName: string;
  email: string;
};

type Risk = {

  risk: number;

  level: string;

  peak_time: string;

  rainfall: number;

  confidence: string;

  coordinates?: { latitude: number; longitude: number };

};

type RouteOption = {

  name: string;

  travel_time: number;

  flood_risk: number;

  recommended: boolean;

};

type HotspotRecord = {

  name: string;

  risk: number;

};

const initial: Risk = {

  risk: 78,

  level: 'HIGH',

  peak_time: '7:00 PM',

  rainfall: 42,

  confidence: 'HIGH',

};

const hours = [

  ['5 PM', 42],

  ['6 PM', 63],

  ['7 PM', 91],

  ['8 PM', 78],

  ['9 PM', 55],

  ['10 PM', 28],

] as const;

const hourLevel = (value: number) =>

  value >= 85

    ? 'EXTREME'

    : value >= 60

      ? 'HIGH'

      : value >= 40

        ? 'MODERATE'

        : 'LOW';

const API_BASE = (

  import.meta as ImportMeta & {

    env: { VITE_API_BASE_URL?: string };

  }

).env.VITE_API_BASE_URL || '';

const api = async <T,>(

  path: string,

  init?: RequestInit

): Promise<T | null> => {

  try {

    const response = await fetch(`${API_BASE}/api${path}`, init);

    return response.ok ? await response.json() : null;

  } catch {

    return null;

  }

};

function App() {

  const [authOpen, setAuthOpen] = useState(false);
  const [riskCoordinates, setRiskCoordinates] = useState<{ latitude: number; longitude: number } | null>({ latitude: 12.9352, longitude: 77.6245 });
  const [mapRisk, setMapRisk] = useState(initial.risk);

  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [mode, setMode] = useState<'citizen' | 'city'>('citizen');

  const [risk, setRisk] = useState(initial);

  const [selected, setSelected] = useState('Koramangala 5th Block');

  const [query, setQuery] = useState('');

  const [rain, setRain] = useState(42);

  const [drain, setDrain] = useState(55);

  const [start, setStart] = useState(0);

  const [sim, setSim] = useState(false);

  const [scenarioBase, setScenarioBase] = useState(78);

  const [scenarioPeak, setScenarioPeak] = useState<string | null>(null);

  const [route, setRoute] = useState(false);

  const [toast, setToast] = useState('');

  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([

    {

      name: '4th Cross Road',

      travel_time: 41,

      flood_risk: 24,

      recommended: true,

    },

    {

      name: '80 Feet Road',

      travel_time: 35,

      flood_risk: 82,

      recommended: false,

    },

  ]);

  const [hotspotData, setHotspotData] = useState<HotspotRecord[]>(

    [

      ['Koramangala 5th Block', 91],

      ['XYZ Junction', 87],

      ['MG Road Underpass', 82],

      ['ABC Layout', 79],

      ['Lake Road', 74],

    ].map(([name, value]) => ({

      name: String(name),

      risk: Number(value),

    }))

  );

  // Load dashboard data and restore the Cognito session, if one exists.

  useEffect(() => {

    api<Risk>('/risk').then((data) => {

      if (data) {
        setRisk(data);
        setMapRisk(data.risk);
        if (data.coordinates?.latitude && data.coordinates?.longitude) setRiskCoordinates(data.coordinates);
      }

    });

    api<{ routes: RouteOption[] }>('/route-risk', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: '{}',

    }).then((data) => {

      if (data?.routes) setRouteOptions(data.routes);

    });

    api<{ hotspots: HotspotRecord[] }>('/hotspots').then((data) => {

      if (data?.hotspots) setHotspotData(data.hotspots);

    });

    let active = true;

    const restoreUser = async () => {
      try {
        const user = await getCurrentUser();
        const attributes = await fetchUserAttributes();

        if (active) {
          setCurrentUser({
            username: user.username,
            firstName: attributes.given_name || user.username,
            email: attributes.email || '',
          });
        }
      } catch {
        if (active) setCurrentUser(null);
      }
    };

    restoreUser();

    return () => {
      active = false;
    };

  }, []);

  const choose = (name: string, value: number) => {

    setSelected(name);

    setRisk({

      ...risk,

      risk: value,

      level: value > 75 ? 'HIGH' : value > 45 ? 'MODERATE' : 'LOW',

    });

    setSim(false);

    setScenarioPeak(null);

    setQuery('');

  };

  const simulate = async () => {

    const data = await api<{

      scenario_risk: number;

      current_risk: number;

      peak_time: string;

    }>('/simulate', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        rainfall_delta: rain - 42,

        drainage_delta: drain - 55,

        start_shift: start,

      }),

    });

    const nextRisk =

      data?.scenario_risk ??

      Math.max(

        10,

        Math.min(

          98,

Math.round(78 + (rain - 42) * 0.65 - (drain - 55) * 0.45)
        )

      );

    setScenarioBase(risk.risk);

    setRisk({

      ...risk,

      risk: nextRisk,

      level:

        nextRisk > 75

          ? 'HIGH'

          : nextRisk > 45

            ? 'MODERATE'

            : 'LOW',

    });

    setScenarioPeak(

      data?.peak_time ??

        (start < 0 ? '5:00 PM' : start > 0 ? '9:00 PM' : '7:00 PM')

    );

    setSim(true);

  };

  const resetScenario = () => {
    setRain(42);
    setDrain(55);
    setStart(0);
    setSim(false);
    setScenarioPeak(null);
    setRisk((current) => ({ ...current, risk: scenarioBase, level: scenarioBase > 75 ? 'HIGH' : scenarioBase > 45 ? 'MODERATE' : 'LOW' }));
  };

  const alert = (message: string) => {

    setToast(message);

    setTimeout(() => setToast(''), 2500);

  };

  return (

    <div className="app">

      <header className="topbar">

        <div className="brand">

          <div className="brandmark">

            <Waves size={19} />

          </div>

          <div>

            <strong>FloodSense</strong>

            <span>URBAN FLOOD INTELLIGENCE</span>

          </div>

        </div>

        <nav className="top-nav" aria-label="Main navigation">
          <a href="#dashboard">Explore</a>
          <a href="#about">About</a>
        </nav>
        <div className="top-actions">
          <button type="button" className="avatar profile-trigger" onClick={() => setAuthOpen(true)} aria-label="Login / Sign Up" title={currentUser ? `Account: ${currentUser.username}` : 'Login / Sign Up'}>
            {currentUser ? currentUser.firstName.charAt(0).toUpperCase() : <UserRound size={17} aria-hidden="true" />}
          </button>
        </div>

      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-kicker"><span /> URBAN FLOOD INTELLIGENCE</p>
          <h1 id="hero-title">Know your flood risk <em>before the rain arrives.</em></h1>
          <p className="hero-lede">Understand where waterlogging could disrupt your journey. Explore neighbourhood risk, compare safer routes, and see how changing rainfall and drainage conditions affect the outlook.</p>
          <div className="hero-actions"><a className="hero-primary" href="#dashboard">Explore flood risk <ArrowRight size={16} /></a><a className="hero-secondary" href="#about">How it works <ArrowDownRight size={15} /></a></div>
          <div className="hero-proof"><span><b>01</b><small>RISK MONITORING</small></span><i /><span><b>{risk.risk}%</b><small>SELECTED SAMPLE SCORE</small></span><i /><span><b>{rain} mm/hr</b><small>ILLUSTRATIVE RAINFALL</small></span></div>
        </div>
        <figure className="hero-visual hero-photo">
          <img src="/images/urban-flood-hyderabad.jpg" alt="A flooded urban street in Hyderabad after the 2020 floods" />
          <figcaption>Flooded street in Hyderabad, 2020 · Demonstration imagery. <a href="https://commons.wikimedia.org/wiki/File:2020_Hyderabad_floods.jpg" target="_blank" rel="noreferrer">Photo: Strike Eagle · CC BY-SA 4.0</a></figcaption>
        </figure>
        <div className="hero-disclaimer"><span>LOCATION-LEVEL FLOOD INTELLIGENCE</span><span>DETERMINISTIC DEMO DATA · NOT AN OFFICIAL FORECAST</span></div>
      </section>

      <main id="dashboard">

        <div className="intro">

          <div>

            <div className="eyebrow">

              <span className="eyebrow-line" />

              YOUR NEIGHBOURHOOD, SAMPLE OUTLOOK

            </div>

            <h1>

              Will your road <em>flood?</em>

            </h1>

            <p>

              Explore illustrative local risk and understand the assumptions behind the outlook.

            </p>

          </div>

          <div className="mode-switch">

            <button

              className={mode === 'citizen' ? 'active' : ''}

              onClick={() => setMode('citizen')}

            >

              Citizen view

            </button>

            <button

              className={mode === 'city' ? 'active' : ''}

              onClick={() => { setMode('city'); const first = hotspotData[0]; if (first) choose(first.name, first.risk); }}

            >

              Municipality

            </button>

          </div>

        </div>

        {mode === 'citizen' && <div className="controls">

          <div className="searchbox">

            <Search size={17} />

            <input

              value={query}

              onChange={(event) => setQuery(event.target.value)}

              placeholder="Search a road or neighbourhood"

            />

            <kbd>⌘ K</kbd>

            {query && (

              <div className="suggestions">

                {[

                  ['Koramangala 5th Block', 78],

                  ['MG Road Underpass', 82],

                  ['Indiranagar 100 Feet Road', 34],

                ]

                  .filter(([name]) =>

                    String(name).toLowerCase().includes(query.toLowerCase())

                  )

                  .map(([name, value]) => (

                    <button

                      key={String(name)}

                      onClick={() => choose(String(name), Number(value))}

                    >

                      <MapPin size={15} />

                      {name}

                    </button>

                  ))}

              </div>

            )}

          </div>

          <button

            className="location-btn"

            onClick={() => alert('Showing your approximate location')}

          >

            <LocateFixed size={16} />

            Use my location

          </button>

          <div className="view-toggle">

            <button

              className={!route ? 'active' : ''}

              onClick={() => setRoute(false)}

            >

              Location

            </button>

            <button

              className={route ? 'active' : ''}

              onClick={() => setRoute(true)}

            >

              Route

            </button>

          </div>

        </div>}

        {mode === 'city' ? (

          <Municipality

            onChoose={choose}

            onNotify={alert}

            records={hotspotData}

            rain={rain} drain={drain} start={start} sim={sim} risk={risk.risk} scenarioPeak={scenarioPeak}
            onRain={(value) => { setRain(value); setSim(false); setScenarioPeak(null); }}
            onDrain={(value) => { setDrain(value); setSim(false); setScenarioPeak(null); }}
            onStart={(value) => { setStart(value); setSim(false); setScenarioPeak(null); }}
            onSimulate={simulate} onReset={resetScenario}

          />

        ) : (

          <div className="dashboard">

            <section className="map-panel">

              <div className="map-head">

                <div>

                  <div className="map-title">

                    <MapPin size={16} />

                    {route ? 'Route alternatives' : 'Bengaluru demo coordinate'}

                    <ChevronDown size={14} />

                  </div>

                  <div className="map-sub">

                    {route

                      ? 'Safer route highlighted · 41 min'

                      : 'Koramangala, Bengaluru'}{' '}

                    <span>·</span> DEMO DATA · NOT LIVE

                  </div>

                </div>



              </div>

              <InteractiveMap
                risk={mapRisk}
                coordinates={riskCoordinates}
                onSelect={() => choose('Koramangala 5th Block', mapRisk)}
              />

              <div className="map-legend">

                <span>

                  <i className="low-dot" />

                  Low

                </span>

                <span>

                  <i className="mod-dot" />

                  Moderate

                </span>

                <span>

                  <i className="high-dot" />

                  High

                </span>

                <span>

                  <i className="ext-dot" />

                  Extreme

                </span>



              </div>

            </section>

            <aside className="side-column">

              <section className="risk-card">

                <div className="card-top">

                  <span className={`risk-tag ${risk.level.toLowerCase()}`}>

                    <i /> {risk.level} RISK

                  </span>

                  <button

                    className="more"

                    aria-label="More risk options"

                    onClick={() => alert('Risk options')}

                  >

                    •••

                  </button>

                </div>

                <div className="risk-number">

                  {risk.risk}

                  <span>%</span>

                </div>

                <div className="risk-place">{selected}</div>

                <div className="risk-summary">
                  The demonstration model classifies the selected sample as{' '}
                  <b>{risk.level.toLowerCase()} risk</b> for its illustrative evening window.

                </div>

                <div className="risk-stats">

                  <div>

                    <span>

                      <Clock3 size={14} /> PEAK WINDOW

                    </span>

                    <b>6:00 – 9:00 PM</b>

                  </div>

                  <div>

                    <span>

                      <CloudRain size={14} /> PEAK RAINFALL

                    </span>

                    <b>

                      {rain} <small>mm/hr</small>

                    </b>

                  </div>

                </div>

                <div className="confidence">

                  <ShieldCheck size={14} />

                  DEMO CONFIDENCE <span>Illustrative indicator label</span>

                </div>

              </section>

              <section className="timeline panel">

                <div className="section-head">

                  <div>

                    <div className="eyebrow tiny">

                      <Activity size={13} /> RISK TIMELINE

                    </div>

                    <h3>Illustrative evening outlook</h3>

                    <span className="small-muted">

                      Peak exposure arrives at 7 PM

                    </span>

                  </div>

                  <span className="timeline-window">5–10 PM</span>

                </div>

                <div

                  className="hourly-forecast"

                  aria-label="Illustrative hourly flood-risk timeline"

                >

                  {hours.map(([hour, value]) => (

                    <div className="hour-point" key={hour}>

                      <span className="hour-value">{value}%</span>

                      <div className="hour-track">

                        <i

                          className={`hour-bar ${hourLevel(value).toLowerCase()}`}

                          style={{ height: `${value}%` }}

                        />

                      </div>

                      <b className="hour-label">{hour}</b>

                      <span

                        className={`hour-tier ${hourLevel(value).toLowerCase()}`}

                      >

                        {hourLevel(value)}

                      </span>

                    </div>

                  ))}

                </div>

                <div className="rain-strip">

                  <CloudRain size={14} />

                  <span>Peak rainfall</span>

                  <b>{rain} mm/hr</b>

                  <span className="rain-bars">

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                    <i />

                  </span>

                </div>

              </section>

            </aside>

            <section className="action-panel panel">

              <div className="section-head">

                <div>

                  <div className="eyebrow tiny">

                    <Sparkles size={13} /> SAMPLE PREPAREDNESS IDEAS

                  </div>

                  <h3>What should I do?</h3>

                </div>

                <span className="updated">JUST UPDATED</span>

              </div>

              <div className="advice-list">

                <div className="advice">

                  <div className="advice-icon amber">

                    <CarFront size={18} />

                  </div>

                  <div>

                    <b>Move your car before 5:30 PM</b>

                    <span>

                      Low-lying parking on 5th Cross is likely to flood.

                    </span>

                  </div>

                  <ArrowRight size={16} />

                </div>

                <div className="advice">

                  <div className="advice-icon red">

                    <ArrowDownRight size={18} />

                  </div>

                  <div>

                    <b>Avoid the 80 Feet Road underpass</b>

                    <span>

                      Waterlogging risk is highest between 7–8 PM.

                    </span>

                  </div>

                  <ArrowRight size={16} />

                </div>

                <div className="advice">

                  <div className="advice-icon green">

                    <Compass size={18} />

                  </div>

                  <div>

                    <b>Take 4th Cross Road instead</b>

                    <span>Risk returns to LOW after 10 PM.</span>

                  </div>

                  <ArrowRight size={16} />

                </div>

              </div>

            </section>

            <section className="route-panel panel">

              <div className="section-head">

                <div>

                  <div className="eyebrow tiny">

                    <CarFront size={13} /> ROUTE PLANNER

                  </div>

                  <h3>Safer vs. faster</h3>

                </div>

                <button

                  className="more"

                  aria-label="Route options"

                  onClick={() => alert('Route options')}

                >

                  •••

                </button>

              </div>

              <div className="route-from">

                <span className="route-dot" />

                Home <ArrowRight size={14} />

                <span className="route-end" /> Office

                <button onClick={() => alert('Route locations')}>

                  <ChevronDown size={13} />

                </button>

              </div>

              <div className="route-card safer">

                <div className="route-mark">

                  <div className="route-symbol">

                    <ShieldCheck size={16} />

                  </div>

                  <div className="route-line" />

                </div>

                <div className="route-content">

                  <div className="route-label">

                    RECOMMENDED <span>SAFER</span>

                  </div>

                  <b>

                    {routeOptions.find((item) => item.recommended)?.name ??

                      '4th Cross Road'}

                  </b>

                  <div className="route-meta">

                    <span>

                      {routeOptions.find((item) => item.recommended)

                        ?.travel_time ?? 41}{' '}

                      min

                    </span>

                    <i />

                    <span>

                      {routeOptions.find((item) => item.recommended)

                        ?.flood_risk ?? 24}

                      % flood risk

                    </span>

                  </div>

                </div>

                <ArrowRight size={16} />

              </div>

              <div className="route-card">

                <div className="route-mark">

                  <div className="route-symbol neutral">

                    <Compass size={16} />

                  </div>

                </div>

                <div className="route-content">

                  <div className="route-label">

                    FASTEST <span className="danger-label">HIGH RISK</span>

                  </div>

                  <b>

                    {routeOptions

                      .filter((item) => !item.recommended)

                      .sort((a, b) => a.travel_time - b.travel_time)[0]?.name ??

                      '80 Feet Road'}

                  </b>

                  <div className="route-meta">

                    <span>

                      {routeOptions

                        .filter((item) => !item.recommended)

                        .sort((a, b) => a.travel_time - b.travel_time)[0]

                        ?.travel_time ?? 35}{' '}

                      min

                    </span>

                    <i />

                    <span>

                      {routeOptions

                        .filter((item) => !item.recommended)

                        .sort((a, b) => a.travel_time - b.travel_time)[0]

                        ?.flood_risk ?? 82}

                      % flood risk

                    </span>

                  </div>

                </div>

                <ArrowRight size={16} />

              </div>

              <div className="tradeoff">

                <Activity size={15} />

                <span>

                  <b>

                    +

                    {(routeOptions.find((item) => item.recommended)

                      ?.travel_time ?? 41) -

                      (routeOptions

                        .filter((item) => !item.recommended)

                        .sort((a, b) => a.travel_time - b.travel_time)[0]

                        ?.travel_time ?? 35)}{' '}

                    minutes

                  </b>{' '}

                  for{' '}

                  {Math.abs(

                    (routeOptions.find((item) => item.recommended)

                      ?.flood_risk ?? 24) -

                      (routeOptions

                        .filter((item) => !item.recommended)

                        .sort((a, b) => a.travel_time - b.travel_time)[0]

                        ?.flood_risk ?? 82)

                  )}

                  % less flood risk

                </span>

              </div>

            </section>

            <section className="why-panel panel">

              <div className="section-head">

                <div>

                  <div className="eyebrow tiny">

                    <Activity size={13} /> RISK BREAKDOWN

                  </div>

                  <h3>Why this road?</h3>

                </div>

                <button

                  className="info"

                  aria-label="Risk breakdown information"

                  onClick={() => alert('Risk factors')}

                >

                  i

                </button>

              </div>

              <div className="factors">

                {[

                  ['Rainfall intensity', 'HIGH', 89],

                  ['Drainage capacity', 'HIGH', 82],

                  ['Historical flooding', 'HIGH', 74],

                  ['Impervious surface', 'HIGH', 72],

                  ['Elevation', 'MEDIUM', 47],

                  ['Soil infiltration', 'LOW', 22],

                ].map(([name, level, value]) => (

                  <div className="factor" key={String(name)}>

                    <span>{name}</span>

                    <div className="factor-track">

                      <i

                        style={{ width: `${value}%` }}

                        className={

                          level === 'HIGH'

                            ? 'f-high'

                            : level === 'MEDIUM'

                              ? 'f-med'

                              : 'f-low'

                        }

                      />

                    </div>

                    <b

                      className={

                        level === 'HIGH'

                          ? 'high-txt'

                          : level === 'MEDIUM'

                            ? 'med-txt'

                            : 'low-txt'

                      }

                    >

                      {level}

                    </b>

                  </div>

                ))}

              </div>

              <p className="explanation">

                The sample scenario combines rainfall, drainage, and location indicators. These values are illustrative and do not describe verified current conditions.

              </p>

            </section>

            <section className="whatif-panel panel">

              <div className="section-head">

                <div>

                  <div className="eyebrow tiny">

                    <Sparkles size={13} /> SCENARIO PLANNER

                  </div>

                  <h3>What if conditions change?</h3>

                </div>

                <span className="scenario-chip">BETA</span>

              </div>

              <div className="sliders">

                <Slider

                  label="Rainfall intensity"

                  value={rain}

                  min={10}

                  max={80}

                  unit="mm/hr"

                  set={(value) => {

                    setRain(value);

                    setSim(false);

                    setScenarioPeak(null);

                  }}

                />

                <Slider

                  label="Drainage capacity"

                  value={drain}

                  min={10}

                  max={100}

                  unit="%"

                  set={(value) => {

                    setDrain(value);

                    setSim(false);

                    setScenarioPeak(null);

                  }}

                />

                <div className="select-row">

                  <span>Rain starts</span>

                  <select

                    value={start}

                    onChange={(event) => {

                      setStart(Number(event.target.value));

                      setSim(false);

                      setScenarioPeak(null);

                    }}

                  >

                    <option value={0}>At sample start time</option>

                    <option value={-2}>2 hours earlier</option>

                    <option value={2}>2 hours later</option>

                  </select>

                </div>

              </div>

              <div className="simulate-row">

                <div className="sim-result">

                  <span>{sim ? 'SCENARIO RISK' : 'BASELINE DEMO RISK'}</span>

                  <b>

                    {sim ? (

                      <>

                        <span className="scenario-compare">

                          {scenarioBase}% <ArrowRight size={14} /> {risk.risk}%

                        </span>

                        <small>scenario result</small>

                      </>

                    ) : (

                      <>

                        {risk.risk}% <small>sample baseline</small>

                      </>

                    )}

                  </b>

                  {sim && scenarioPeak && (

                    <span className="scenario-peak">

                      Peak shifts to {scenarioPeak}

                    </span>

                  )}

                </div>

                <div className="scenario-buttons"><button onClick={resetScenario} className="scenario-reset">Reset</button><button onClick={simulate}>

                  Run scenario <ArrowRight size={15} />

                </button></div>

              </div>

            </section>

          </div>

        )}

        <section className="about-page about-compact" id="about" aria-labelledby="about-title">
          <div className="about-compact-heading">
            <span className="section-index">ABOUT FLOODSENSE</span>
            <h2 id="about-title">A clearer view of local flood risk.</h2>
            <p>FloodSense helps people explore urban flood risk, understand potential waterlogging hotspots, and compare routes using an interactive risk dashboard.</p>
          </div>
          <div className="about-feature-grid">
            <article><MapPin size={18} /><h3>Explore Risk</h3><p>Inspect available locations and understand their displayed sample risk levels.</p></article>
            <article><Compass size={18} /><h3>Compare Routes</h3><p>Explore existing route alternatives and their estimated travel time and sample risk.</p></article>
            <article><CloudRain size={18} /><h3>Test Scenarios</h3><p>Adjust rainfall, drainage, and start-time assumptions to see how the demo responds.</p></article>
          </div>
          <div className="about-limits"><ShieldCheck size={17} /><p><b>Prototype using demonstration values.</b> Scores, routes, timelines, and recommendations are not official forecasts or verified live observations. Hotspot records currently lack map coordinates; future live data and validated models are not current capabilities.</p></div>
          <p className="about-demo-note">The Bengaluru Monsoon Watch experience currently uses a deterministic sample scenario, not verified live flood conditions.</p>
        </section>

        <footer>

          <div>

            <span className="footer-mark">

              <Waves size={15} />

            </span>

            FloodSense{' '}

            <span className="footer-copy">

              A clearer picture of what's coming.

            </span>

          </div>

          <span>DEMONSTRATION DATA · BENGALURU <i /> NOT OFFICIAL SAFETY GUIDANCE</span>

        </footer>

      </main>

      {authOpen && (

        <AuthModal

          onClose={() => setAuthOpen(false)}

          userEmail={currentUser?.email || null}

          onSignedIn={(user) => setCurrentUser(user)}

          onSignedOut={() => setCurrentUser(null)}

        />

      )}

      {toast && <div className="toast">{toast}</div>}

    </div>

  );

}

function Slider({

  label,

  value,

  min,

  max,

  unit,

  set,

}: {

  label: string;

  value: number;

  min: number;

  max: number;

  unit: string;

  set: (value: number) => void;

}) {

  return (

    <label className="slider-row">

      <span>

        {label}

        <b>

          {value} <small>{unit}</small>

        </b>

      </span>

      <input

        type="range"

        min={min}

        max={max}

        value={value}

        onChange={(event) => set(Number(event.target.value))}

      />

    </label>

  );

}

function Municipality({

  onChoose,

  onNotify,

  records,

  rain, drain, start, sim, risk, scenarioPeak, onRain, onDrain, onStart, onSimulate, onReset,

}: {

  onChoose: (name: string, value: number) => void;

  onNotify: (message: string) => void;

  records: HotspotRecord[];

  rain: number; drain: number; start: number; sim: boolean; risk: number; scenarioPeak: string | null;
  onRain: (value: number) => void; onDrain: (value: number) => void; onStart: (value: number) => void;
  onSimulate: () => void; onReset: () => void;

}) {

  const hotspots = records.map(

    (hotspot) =>

      [

        hotspot.name,

        hotspot.risk,

        hotspot.risk > 75

          ? 'HIGH'

          : hotspot.risk > 45

            ? 'MODERATE'

            : 'LOW',

      ] as const

  );

  const [active, setActive] = useState<(typeof hotspots)[number]>(

    hotspots[0] ?? ['No hotspots available', 0, 'LOW']

  );

  const select = (hotspot: (typeof hotspots)[number]) => {

    setActive(hotspot);

    onChoose(hotspot[0], hotspot[1]);

  };

const after = Math.round(active[1] * 0.64);
  return (

    <div className="municipal">

      <section className="municipal-map">

        <div className="municipal-title">

          <div>

            <div className="eyebrow">

              <span className="eyebrow-line" />

              CITY OPERATIONS

            </div>

            <h2>Flood hotspots</h2>

            <p>Prioritize response where it matters most.</p>

          </div>

          <span className="today-pill">

            <span className="live-dot" /> ILLUSTRATIVE WINDOW · 6–9 PM

          </span>

        </div>

        <InteractiveMap risk={active[1]} municipality />

        <div className="municipal-map-foot">

          <span>

            <i className="high-dot" /> High exposure

          </span>

          <span>

            <i className="mod-dot" /> Moderate exposure

          </span>

          <span>

            <i className="low-dot" /> Lower exposure

          </span>

        </div>

      </section>

      <section className="hotspot-list panel">

        <div className="section-head">

          <div>

            <div className="eyebrow tiny">

              <Waves size={13} /> RANKED BY RISK

            </div>

            <h3>Top flood hotspots</h3>

          </div>

          <button className="text-action" onClick={() => onNotify('Showing sample hotspots')}>

            Sample data <ChevronDown size={13} />

          </button>

        </div>

        {hotspots.map((hotspot, index) => (

          <button

            className={`hotspot-row ${

              active[0] === hotspot[0] ? 'selected' : ''

            }`}

            key={hotspot[0]}

            onClick={() => select(hotspot)}

          >

            <span className="rank">

              {String(index + 1).padStart(2, '0')}

            </span>

            <div className="hotspot-name">

              <b>{hotspot[0]}</b>

              <span>{index === 0 ? 'Koramangala' : 'Bengaluru'}</span>

            </div>

            <div className="hotspot-score">

              <b>

                {hotspot[1]}

                <small>%</small>

              </b>

              <span>{hotspot[2]} RISK</span>

            </div>

            <ArrowRight size={15} />

          </button>

        ))}

        <div className="intervention">

          <div className="intervention-top">

            <div className="advice-icon green">

              <Droplets size={17} />

            </div>

            <div>

              <span>PROPOSED INTERVENTION</span>

              <b>Drainage upgrade · {active[0]}</b>

            </div>

          </div>

          <p className="hotspot-explanation">

            This hotspot record includes a sample risk score only; incident history and drainage measurements are not available in the current API.

          </p>

          <div className="intervention-impact">

            <span>Illustrative scenario score</span>

            <b>

              {active[1]}% <ArrowRight size={14} /> {after}%

            </b>

          </div>

          <button

            onClick={() =>

              onNotify(`Drainage upgrade scenario selected for ${active[0]}`)

            }

          >

            Explore intervention <ArrowRight size={14} />

          </button>

        </div>
        <section className="city-scenario">
          <div className="eyebrow tiny"><CloudRain size={13} /> AREA SCENARIO</div>
          <h3>Adjust sample assumptions</h3>
          <div className="city-scenario-sliders">
            <Slider label="Rainfall intensity" value={rain} min={10} max={80} unit="mm/hr" set={onRain} />
            <Slider label="Drainage capacity" value={drain} min={10} max={100} unit="%" set={onDrain} />
            <label className="select-row"><span>Rain starts</span><select value={start} onChange={(event) => onStart(Number(event.target.value))}><option value={0}>Sample start</option><option value={-2}>2 hours earlier</option><option value={2}>2 hours later</option></select></label>
          </div>
          <div className="city-scenario-result"><span>{sim ? `Illustrative result · ${scenarioPeak || 'adjusted window'}` : 'Selected hotspot sample score'}</span><b>{risk}%</b></div>
          <div className="scenario-buttons"><button className="scenario-reset" onClick={onReset}>Reset</button><button className="city-simulate" onClick={onSimulate}>Run area scenario <ArrowRight size={14} /></button></div>
        </section>

      </section>

    </div>

  );

}

createRoot(document.getElementById('root')!).render(<App />);
