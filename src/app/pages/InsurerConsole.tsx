import { useCallback, useRef, useState } from 'react';
import { BarChart3, CircleCheck, CloudRain, Radio, RefreshCw, Shield } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataError, zones, type DataProvider, type DisruptionEvent, type PolicyStatus, type Session, type SimulationMode, type SimulationResult, type Zone } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';
import { dateLabel, money } from './WorkerDashboard';

const statuses: PolicyStatus[] = ['ACTIVE', 'PENDING_PREMIUM', 'PAUSED', 'EXPIRED', 'CANCELLED'];
const scenarios: { id: SimulationMode; name: string; description: string }[] = [
  { id: 'normal', name: 'All oracles online', description: 'Submit readings from every configured source.' },
  { id: 'disagree', name: 'One oracle disagrees', description: 'Submit one reading below the threshold.' },
  { id: 'offline', name: 'One oracle offline', description: 'Leave out one source and check quorum.' },
];
const caption = (value: string) => value.replaceAll('_', ' ');

function EventSummary({ event }: { event: DisruptionEvent }) {
  return <article className="insurer-event">
    <header><div><h3>{caption(event.triggerType)}</h3><p>{dateLabel(event.windowStart)}</p></div>
      <span className="worker-status" data-status={event.status === 'DECLARED' ? 'ACTIVE' : 'RESERVED'}>{event.status}</span></header>
    <p>{event.readings.filter(({ breach }) => breach).length} threshold breaches / {event.quorum} required</p>
    <details><summary>Signed readings</summary><ul>
      {event.readings.map((reading) => <li key={reading.oracleId}><code>{reading.oracleId}</code> · {reading.value} {event.unit} · {reading.breach ? 'Breach' : 'Below threshold'}</li>)}
    </ul></details>
  </article>;
}

