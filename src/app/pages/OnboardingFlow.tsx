import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { calculateDynamicPremium } from '../services/ai-premium-engine';
import { DataError, zones } from '../data/provider';
import type { DataProvider, Session, Tier, Zone } from '../data/provider';
import { readableError } from '../data/use-resource';

export function OnboardingFlow({ provider, session, onDone, onExpired }: {
  provider: DataProvider; session: Session; onDone: () => void; onExpired: () => void;
}) {
  const [zone, setZone] = useState<Zone>('mumbai');
  const [tier, setTier] = useState<Tier>('standard');
  const [income, setIncome] = useState('5000');
  const [hours, setHours] = useState('40');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const incomePaise = Math.round(Number(income) * 100);
  const premium = calculateDynamicPremium({ weeklyIncome: Number(income), weeklyHours: Number(hours),
    city: zone, platform: session.platformId }, tier).finalPremium;
  const premiumPaise = Math.min(premium * 100, Math.max(1500, Math.floor(incomePaise * 0.15)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await provider.enroll(session, { zone, tier, weeklyIncomePaise: incomePaise, weeklyMinutes: Math.round(Number(hours) * 60),
        premiumPaise, worker: { identity: 'SIMULATED worker identity', phone: 'SIMULATED phone', bank: 'SIMULATED bank details' } });
      onDone();
    } catch (error) {
      if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setError(readableError(error));
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section className="glass-card ps-card">
      <h2>Set up your policy</h2>
      <p className="ps-muted">Platform {session.platformId}. Enrollment uses simulated worker details.</p>
      <form className="ps-form" onSubmit={submit}>
        <div className="zs-grid-2">
          <label className="zs-label">Coverage zone
            <select className="zs-input" value={zone} onChange={(event) => setZone(event.target.value as Zone)}>
              {zones.map((name) => <option value={name} key={name}>{name}</option>)}
            </select>
          </label>
          <label className="zs-label">Plan
            <select className="zs-input" value={tier} onChange={(event) => setTier(event.target.value as Tier)}>
              <option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option>
            </select>
          </label>
          <label className="zs-label">Weekly income (INR)
            <input className="zs-input" type="number" value={income} min={15} max={1000000} step="0.01" onChange={(event) => setIncome(event.target.value)} required />
          </label>
          <label className="zs-label">Weekly working hours
            <input className="zs-input" type="number" value={hours} min={0.1} max={168} step="0.1" onChange={(event) => setHours(event.target.value)} required />
          </label>
        </div>
        <p>Quoted premium <strong>₹{(premiumPaise / 100).toLocaleString('en-IN')}</strong> per week</p>
        {error && <p className="ps-error" role="alert">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Waiting for ledger commit…' : 'Enroll policy'}</button>
      </form>
    </section>
  );
}
