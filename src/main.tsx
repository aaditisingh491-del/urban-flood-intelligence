

import React, { useEffect, useState } from 'react';

import './cognito';

import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

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


  MapPin,


  Minus,

  Plus,


  ShieldCheck,

  SlidersHorizontal,

  Sparkles,

  UserRound,

  Waves,

} from 'lucide-react';

import './style.css';

import './interactions.css';

import AuthModal from './AuthModal';
import FloodIntelligence from './FloodIntelligence';
import ExplorePage from './ExplorePage';
import ThemeToggle, { ThemeProvider } from './theme';

import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';

type AppUser = {
  username: string;
  firstName: string;
  email: string;
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
    description: 'Search for a place, select an origin and destination, and inspect flood data coverage before routing.',
    image: '/images/flooding-bangalore-2024.jpg',
    alt: 'Waterlogged street in Tatanagar, Bengaluru, after heavier than normal rains in October 2024.',
    caption: 'Tatanagar, Bengaluru · 22 October 2024; historical imagery, not a live condition.',
    source: 'https://commons.wikimedia.org/wiki/File:Flooding_in_Bangalore.jpg',
    credit: 'Shyamal · CC BY-SA 4.0',
  },
  {
    label: 'SCENARIO EXPLORATION',
    headline: <>See how conditions can <em>change the picture.</em></>,
    description: 'Select a Bengaluru destination to see actual forecast times and rainfall context, separately from verified flood reports.',
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
    description: 'Use route candidates as planning context only; road conditions require confirmation from official local authorities.',
    image: '/images/flood-preparedness-sandbags-colorado-2013.jpg',
    alt: 'Emergency responders and National Guard members distributing sandbags in Arvada, Colorado, during 2013 flood response.',
    caption: 'Arvada, Colorado · 15 September 2013; historical response imagery.',
    source: 'https://commons.wikimedia.org/wiki/File:Sandbags_for_colorado_flood.jpg',
    credit: 'Staff Sgt. Nicole Manzanares, U.S. Air National Guard · Public domain',
  },
] as const;

function App() {

  const [authOpen, setAuthOpen] = useState(false);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [heroAutoplayReset, setHeroAutoplayReset] = useState(0);
  const [heroImageFailures, setHeroImageFailures] = useState<Record<number, number>>({});
  const [heroFocused, setHeroFocused] = useState(false);
  const [heroPageVisible, setHeroPageVisible] = useState(() => document.visibilityState === 'visible');
  const [heroReducedMotion, setHeroReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);


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
    if (heroFocused || !heroPageVisible || heroReducedMotion) return;
    const timer = window.setTimeout(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeHeroSlide, heroAutoplayReset, heroFocused, heroPageVisible, heroReducedMotion]);


  // Load dashboard data and restore the Cognito session, if one exists.

  useEffect(() => {

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
          <Link to="/explore">Explore</Link>
          <a href="#about">About</a>
        </nav>
        <div className="top-actions">
          <ThemeToggle />
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
                <div className="hero-actions"><Link className="hero-primary" to="/explore">Explore flood locations <ArrowRight size={16} /></Link><a className="hero-secondary" href="#about">How it works <ArrowDownRight size={15} /></a></div>
                <div className="hero-proof"><span><b>01</b><small>BENGALURU SERVICE AREA</small></span><i /><span><b>On selection</b><small>DESTINATION WEATHER</small></span><i /><span><b>Source-backed</b><small>VULNERABILITY INVENTORY</small></span></div>
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
                      <button key={item.label} type="button" className={itemIndex === activeHeroSlide ? 'active' : ''} aria-label={`Go to slide ${itemIndex + 1}: ${item.label}`} aria-pressed={itemIndex === activeHeroSlide} onClick={() => { setActiveHeroSlide(itemIndex); setHeroAutoplayReset((current) => current + 1); setHeroFocused(false); }} />
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
      </section>

      <main id="dashboard">
        <section className="home-intro"><span className="eyebrow">BENGALURU FLOOD INTELLIGENCE</span><h1>Plan a route with <em>local context.</em></h1><p>Select a Bengaluru source and an inventory-backed destination to review current forecast context and route information.</p></section>
        <FloodIntelligence />

        <section className="about-page about-compact" id="about" aria-labelledby="about-title">
          <div className="about-compact-heading">
            <span className="section-index">ABOUT FLOODSENSE</span>
            <h2 id="about-title">A clearer view of local flood risk.</h2>
            <p>FloodSense helps people explore urban flood risk, understand potential waterlogging hotspots, and compare routes using an interactive risk dashboard.</p>
          </div>
          <div className="about-feature-grid">
            <article><MapPin size={18} /><h3>Explore locations</h3><p>Browse source-backed flood-vulnerability locations on the separate Explore page.</p></article>
            <article><Compass size={18} /><h3>Compare Routes</h3><p>Search an origin and choose a destination from the source-backed flood-prone inventory to compare routing-provider candidates with available records.</p></article>
            <article><CloudRain size={18} /><h3>Check forecast context</h3><p>See provider-returned weather times for the selected Bengaluru destination; rainfall does not prove flooding.</p></article>
          </div>
          <div className="about-limits"><ShieldCheck size={17} /><p><b>Decision support, not an emergency service.</b> Model scores are provisional and not probabilities. Inventory locations are not current flood reports, and route candidates cannot confirm road safety.</p></div>

        </section>

      </main>

      <footer className="site-footer" aria-label="FloodSense site footer">
        <div className="site-footer-columns">
          <section aria-labelledby="footer-system"><h2 id="footer-system">System</h2><a href="#about">About FloodSense</a><Link to="/explore">Explore Flood Inventory</Link><a href="#about">How It Works</a></section>
          <section aria-labelledby="footer-standard"><h2 id="footer-standard">Standard</h2><a href="#dashboard">Risk Indicators</a><a href="#dashboard">Route Comparison</a><a href="#dashboard">Scenario Explorer</a></section>
          <section aria-labelledby="footer-workspace"><h2 id="footer-workspace">Workspace</h2><button type="button" onClick={() => setAuthOpen(true)}>Login / Sign Up</button><a href="#dashboard">Open Dashboard</a><a href="#dashboard">Route planner</a></section>
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


    </div>

  );

}

function RootRoutes() {
  return <ThemeProvider><BrowserRouter><Routes>
    <Route path="/" element={<App />} />
    <Route path="/explore" element={<ExplorePage />} />
    <Route path="*" element={<main className="explore-page"><h1>Page not found</h1><Link to="/">Back to Home</Link></main>} />
  </Routes></BrowserRouter></ThemeProvider>;
}

createRoot(document.getElementById('root')!).render(<RootRoutes />);
