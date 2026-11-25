import { useCallback, useRef, useState } from 'react';
import { Activity, BarChart3, CloudRain, RefreshCw } from 'lucide-react';
import { DataError, zones } from '../data/provider';
import type { DataProvider, PolicyStatus, Session, SimulationMode, Zone } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';
import { SessionHeader } from './SessionHeader';
import { dateLabel, money } from './WorkerDashboard';

const statuses: PolicyStatus[] = ['ACTIVE', 'PENDING_PREMIUM', 'PAUSED', 'EXPIRED', 'CANCELLED'];
function currentISTWeek() {
  const local = new Date(Date.now() + 19800 * 1000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
}

export function AdminPanel({ provider, session, onExpired, logout }: {
  provider: DataProvider; session: Session; onExpired: () => void; logout: () => void;
}) {
  const [zone, setZone] = useState<Zone>('mumbai');
  const [status, setStatus] = useState<PolicyStatus>('ACTIVE');
  const [week, setWeek] = useState(currentISTWeek);
  const [mode, setMode] = useState<SimulationMode>('normal');
  const [simMessage, setSimMessage] = useState('');
  const [simError, setSimError] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const running = useRef(false);
  const regulator = session.role === 'regulator';
  const load = useCallback(async () => {
    const [policies, events, report, reconciliation] = await Promise.all([
      (regulator ? [] : provider.policies(session, zone, status)), provider.events(session, zone), provider.benchmark(session),
      regulator && week ? provider.reconciliation(session, zone, week) : null,
    ]);
    return { policies, events, report, reconciliation, zone, status, week };
  }, [provider, session, zone, status, week, regulator]);
  const { value, loading, error, refresh } = useResource(load, onExpired, 8000);
  const current = value?.zone === zone && value.status === status && value.week === week ? value : undefined;

  async function simulate() {
    if (running.current) return;
    running.current = true;
    setSimBusy(true); setSimMessage(''); setSimError('');
    try {
      const result = await provider.simulate(session, zone, mode);
      setSimMessage('SIMULATED storm · ' + result.event.status + ' · ' + result.event.eventKey);
      refresh();
    } catch (error) {
      if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setSimError(readableError(error));
    } finally { running.current = false; setSimBusy(false); }
  }

  return (
    <>
      <SessionHeader title={regulator ? 'Read-only regulator view' : 'Insurer dashboard'} logout={logout} />
      <main className="ps-main">
        <div className="ps-section-heading"><h2>{regulator ? 'Ledger audit' : 'Coverage and events'}</h2>
          <button className="btn-secondary" disabled={loading} onClick={refresh}><RefreshCw size={15} /> Refresh</button></div>
        <div className="ps-filters">
          <label className="zs-label">Zone <select aria-label="Zone" className="zs-input" value={zone} onChange={(event) => setZone(event.target.value as Zone)}>
            {zones.map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          {!regulator && <label className="zs-label">Policy status <select className="zs-input" value={status} onChange={(event) => setStatus(event.target.value as PolicyStatus)}>
            {statuses.map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}
          </select></label>}
          {regulator && <label className="zs-label">Week starting Monday (IST) <input type="date" className="zs-input" value={week} onChange={(event) => setWeek(event.target.value)} /></label>}
        </div>
        {error && <p className="ps-error" role="alert">{error} <button className="btn-secondary" onClick={refresh}>Retry</button></p>}
        {loading && !current && <p role="status">Loading ledger views…</p>}
        {!regulator && <section className="glass-card ps-card">
          <h3><CloudRain size={19} /> Simulate a storm</h3><span className="badge badge-info">SIMULATED ORACLE DATA</span>
          <p className="ps-muted">Choose an unused zone for each mode in the current hour.</p>
          <div className="ps-filters">
            <label className="zs-label">Oracle scenario <select className="zs-input" value={mode} onChange={(event) => setMode(event.target.value as SimulationMode)}>
              <option value="normal">Three online</option><option value="offline">One offline</option><option value="disagree">One disagrees</option>
            </select></label>
            <button className="btn-primary" disabled={simBusy} onClick={() => { void simulate(); }}>{simBusy ? 'Submitting signed readings…' : 'Run simulation'}</button>
          </div>
          {simMessage && <p role="status">{simMessage}</p>}
          {simError && <p className="ps-error" role="alert">{simError}</p>}
        </section>}
        {current && <>
          <div className="zs-grid-2">
            {!regulator && <section className="glass-card ps-card"><h3>Policies · {current.policies.length}</h3>
              {!current.policies.length && <p className="ps-muted">No matching policies.</p>}
              <ul className="ps-list">{current.policies.map((policy) => <li key={policy.id}>
                <div><strong>{policy.id}</strong><p>{policy.terms.platform} · {policy.terms.tier}</p></div>
                <span>{money(policy.terms.premiumPaise)}</span>
              </li>)}</ul>
            </section>}
            <section className="glass-card ps-card"><h3><Activity size={19} /> Events</h3><span className="badge badge-info">SIMULATED ORACLE DATA</span>
              {!current.events.length && <p className="ps-muted">No events in this zone.</p>}
              <ul className="ps-list">{current.events.map((event) => <li key={event.eventKey}>
                <div><strong>{event.triggerType.replaceAll('_', ' ')}</strong><p>{dateLabel(event.windowStart)} · {event.readings.filter((reading) => reading.breach).length}/{event.quorum} quorum</p></div>
                <span className="badge badge-info">{event.status}</span>
              </li>)}</ul>
            </section>
          </div>
          {current.reconciliation && <section className="glass-card ps-card">
            <h3>Weekly reconciliation</h3>
            <div className="zs-grid-3">
              <p>Reserved <strong>{current.reconciliation.reservedCount} · {money(current.reconciliation.reservedPaise)}</strong></p>
              <p>Settled <strong>{current.reconciliation.settledCount} · {money(current.reconciliation.settledPaise)}</strong></p>
              <p>Failed <strong>{current.reconciliation.failedCount} · {money(current.reconciliation.failedPaise)}</strong></p>
            </div>
          </section>}
          <section className="glass-card ps-card"><h3><BarChart3 size={19} /> Surge benchmark</h3>
            {current.report ? <>
              <p>{current.report.environment.network} · {current.report.completedAt} · {current.report.passed ? 'PASS' : 'FAIL'}</p>
              <div className="zs-grid-3">
                <p>Throughput <strong>{current.report.metrics.tps === undefined ? '—' : current.report.metrics.tps + ' TPS'}</strong></p>
                <p>p50 / p95 <strong>{current.report.metrics.p50Ms ?? '—'} / {current.report.metrics.p95Ms ?? '—'} ms</strong></p>
                <p>Failures / MVCC retries <strong>{current.report.metrics.failures ?? '—'} / {current.report.metrics.mvccRetries ?? '—'}</strong></p>
              </div>
            </> : <p className="ps-muted">No verified benchmark report is available.</p>}
          </section>
        </>}
      </main>
    </>
  );
}
