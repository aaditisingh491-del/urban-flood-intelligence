

import React, { useEffect, useState } from 'react';

import './cognito';

import { createRoot } from 'react-dom/client';

import {

  Activity,

  ArrowDownRight,

  ArrowRight,

  CarFront,

  ChevronDown,

  ChevronLeft,

  ChevronRight,

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

const heroSlides = [
  {
    label: 'URBAN FLOOD INTELLIGENCE',
    headline: <>Know your flood risk <em>before the rain arrives.</em></>,
    description: 'Explore neighbourhood risk, identify potential waterlogging hotspots, and understand how changing rainfall and drainage conditions affect the outlook.',
    image: '/images/urban-flood-hyderabad.jpg',
    alt: 'A flooded street in Hyderabad after the 2020 floods, with cars surrounded by standing water.',
    caption: 'Hyderabad, October 2020 · Historical demonstration imagery.',
    source: 'https://commons.wikimedia.org/wiki/File:2020_Hyderabad_floods.jpg',
    credit: 'Strike Eagle · CC BY-SA 4.0',
  },
  {
    label: 'FLOOD-AWARE ROUTES',
    headline: <>Understand the risk <em>along your route.</em></>,
    description: 'Compare available route alternatives and explore the risk information provided by the current demonstration.',
    image: '/images/flooding-bangalore-2024.jpg',
    alt: 'Waterlogged street in Tatanagar, Bengaluru, after heavier than normal rains in October 2024.',
    caption: 'Tatanagar, Bengaluru · 22 October 2024; historical imagery, not a live condition.',
    source: 'https://commons.wikimedia.org/wiki/File:Flooding_in_Bangalore.jpg',
    credit: 'Shyamal · CC BY-SA 4.0',
  },
  {
    label: 'SCENARIO EXPLORATION',
    headline: <>See how conditions can <em>change the picture.</em></>,
    description: "Explore rainfall and drainage scenarios to understand how the application's displayed risk estimates respond to different assumptions.",
    image: '/images/urban-flooding-bhubaneswar.jpg',
    alt: 'Urban flooding in Bhubaneswar during the 2025 monsoon season.',
    caption: 'Bhubaneswar, August 2025 · Historical demonstration imagery.',
    source: 'https://commons.wikimedia.org/wiki/File:Urban_flooding_in_Bhubaneswar.jpg',
    credit: 'Nathularog · CC0 1.0',
  },
  {
    label: 'URBAN DRAINAGE',
    headline: <>When drains fall behind, <em>streets feel it.</em></>,
    description: 'Explore how rainfall and drainage assumptions affect the demonstration’s displayed risk estimates—not live street-level monitoring.',
    image: '/images/flooded-stormwater-drainage-rockingham-2023.jpg',
    alt: 'A stormwater canal in Rockingham, Western Australia, carrying high water after two days of rain.',
    caption: 'Rockingham, Western Australia · 5 June 2023; historical imagery.',
    source: 'https://commons.wikimedia.org/wiki/File:Flooded_stormwater_drainage_canal_at_Rockingham,_Western_Australia,_June_2023_05.jpg',
    credit: 'Calistemon · CC BY-SA 4.0',
  },
  {
    label: 'FLOOD PREPAREDNESS',
    headline: <>Prepare early. <em>Understand your risk.</em></>,
    description: 'Compare sample route risks and explore how rainfall and drainage assumptions shift the dashboard’s illustrative estimates.',
    image: '/images/flood-preparedness-sandbags-colorado-2013.jpg',
    alt: 'Emergency responders and National Guard members distributing sandbags in Arvada, Colorado, during 2013 flood response.',
    caption: 'Arvada, Colorado · 15 September 2013; historical response imagery.',
    source: 'https://commons.wikimedia.org/wiki/File:Sandbags_for_colorado_flood.jpg',
    credit: 'Staff Sgt. Nicole Manzanares, U.S. Air National Guard · Public domain',
  },
] as const;

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
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [heroAutoplayReset, setHeroAutoplayReset] = useState(0);
  const [heroImageFailures, setHeroImageFailures] = useState<Record<number, number>>({});
  const [heroHovered, setHeroHovered] = useState(false);
  const [heroFocused, setHeroFocused] = useState(false);
  const [heroPageVisible, setHeroPageVisible] = useState(() => document.visibilityState === 'visible');
  const [heroReducedMotion, setHeroReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateVisibility = () => setHeroPageVisible(document.visibilityState === 'visible');
    const updateMotionPreference = () => setHeroReducedMotion(motionPreference.matches);

    document.addEventListener('visibilitychange', updateVisibility);
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      motionPreference.removeEventListener('change', updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (heroHovered || heroFocused || !heroPageVisible || heroReducedMotion) return;
    const timer = window.setTimeout(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeHeroSlide, heroAutoplayReset, heroFocused, heroHovered, heroPageVisible, heroReducedMotion]);

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

  const showHeroSlide = (offset: number) => {
    setActiveHeroSlide((current) => (current + offset + heroSlides.length) % heroSlides.length);
    setHeroAutoplayReset((current) => current + 1);
    setHeroFocused(false);
  };

  const handleHeroKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showHeroSlide(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showHeroSlide(1);
    }
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

      <section
        className="hero-section hero-carousel"
        aria-label="FloodSense introduction"
        aria-roledescription="carousel"
        onKeyDown={handleHeroKeyDown}
        onMouseEnter={() => setHeroHovered(true)}
        onMouseLeave={() => setHeroHovered(false)}
        onFocusCapture={() => setHeroFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroFocused(false);
        }}
      >
        {heroSlides.map((slide, index) => {
          if (index !== activeHeroSlide) return null;
          const failures = heroImageFailures[index] ?? 0;
          const imageSrc = failures === 1 ? '/images/urban-flood-hyderabad.jpg' : slide.image;
          return (
            <React.Fragment key={slide.label}>
              <div className="hero-copy hero-copy-slide" role="group" aria-roledescription="slide" aria-label={`Slide ${index + 1} of ${heroSlides.length}`}>
                <p className="hero-kicker"><span /> {slide.label}</p>
                <h1 id="hero-title">{slide.headline}</h1>
                <p className="hero-lede">{slide.description}</p>
                <div className="hero-actions"><a className="hero-primary" href="#dashboard">Explore flood risk <ArrowRight size={16} /></a><a className="hero-secondary" href="#about">How it works <ArrowDownRight size={15} /></a></div>
                <div className="hero-proof"><span><b>01</b><small>RISK MONITORING</small></span><i /><span><b>{risk.risk}%</b><small>SELECTED SAMPLE SCORE</small></span><i /><span><b>{rain} mm/hr</b><small>ILLUSTRATIVE RAINFALL</small></span></div>
              </div>
              <figure className="hero-visual hero-photo hero-photo-slide">
                {failures >= 2 ? (
                  <div className="hero-photo-fallback" role="img" aria-label={slide.alt}><Waves size={34} /><span>Flood image unavailable</span></div>
                ) : (
                  <img
                    src={imageSrc}
                    alt={slide.alt}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    onError={() => setHeroImageFailures((current) => ({ ...current, [index]: Math.min((current[index] ?? 0) + 1, 2) }))}
                  />
                )}
                <figcaption className="hero-photo-credit">{slide.caption} <a href={slide.source} target="_blank" rel="noreferrer">{slide.credit}</a></figcaption>
                <div className="hero-slide-controls" aria-label="Carousel controls">
                  <div className="hero-slide-indicators" aria-label="Choose slide">
                    {heroSlides.map((item, itemIndex) => (
                      <button key={item.label} type="button" className={itemIndex === activeHeroSlide ? 'active' : ''} aria-label={`Go to slide ${itemIndex + 1}: ${item.label}`} aria-pressed={itemIndex === activeHeroSlide} onClick={() => { setActiveHeroSlide(itemIndex); setHeroAutoplayReset((current) => current + 1); if (itemIndex !== activeHeroSlide) setHeroFocused(false); }} />
                    ))}
                  </div>
                  <span className="hero-slide-count" aria-live="polite">{String(index + 1).padStart(2, '0')} <i>/</i> {String(heroSlides.length).padStart(2, '0')}</span>
                  <div className="hero-slide-arrows">
                    <button type="button" aria-label="Previous slide" onClick={() => showHeroSlide(-1)}><ChevronLeft size={17} /></button>
                    <button type="button" aria-label="Next slide" onClick={() => showHeroSlide(1)}><ChevronRight size={17} /></button>
                  </div>
                </div>
              </figure>
            </React.Fragment>
          );
        })}
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

      </main>

      <footer className="site-footer" aria-label="FloodSense site footer">
        <div className="site-footer-columns">
          <section aria-labelledby="footer-system"><h2 id="footer-system">System</h2><a href="#about">About FloodSense</a><a href="#dashboard">Explore Flood Risk</a><a href="#about">How It Works</a></section>
          <section aria-labelledby="footer-standard"><h2 id="footer-standard">Standard</h2><a href="#dashboard">Risk Indicators</a><a href="#dashboard">Route Comparison</a><a href="#dashboard">Scenario Explorer</a></section>
          <section aria-labelledby="footer-workspace"><h2 id="footer-workspace">Workspace</h2><button type="button" onClick={() => setAuthOpen(true)}>Login / Sign Up</button><a href="#dashboard">Open Dashboard</a><a href="#dashboard">Citizen / Municipality Views</a></section>
        </div>
        <div className="site-footer-bottom">
          <div className="site-footer-brand"><span className="footer-mark"><Waves size={17} /></span><strong>FloodSense</strong><span>A clearer view of local flood risk.</span></div>
          <p>© 2026 FloodSense · Urban flood-risk demonstration</p>
        </div>
      </footer>

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
