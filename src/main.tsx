

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

  Menu,

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

      if (data) setRisk(data);

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

    setScenarioBase(data?.current_risk ?? 78);

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

            <strong>Floodline</strong>

            <span>URBAN INTELLIGENCE</span>

          </div>

        </div>

        <div className="top-center">

          <span className="live-dot" /> Bengaluru{' '}

          <span className="top-sep">/</span> Monsoon watch{' '}

          <span className="live-pill">LIVE DEMO</span>

        </div>

        <div className="top-actions">

          <button

            className="icon-btn"

            onClick={() => alert('Menu')}

            aria-label="Open menu"

          >

            <Menu size={18} />

          </button>

          <button

            type="button"

            className="avatar"

            onClick={() => setAuthOpen(true)}

            aria-label={currentUser ? 'Open account' : 'Sign in'}

            title={
              currentUser
                ? `User ID: ${currentUser.username}`
                : 'Sign in'
            }

            style={{

              border: 0,

              cursor: 'pointer',

              font: 'inherit',

            }}

          >

            {currentUser ? (
              currentUser.firstName.charAt(0).toUpperCase()
            ) : (
              <UserRound size={16} aria-hidden="true" />
            )}

          </button>

        </div>

      </header>

      <main>

        <div className="intro">

          <div>

            <div className="eyebrow">

              <span className="eyebrow-line" />

              YOUR NEIGHBOURHOOD, FORECAST AHEAD

            </div>

            <h1>

              Will your road <em>flood?</em>

            </h1>

            <p>

              Local flood risk, so you can make your next move with confidence.

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

              onClick={() => setMode('city')}

            >

              Municipality

            </button>

          </div>

        </div>

        <div className="controls">

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

        </div>

        {mode === 'city' ? (

          <Municipality

            onChoose={choose}

            onNotify={alert}

            records={hotspotData}

          />

        ) : (

          <div className="dashboard">

            <section className="map-panel">

              <div className="map-head">

                <div>

                  <div className="map-title">

                    <MapPin size={16} />

                    {route ? 'Home → Office' : selected}

                    <ChevronDown size={14} />

                  </div>

                  <div className="map-sub">

                    {route

                      ? 'Safer route highlighted · 41 min'

                      : 'Koramangala, Bengaluru'}{' '}

                    <span>·</span> Updated 4 min ago

                  </div>

                </div>

                <div className="map-tools">

                  <button

                    title="Zoom in"

                    onClick={() => alert('Map zoomed in')}

                  >

                    <Plus size={16} />

                  </button>

                  <button

                    title="Zoom out"

                    onClick={() => alert('Map zoomed out')}

                  >

                    <Minus size={16} />

                  </button>

                  <button

                    title="Layers"

                    onClick={() => alert('Map layers opened')}

                  >

                    <SlidersHorizontal size={16} />

                  </button>

                </div>

              </div>

              <div className="map">

                <div className="map-grid" />

                <div className="park park-one">

                  <span>Jakkasandra Park</span>

                </div>

                <div className="park park-two" />

                <div className="lake">

                  <span>Agara Lake</span>

                </div>

                <div className="map-label label-a">KORAMANGALA 5TH BLOCK</div>

                <div className="map-label label-b">80 FEET ROAD</div>

                <div className="map-label label-c">HOSUR ROAD</div>

                <svg

                  className="roads"

                  viewBox="0 0 760 480"

                  preserveAspectRatio="none"

                >

                  <path

                    className="road-base"

                    d="M-30 370 C130 315 230 330 350 245 S570 145 790 185"

                  />

                  <path

                    onClick={() => choose('5th Cross Road', 58)}

                    className="risk-road moderate interactive-road"

                    d="M-30 370 C130 315 230 330 350 245"

                  />

                  <path

                    onClick={() => choose('80 Feet Road', 82)}

                    className="risk-road high interactive-road"

                    d="M350 245 C460 180 545 145 625 160"

                  />

                  <path

                    onClick={() => choose('4th Cross Road', 24)}

                    className="risk-road low interactive-road"

                    d="M110 55 C210 130 250 200 350 245 S500 340 650 430"

                  />

                  <path

                    className="road-base"

                    d="M40 170 C180 180 230 190 325 210 S540 270 760 255"

                  />

                  <path

                    className="risk-road moderate"

                    d="M40 170 C180 180 230 190 325 210"

                  />

                  <path

                    className="road-base"

                    d="M575 0 C550 110 535 200 515 280 S490 380 475 500"

                  />

                  {route && (

                    <path

                      className="route-trace"

                      d="M110 55 C210 130 250 200 350 245 S500 340 650 430"

                    />

                  )}

                  <circle cx="350" cy="245" r="10" className="pin-halo" />

                  <circle cx="350" cy="245" r="4" className="pin-dot" />

                </svg>

                <button

                  className="map-hitbox hit-moderate"

                  aria-label="Select 5th Cross Road, moderate risk"

                  onClick={() => choose('5th Cross Road', 58)}

                />

                <button

                  className="map-hitbox hit-high"

                  aria-label="Select 80 Feet Road, high risk"

                  onClick={() => choose('80 Feet Road', 82)}

                />

                <button

                  className="map-hitbox hit-low"

                  aria-label="Select 4th Cross Road, low risk"

                  onClick={() => choose('4th Cross Road', 24)}

                />

                <div className="map-tip">

                  <span className="tip-dot" />{' '}

                  {route ? 'Safer route · 4th Cross' : 'Selected segment'}{' '}

                  <b>{risk.risk}%</b>

                </div>

                <div className="scale">

                  500 m <span />

                </div>

              </div>

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

                <button onClick={() => alert('Map layers opened')}>

                  Map layers <ChevronDown size={13} />

                </button>

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

                  Road flooding is{' '}

                  <b>

                    {risk.level === 'HIGH'

                      ? 'likely'

                      : risk.level === 'MODERATE'

                        ? 'possible'

                        : 'unlikely'}

                  </b>{' '}

                  during the evening peak.

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

                  High confidence <span>Based on 6 local signals</span>

                </div>

              </section>

              <section className="timeline panel">

                <div className="section-head">

                  <div>

                    <div className="eyebrow tiny">

                      <Activity size={13} /> RISK TIMELINE

                    </div>

                    <h3>Tonight's outlook</h3>

                    <span className="small-muted">

                      Peak exposure arrives at 7 PM

                    </span>

                  </div>

                  <span className="timeline-window">5–10 PM</span>

                </div>

                <div

                  className="hourly-forecast"

                  aria-label="Hourly flood risk forecast"

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

                    <Sparkles size={13} /> PERSONALIZED FOR THIS ROAD

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

                Intense rainfall is meeting <b>limited drainage</b> on low-lying

                roads. This stretch has flooded 4 times in the last 3 monsoons.

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

                    <option value={0}>At forecast time</option>

                    <option value={-2}>2 hours earlier</option>

                    <option value={2}>2 hours later</option>

                  </select>

                </div>

              </div>

              <div className="simulate-row">

                <div className="sim-result">

                  <span>{sim ? 'SCENARIO RISK' : 'CURRENT RISK'}</span>

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

                        {risk.risk}% <small>today</small>

                      </>

                    )}

                  </b>

                  {sim && scenarioPeak && (

                    <span className="scenario-peak">

                      Peak shifts to {scenarioPeak}

                    </span>

                  )}

                </div>

                <button onClick={simulate}>

                  Run scenario <ArrowRight size={15} />

                </button>

              </div>

            </section>

          </div>

        )}

        <footer>

          <div>

            <span className="footer-mark">

              <Waves size={15} />

            </span>

            Floodline{' '}

            <span className="footer-copy">

              A clearer picture of what's coming.

            </span>

          </div>

          <span>

            DEMO DATA · KORAMANGALA, BENGALURU <i /> Built for monsoon

            resilience

          </span>

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

}: {

  onChoose: (name: string, value: number) => void;

  onNotify: (message: string) => void;

  records: HotspotRecord[];

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

            <span className="live-dot" /> TONIGHT · 6–9 PM

          </span>

        </div>

        <div className="map municipal-map-art">

          <div className="map-grid" />

          <div className="lake">

            <span>Agara Lake</span>

          </div>

          <svg

            className="roads"

            viewBox="0 0 760 480"

            preserveAspectRatio="none"

          >

            <path

              className="road-base"

              d="M-30 370 C130 315 230 330 350 245 S570 145 790 185"

            />

            <path

              className="risk-road high"

              d="M-30 370 C130 315 230 330 350 245 S570 145 790 185"

            />

            <path

              className="road-base"

              d="M110 55 C210 130 250 200 350 245 S500 340 650 430"

            />

            <path

              className="risk-road moderate"

              d="M110 55 C210 130 250 200 350 245 S500 340 650 430"

            />

          </svg>

          {hotspots.slice(0, 4).map((hotspot, index) => (

            <button

              key={hotspot[0]}

              className={`hotspot hot-${index}`}

              onClick={() => select(hotspot)}

              aria-label={`Select hotspot ${hotspot[0]}`}

            >

              <span>{index + 1}</span>

            </button>

          ))}

        </div>

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

          <button className="text-action" onClick={() => onNotify('Showing tonight’s hotspots')}>

            Tonight <ChevronDown size={13} />

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

            {active[0]} combines intense runoff with limited drainage and a

            history of monsoon waterlogging.

          </p>

          <div className="intervention-impact">

            <span>Projected risk reduction</span>

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

      </section>

    </div>

  );

}

createRoot(document.getElementById('root')!).render(<App />);