export function InsurerConsole({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const [zone, setZone] = useState<Zone>('mumbai');
  const [status, setStatus] = useState<PolicyStatus>('ACTIVE');
  const [mode, setMode] = useState<SimulationMode>('normal');
  const [result, setResult] = useState<SimulationResult>();
  const [simError, setSimError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const load = useCallback(async () => {
    const [policies, events] = await Promise.all([provider.policies(session, zone, status), provider.events(session, zone)]);
    return { zone, status, policies, events: events.sort((a, b) => b.windowStart - a.windowStart) };
  }, [provider, session, zone, status]);
  const { value, loading, error, refresh } = useResource(load, onExpired);
  const current = value?.zone === zone && value.status === status ? value : undefined;

  async function simulate() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setSimError('');
    setResult(undefined);
    try {
      setResult(await provider.simulate(session, zone, mode));
      refresh();
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setSimError(readableError(failure));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return <div className="insurer-console">
    <header className="insurer-title">
      <div><p className="account-kicker"><Shield size={16} aria-hidden="true" /> Underwriting</p>
        <h1>Insurer underwriting and risk console</h1><p>Review coverage by zone and inspect declared disruptions.</p></div>
      <div className="account-actions">
        <Button asChild variant="outline" className="account-quiet"><Link to="/insurer/surge"><BarChart3 aria-hidden="true" /> Surge results</Link></Button>
        <Button className="account-button" onClick={refresh} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</Button>
      </div>
    </header>
    <div className="stitch-context-strip"><span>Signed in as {session.username}</span><span>Payment rail: simulated · Oracle inputs: synthetic</span></div>
    <section className="account-panel insurer-filters" aria-label="Ledger filters">
      <div className="account-field"><label htmlFor="insurer-zone">Zone</label><select id="insurer-zone" className="account-input" disabled={busy} value={zone} onChange={(event) => {
        setZone(event.target.value as Zone); setResult(undefined); setSimError('');
      }}>{zones.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
      <div className="account-field"><label htmlFor="insurer-policy-status">Policy status</label><select id="insurer-policy-status" className="account-input" value={status} onChange={(event) => setStatus(event.target.value as PolicyStatus)}>
        {statuses.map((item) => <option value={item} key={item}>{caption(item)}</option>)}</select></div>
    </section>
    {error && <p role="alert" className="account-message account-error">{error} <Button variant="outline" className="account-quiet" onClick={refresh}>Retry</Button></p>}
    {loading && !current && <p role="status">Loading ledger views…</p>}
    {current && !error && <>
      <dl className="insurer-metrics worker-metrics"><div><dt>Matching policies</dt><dd>{current.policies.length}</dd></div>
        <div><dt>Declared events in zone</dt><dd>{current.events.filter(({ status }) => status === 'DECLARED').length}</dd></div>
        <div><dt>Pending events in zone</dt><dd>{current.events.filter(({ status }) => status === 'PENDING').length}</dd></div></dl>
      <Tabs className="worker-tabs insurer-tabs" defaultValue="policies">
        <TabsList aria-label="Risk console views"><TabsTrigger value="policies">Policies by zone</TabsTrigger><TabsTrigger value="events">Disruption events</TabsTrigger></TabsList>
        <TabsContent value="policies"><section className="account-panel insurer-data"><h2>Policies in {current.zone}</h2>
          {current.policies.length ? <ul className="insurer-policies">{current.policies.map((policy) => <li key={policy.id}>
            <div><strong>{policy.terms.tier} plan</strong><code>{policy.id}</code></div>
            <span>{policy.terms.platform}</span><span>{caption(policy.status)}</span><span>{money(policy.terms.premiumPaise)} / week</span>
          </li>)}</ul> : <p>No policies match this zone and status.</p>}
        </section></TabsContent>
        <TabsContent value="events"><section className="account-panel insurer-data"><h2>Disruption events in {current.zone}</h2>
          {current.events.length ? current.events.map((event) => <EventSummary key={event.eventKey} event={event} />)
            : <p>No signed disruption events are recorded in this zone.</p>}
        </section></TabsContent>
      </Tabs>
    </>}
    <section className="account-panel insurer-simulation">
      <header className="security-panel-heading"><div><p className="account-kicker"><CloudRain size={16} aria-hidden="true" /> Oracle inputs: synthetic</p>
        <h2>Storm simulation</h2><p>Submit signed synthetic observations for {zone}. Use a fresh zone when comparing scenarios in the same hour.</p></div></header>
      <div className="insurer-simulation-grid">
        <div className="insurer-simulation-form">
          <RadioGroup aria-label="Oracle scenario" value={mode} disabled={busy} onValueChange={(item) => setMode(item as SimulationMode)}>
            {scenarios.map(({ id, name, description }) => <label className="insurer-scenario" key={id}>
              <RadioGroupItem value={id} /><span><strong>{name}</strong><small>{description}</small></span>
            </label>)}
          </RadioGroup>
          <Button className="account-button" onClick={() => { void simulate(); }} disabled={busy}>
            <CloudRain aria-hidden="true" /> {busy ? 'Submitting signed readings…' : 'Run storm simulation'}
          </Button>
        </div>
        <div className="insurer-simulation-result" aria-live="polite">
          <h3><Radio size={18} aria-hidden="true" /> Gateway result</h3>
          {busy ? <p role="status">Waiting for signed ledger commits…</p> :
            simError ? <p role="alert">{simError}</p> :
            result ? <>
              <p><CircleCheck size={16} aria-hidden="true" /> <strong>{result.event.status}</strong> · {result.readings.length} signed submissions</p>
              <code>{result.event.eventKey}</code>
              {result.offlineOracle && <p>Offline: <code>{result.offlineOracle}</code></p>}
              <ul>{result.readings.map((reading) => <li key={reading.oracleId}><strong>{reading.oracleId}</strong> · {reading.submittedValue} {result.event.unit} · block {reading.blockNumber}
                <code>{reading.txId}</code></li>)}</ul>
            </> : <p>Run a scenario to see the committed readings and quorum result.</p>}
        </div>
      </div>
    </section>
  </div>;
}
