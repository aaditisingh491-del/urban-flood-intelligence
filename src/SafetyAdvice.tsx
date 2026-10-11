import { ArrowDownRight, ArrowRight, CarFront, Compass } from 'lucide-react';

export default function SafetyAdvice() {
  return <div className="advice-list">
    <details className="advice" open><summary><div className="advice-icon amber"><CarFront size={18} /></div><div><b>Move vehicles away from low-lying parking</b><span>If authorities issue a local flood warning, move vehicles only when safe. Never drive or walk through floodwater.</span></div><ArrowRight size={16} /></summary><p>Do not enter rising water to retrieve a vehicle. This app does not have verified parking-site closure data.</p></details>
    <details className="advice"><summary><div className="advice-icon red"><ArrowDownRight size={18} /></div><div><b>Avoid driving through floodwater</b><span>Turn around when water covers the road or its depth is uncertain.</span></div><ArrowRight size={16} /></summary><p>Floodwater may hide road damage, open drains, or strong currents. Use official road-closure notices and emergency guidance.</p></details>
    <details className="advice"><summary><div className="advice-icon green"><Compass size={18} /></div><div><b>Choose a route using official updates</b><span>Check road closures and emergency updates before travelling.</span></div><ArrowRight size={16} /></summary><p>Mapped vulnerability locations and modeled route results are incomplete. A route without a mapped hazard is not confirmed safe.</p></details>
    <p className="emergency-guidance"><b>Immediate danger?</b> Contact local emergency services and follow official government and disaster-management guidance.</p>
  </div>;
}
