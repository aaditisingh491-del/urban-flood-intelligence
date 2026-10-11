import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, PhoneCall, ShieldAlert, X } from 'lucide-react';
import './emergency-mode.css';

export type EmergencyContext = {
  sourceName?: string;
  destinationName?: string;
  verifiedIncidentCount?: number;
  forecastGeneratedAt?: string;
  forecastProvider?: string;
  dataUnavailable?: boolean;
};

const GUIDANCE = [
  'If water is rising rapidly, move to higher ground and follow official evacuation instructions.',
  'Never walk, swim, or drive through floodwater.',
  'Stay away from drains, underpasses, submerged electrical equipment, and downed power lines.',
  'If trapped by rising water, contact local emergency services and follow their instructions.',
  'Do not enter floodwater to rescue another person. Seek trained emergency responders.',
  'If driving, turn around rather than entering a flooded road when it is safe to do so.',
] as const;

const CHECKLIST = [
  'I know where to find official local alerts.',
  'I have identified higher ground or a safer place nearby.',
  'I will avoid walking or driving through floodwater.',
  'I can contact someone I trust if conditions worsen.',
] as const;
const CHECKLIST_KEY = 'floodsense-emergency-checklist-v1';

function readChecklist(): boolean[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '[]');
    return CHECKLIST.map((_, index) => Array.isArray(parsed) && parsed[index] === true);
  } catch { return CHECKLIST.map(() => false); }
}

export default function EmergencyModeControl({ context = {} }: { context?: EmergencyContext }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(readChecklist);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checked)); } catch { /* Checklist still works for this session. */ }
  }, [checked]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const heading = dialog.current?.querySelector<HTMLElement>('[data-emergency-heading]');
    heading?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger.current?.focus();
    };
  }, [open]);

  function toggleChecklist(index: number) {
    setChecked(current => current.map((value, item) => item === index ? !value : value));
  }

  return <>
    <button ref={trigger} className="emergency-mode-trigger" type="button" aria-label="Emergency Mode" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <ShieldAlert size={16} aria-hidden="true"/><span>Emergency Mode</span>
    </button>
    {open && <div className="emergency-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} className="emergency-dialog" role="dialog" aria-modal="true" aria-labelledby="emergency-title" tabIndex={-1}>
        <header className="emergency-header">
          <div className="emergency-heading"><span className="emergency-symbol"><AlertTriangle size={21}/></span><div><p>FLOODSENSE · QUICK SAFETY GUIDE</p><h1 id="emergency-title" data-emergency-heading tabIndex={-1}>Emergency Mode</h1></div></div>
          <button className="emergency-exit" type="button" onClick={() => setOpen(false)}><X size={18}/><span>Exit Emergency Mode</span></button>
        </header>
        <div className="emergency-scroll">
          <p className="emergency-urgent"><strong>If you are in immediate danger, call emergency services.</strong> Follow instructions from local authorities. FloodSense is not an emergency service and does not replace official guidance.</p>
          <div className="emergency-main-grid">
            <section aria-labelledby="emergency-actions-title" className="emergency-card emergency-actions-card">
              <h2 id="emergency-actions-title">Do these things first</h2>
              <ol className="emergency-guidance">{GUIDANCE.map((instruction, index) => <li key={instruction}><span aria-hidden="true">{index + 1}</span><p>{instruction}</p></li>)}</ol>
            </section>
            <aside className="emergency-side">
              <section className="emergency-card emergency-call-card" aria-labelledby="emergency-contacts-title">
                <h2 id="emergency-contacts-title">Emergency contacts</h2>
                <p>India’s Emergency Response Support System (ERSS)</p>
                <a className="emergency-call" href="tel:112"><PhoneCall size={19}/><span><small>Call emergency services</small><strong>112</strong></span></a>
                <a className="emergency-resource" href="https://112.gov.in/faq" target="_blank" rel="noreferrer">Official 112 information <ExternalLink size={14}/></a>
              </section>
              <section className="emergency-card" aria-labelledby="emergency-resources-title">
                <h2 id="emergency-resources-title">Official updates</h2>
                <a className="emergency-resource" href="https://sachet.ndma.gov.in/" target="_blank" rel="noreferrer">NDMA SACHET alerts <ExternalLink size={14}/></a>
                <a className="emergency-resource" href="https://ksdma.karnataka.gov.in/" target="_blank" rel="noreferrer">Karnataka State Disaster Management Authority <ExternalLink size={14}/></a>
                <p className="emergency-small">Official websites need an internet connection. If a link is unavailable, use your local authority’s verified channels.</p>
              </section>
            </aside>
          </div>
          <section className="emergency-card emergency-context-card" aria-labelledby="emergency-context-title">
            <h2 id="emergency-context-title">Your selected location and data</h2>
            <div className="emergency-selected-locations">
              <p><strong>Selected source:</strong> {context.sourceName || 'No source selected'}</p>
              <p><strong>Selected destination:</strong> {context.destinationName ? `${context.destinationName} (flood-vulnerability inventory location; not a confirmed active flood)` : 'No destination selected'}</p>
            </div>
            {context.verifiedIncidentCount != null && <p><strong>Verified current incidents recorded nearby:</strong> {context.verifiedIncidentCount}. This reflects available records only and is not an all-clear.</p>}
            {context.forecastGeneratedAt && <p><strong>Forecast:</strong> {context.forecastProvider || 'Weather provider'} response fetched {new Date(context.forecastGeneratedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' })}. Forecast conditions do not confirm flooding.</p>}
            {context.dataUnavailable || (!context.verifiedIncidentCount && !context.forecastGeneratedAt) ? <p className="emergency-data-warning" role="status">Current incident or forecast data is unavailable for this selection. Do not interpret missing data as an all-clear. Essential instructions above do not require a network connection.</p> : null}
          </section>
          <section className="emergency-card emergency-checklist-card" aria-labelledby="emergency-checklist-title">
            <h2 id="emergency-checklist-title">Quick preparedness checklist</h2>
            <p>Tap items as you complete or confirm them.</p>
            <div className="emergency-checklist">{CHECKLIST.map((item, index) => <label key={item} className={checked[index] ? 'is-checked' : ''}><input type="checkbox" checked={checked[index]} onChange={() => toggleChecklist(index)}/><span className="emergency-check-icon" aria-hidden="true"><Check size={15}/></span><span>{item}</span></label>)}</div>
          </section>
          <p className="emergency-offline-note"><strong>Offline note:</strong> These instructions are bundled with the app and remain visible after it has loaded, without a weather or routing request. Maps, live data, and external links may need internet access.</p>
        </div>
        <footer className="emergency-footer"><span>In immediate danger? Call <a href="tel:112">112</a> and follow official responder instructions.</span><button type="button" onClick={() => setOpen(false)}><ArrowLeft size={16}/> Return to FloodSense</button></footer>
      </section>
    </div>}
  </>;
}
