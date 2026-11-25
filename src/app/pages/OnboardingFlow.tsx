import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleCheck, ClipboardCheck, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { DataError, zones, type DataProvider, type EnrollmentConfirmation, type OnboardingDraft, type Policy, type Session, type Tier, type Zone } from '../data/provider';
import { readableError } from '../data/use-resource';
import { calculateDynamicPremium, TIER_CONFIG } from '../services/ai-premium-engine';

const steps = ['Profile', 'Plan', 'Review', 'Activation'];
const tiers = ['basic', 'standard', 'premium'] as const;
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const formatMoney = (paise: number) => rupees.format(paise / 100);
const percent = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const emptyDraft: OnboardingDraft = { step: 0, name: '', phone: '', upi: '', zone: '', income: '', hours: '', tier: 'standard' };

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="account-panel onboarding-panel"><h2>{title}</h2><div>{children}</div></section>;
}

function quote(draft: OnboardingDraft, platform: Session['platformId'], tier = draft.tier) {
  const breakdown = calculateDynamicPremium({
    weeklyIncome: Number(draft.income), weeklyHours: Number(draft.hours), city: draft.zone, platform,
  }, tier);
  const cap = Math.max(1500, Math.floor(Math.round(Number(draft.income) * 100) * 0.15));
  return { ...breakdown, paise: Math.min(breakdown.finalPremium * 100, cap) };
}

function validProfile(value: OnboardingDraft) {
  const income = Number(value.income), hours = Number(value.hours);
  return value.name.trim().length >= 2 && /^(?:\+91[ -]?)?[6-9][0-9]{9}$/.test(value.phone.trim())
    && /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(value.upi.trim()) && Boolean(value.zone)
    && income >= 15 && income <= 1_000_000 && hours >= .1 && hours <= 168;
}

export function OnboardingFlow({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(emptyDraft);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [confirmation, setConfirmation] = useState<EnrollmentConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const inFlight = useRef(false);
  const failure = (reason: unknown) => {
    if (reason instanceof DataError && reason.code === 'ERR_SESSION_EXPIRED') onExpired();
    else setError(readableError(reason));
  };

  useEffect(() => {
    let live = true;
    void Promise.all([provider.onboarding(session), provider.policy(session)]).then(([saved, current]) => {
      if (!live) return;
      if (saved.draft) setDraft({ ...saved.draft, step: validProfile(saved.draft) ? saved.draft.step : 0 });
      setConfirmation(saved.confirmation);
      setPolicy(current);
    }).catch((reason) => {
      if (!live) return;
      if (reason instanceof DataError && reason.code === 'ERR_SESSION_EXPIRED') onExpired();
      else { setLoadFailed(true); setError(readableError(reason)); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [provider, session, onExpired, revision]);

  const step = policy ? 3 : draft.step;
  const platform = session.platformId === 'swiggy' ? 'Swiggy' : 'Zomato';
  const price = step === 1 || step === 2 ? quote(draft, session.platformId) : null;
  const change = <K extends keyof OnboardingDraft,>(field: K, value: OnboardingDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice('');
  };

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (reason) { failure(reason); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function save(next: number, leave = false) {
    return run(async () => {
      const value = { ...draft, step: next };
      await provider.saveOnboarding(session, value);
      setDraft(value);
      setNotice('Draft saved.');
      if (leave) navigate('/account');
    });
  }

  async function refreshPolicy() {
    const current = await provider.policy(session);
    if (current) setPolicy(current);
    return current;
  }

  function proceed(event: FormEvent) {
    event.preventDefault();
    if (!validProfile(draft)) {
      setError('Enter a name, a valid Indian mobile number, a coverage zone, weekly income and hours, and a UPI-format ID.');
      return;
    }
    if (step < 2) {
      void save(step + 1);
      return;
    }
    if (!draft.zone || !price) return;
    const zone = draft.zone;
    void run(async () => {
      const committed = await provider.enroll(session, {
        zone, tier: draft.tier, weeklyIncomePaise: Math.round(Number(draft.income) * 100),
        weeklyMinutes: Math.round(Number(draft.hours) * 60), premiumPaise: price.paise,
        worker: { identity: draft.name.trim(), phone: draft.phone.trim(), bank: draft.upi.trim() },
      });
      setPolicy(committed.result);
      setConfirmation({ txId: committed.txId, blockNumber: committed.blockNumber });
      setDraft(emptyDraft);
    });
  }

  const pay = () => run(async () => {
    const result = await provider.payPremium(session);
    const current = await refreshPolicy();
    if (current?.status === 'ACTIVE') return;
    if (result.status === 'FAILED') setError('Simulated premium payment failed.');
    else setNotice('Premium payment was recorded. Refresh to check ledger confirmation.');
  });

  if (loading) return <p role="status">Loading onboarding…</p>;
  if (loadFailed) return <section className="account-panel">
    <p role="alert">{error}</p>
    <Button className="account-button" onClick={() => { setLoading(true); setLoadFailed(false); setError(''); setRevision((value) => value + 1); }}>Retry</Button>
  </section>;

  return <div className="onboarding">
    <nav aria-label="Onboarding progress"><ol className="onboarding-stepper">{steps.map((label, index) => <li key={label}
      aria-current={index === step ? 'step' : undefined}>
      <span className="onboarding-step-number">{index < step ? <Check size={16} aria-label="Completed" /> : index + 1}</span>
      <span>{label}<small>{index === step ? 'Current step' : index < step ? 'Completed' : 'Upcoming'}</small></span>
    </li>)}</ol></nav>
    {error && <p role="alert" className="account-message account-error">{error}</p>}
    {notice && <p role="status" className="account-message">{notice}</p>}
    {policy ? <section className="account-panel onboarding-confirmation" aria-labelledby="confirmation-title">
      <p className="account-kicker"><CircleCheck size={18} aria-hidden="true" /> Ledger confirmed</p>
      <h1 id="confirmation-title">{policy.status === 'ACTIVE' ? 'Your policy is active' : 'Policy created'}</h1>
      <p>{policy.status === 'PENDING_PREMIUM' ? 'Confirm the simulated premium to activate your coverage.' : 'Review your recorded coverage and policy details.'}</p>
      <div className="onboarding-confirmation-details">
        <h2>Gateway confirmation details</h2>
        <dl className="onboarding-breakdown"><div><dt>Policy ID</dt><dd><code>{policy.id}</code></dd></div>
          <div><dt>Status</dt><dd>{policy.status.replaceAll('_', ' ')}</dd></div>
          {policy.startsAt && policy.endsAt && <div><dt>Coverage window</dt><dd>{date.format(policy.startsAt * 1000)} – {date.format(policy.endsAt * 1000)} IST</dd></div>}
          <div><dt>Weekly premium</dt><dd>{formatMoney(policy.terms.premiumPaise)}</dd></div>
          <div><dt>Enrollment transaction ID</dt><dd>{confirmation ? <code>{confirmation.txId}</code> : 'Unavailable in this gateway'}</dd></div>
          {confirmation && <div><dt>Enrollment block</dt><dd>{confirmation.blockNumber}</dd></div>}
        </dl>
      </div>
      <p className="auth-note">Payment rail: simulated. No real funds are transferred.</p>
      <div className="account-actions">
        {policy.status === 'PENDING_PREMIUM' && <>
          <Button className="account-button" disabled={busy} onClick={() => { void pay(); }}>{busy ? 'Checking ledger…' : 'Pay simulated premium'}</Button>
          <Button variant="outline" className="account-quiet" disabled={busy} onClick={() => { void run(async () => { await refreshPolicy(); }); }}>Refresh status</Button>
        </>}
        <Button asChild variant={policy.status === 'ACTIVE' ? 'default' : 'outline'} className={policy.status === 'ACTIVE' ? 'account-button' : 'account-quiet'}>
          <Link to="/worker">Go to worker workspace <ArrowRight aria-hidden="true" /></Link>
        </Button>
      </div>
    </section> : <form className="onboarding-form" onSubmit={proceed}>
      <div className="onboarding-grid">
        <div className="onboarding-stack">
          {step === 0 && <section className="account-panel onboarding-panel">
            <header><h1>Worker profile and income baseline</h1><p>Enter the details used to prepare your coverage.</p></header>
            <div className="onboarding-fields">
              <label className="account-field">Full name<Input className="account-input" value={draft.name} required minLength={2} maxLength={120} autoComplete="name" onChange={(event) => change('name', event.target.value)} /></label>
              <label className="account-field">Phone number<Input className="account-input" type="tel" value={draft.phone} required maxLength={32} placeholder="+91 9876543210" autoComplete="tel" onChange={(event) => change('phone', event.target.value)} /></label>
              <div className="onboarding-wide"><p>Delivery platform</p><div className="onboarding-platform">{platform}</div></div>
              <label className="account-field onboarding-wide">City and coverage zone<select className="account-input" required value={draft.zone} onChange={(event) => change('zone', event.target.value as Zone | '')}>
                <option value="">Select a coverage zone</option>{zones.map((name) => <option key={name} value={name}>{name[0].toUpperCase() + name.slice(1)}</option>)}
              </select></label>
              <label className="account-field">Weekly income (INR)<Input className="account-input" type="number" required min={15} max={1000000} step=".01" value={draft.income} onChange={(event) => change('income', event.target.value)} /></label>
              <label className="account-field">Weekly active hours<Input className="account-input" type="number" required min=".1" max="168" step=".1" value={draft.hours} onChange={(event) => change('hours', event.target.value)} /></label>
              <label className="account-field onboarding-wide">UPI ID<Input className="account-input" required maxLength={120} placeholder="name@provider" value={draft.upi} onChange={(event) => change('upi', event.target.value)} /></label>
            </div>
          </section>}
          {step === 1 && price && <>
            <h1>Select protection plan</h1>
            <RadioGroup className="onboarding-options" value={draft.tier} aria-label="Protection plan" onValueChange={(tier) => change('tier', tier as Tier)}>
              {tiers.map((tier) => <label key={tier} className="account-panel onboarding-option">
                <RadioGroupItem value={tier} /><span><strong>{TIER_CONFIG[tier].label}</strong><b>{formatMoney(quote(draft, session.platformId, tier).paise)}</b><small>per week</small></span>
              </label>)}
            </RadioGroup>
            <Panel title="Premium breakdown"><dl className="onboarding-breakdown">
              <div><dt>Base premium ({percent.format(TIER_CONFIG[draft.tier].premiumRate)} of weekly income, rounded)</dt><dd>{formatMoney(price.basePremium * 100)}</dd></div>
              {([
                ['Zone risk', price.cityRiskMultiplier], ['Season', price.seasonalMultiplier],
                ['Platform', price.platformMultiplier], ['Experience adjustment (engine default)', price.experienceDiscount],
                ['Weekly hours', price.hoursMultiplier], ['Claim history (engine default)', price.claimHistoryMultiplier],
              ] as const).map(([label, factor]) => <div key={label}><dt>{label}</dt><dd>{factor.toFixed(2)}×</dd></div>)}
              <div><dt><strong>Calculated weekly premium</strong></dt><dd><strong>{formatMoney(price.paise)}</strong></dd></div>
            </dl></Panel>
          </>}
          {step === 2 && <section className="account-panel onboarding-panel">
            <header><h1>Review and confirm policy</h1><p>Check your worker profile before creating the policy on the ledger.</p></header>
            <div className="onboarding-review">
              <dl className="onboarding-breakdown">{([
                ['Full name', draft.name], ['Phone number', draft.phone], ['Delivery platform', platform],
                ['Coverage zone', draft.zone], ['Weekly income / hours', formatMoney(Math.round(Number(draft.income) * 100)) + ' / ' + draft.hours + ' h'],
                ['UPI ID', draft.upi],
              ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              <Button type="button" variant="outline" className="account-quiet" disabled={busy} onClick={() => { void save(0); }}>Edit profile</Button>
            </div>
          </section>}
        </div>
        <aside className="onboarding-stack">
          {step === 2 && price && <Panel title="Selected policy and premium">
            <p className="onboarding-platform">{TIER_CONFIG[draft.tier].label} plan</p>
            <p>Weekly premium <strong>{formatMoney(price.paise)}</strong></p>
            <Button type="button" variant="outline" className="account-quiet" disabled={busy} onClick={() => { void save(1); }}>Edit plan</Button>
          </Panel>}
          <Panel title={step === 0 ? 'Personal data context' : 'Coverage and settlement'}>
            <p className="auth-note"><ShieldCheck size={18} aria-hidden="true" /> {step === 0
              ? 'Draft details are stored privately for your account. Enrollment sends personal fields to the ledger’s private data collection.'
              : 'Coverage starts when the policy terms take effect after premium confirmation. A declared event alone does not establish eligibility.'}</p>
            <div className="account-disclosures"><span>Payment rail: simulated</span><span>Oracle inputs: synthetic</span></div>
          </Panel>
          {draft.zone && <Panel title="Coverage zone"><p className="onboarding-zone"><MapPin size={18} aria-hidden="true" /> {draft.zone}</p></Panel>}
        </aside>
      </div>
      <div className="account-panel onboarding-actions">
        <Button type="button" variant="outline" className="account-quiet" disabled={busy || step === 0} onClick={() => { void save(step - 1); }}><ArrowLeft aria-hidden="true" /> Back</Button>
        <div className="account-actions">
          <Button type="button" variant="outline" className="account-quiet" disabled={busy} onClick={() => { void save(step, true); }}>Save &amp; exit</Button>
          <Button type="submit" className="account-button" disabled={busy}>
            {busy ? 'Saving…' : step === 0 ? 'Next: Select plan' : step === 1 ? 'Next: Review policy' : 'Confirm and create policy'}
            {step === 2 ? <ClipboardCheck aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </form>}
  </div>;
}
