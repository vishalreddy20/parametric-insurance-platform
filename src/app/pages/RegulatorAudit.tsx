import { useCallback, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { zones, type DataProvider, type Session, type Zone } from '../data/provider';
import { useResource } from '../data/use-resource';
import { dateLabel, money } from './WorkerDashboard';

function currentWeek() {
  const local = new Date(Date.now() + 19_800_000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
}

export function RegulatorAudit({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const [zone, setZone] = useState<Zone>('mumbai');
  const [week, setWeek] = useState(currentWeek);
  const monday = week && new Date(week + 'T00:00:00Z').getUTCDay() === 1;
  const load = useCallback(async () => {
    const [events, totals] = await Promise.all([
      provider.events(session, zone), monday ? provider.reconciliation(session, zone, week) : null,
    ]);
    return { zone, week, events: events.sort((a, b) => b.windowStart - a.windowStart), totals };
  }, [provider, session, zone, week, monday]);
  const { value, loading, error, refresh } = useResource(load, onExpired);
  const current = value?.zone === zone && value.week === week ? value : undefined;
  const totals = current?.totals;

  return <div className="insurer-console">
    <header className="insurer-title">
      <div><p className="account-kicker"><ClipboardList size={16} aria-hidden="true" /> Regulatory oversight</p>
        <h1>Ledger audit</h1><p>Read-only disruption events and payout reconciliation by zone.</p></div>
      <Button variant="outline" className="account-quiet" onClick={refresh} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</Button>
    </header>
    <section className="account-panel insurer-filters" aria-label="Audit filters">
      <div><label htmlFor="audit-zone">Zone</label><select id="audit-zone" className="account-input" value={zone} onChange={(event) => setZone(event.target.value as Zone)}>
        {zones.map((name) => <option key={name} value={name}>{name}</option>)}
      </select></div>
      <div><label htmlFor="audit-week">Week starting Monday (IST)</label><input id="audit-week" className="account-input" type="date" value={week} aria-invalid={!monday}
        aria-describedby={!monday ? 'audit-week-error' : undefined} onChange={(event) => setWeek(event.target.value)} /></div>
      {!monday && <p id="audit-week-error">Choose a Monday to load weekly totals.</p>}
    </section>
    {loading && <p role="status">Loading ledger audit…</p>}
    {error && <div className="account-message account-error" role="alert">{error} <Button variant="outline" onClick={refresh}>Retry</Button></div>}
    {totals && <section className="account-panel">
      <h2>Weekly payout reconciliation</h2><p>Payment rail: simulated</p>
      <dl className="worker-details">
        <div><dt>Reserved</dt><dd>{totals.reservedCount} · {money(totals.reservedPaise)}</dd></div>
        <div><dt>Settled</dt><dd>{totals.settledCount} · {money(totals.settledPaise)}</dd></div>
        <div><dt>Failed</dt><dd>{totals.failedCount} · {money(totals.failedPaise)}</dd></div>
      </dl>
    </section>}
    {current && <section className="account-panel"><h2>Disruption events</h2><p>Oracle inputs: synthetic</p>
      {!current.events.length && <p>No events recorded for this zone.</p>}
      {current.events.map((event) => <article key={event.eventKey} className="insurer-event">
        <header><div><h3>{event.triggerType.replaceAll('_', ' ')}</h3><p>{dateLabel(event.windowStart)}</p></div>
          <span className="worker-status" data-status={event.status === 'DECLARED' ? 'ACTIVE' : 'RESERVED'}>{event.status}</span></header>
        <p>{event.readings.filter(({ breach }) => breach).length} threshold breaches / {event.quorum} required</p>
        <details><summary>Event reference and oracle readings</summary><p><code>{event.eventKey}</code></p>
          <ul>{event.readings.map((reading) => <li key={reading.oracleId}><code>{reading.oracleId}</code> · {reading.value} {event.unit} · {reading.breach ? 'Breach' : 'Below threshold'}</li>)}</ul>
        </details>
      </article>)}
    </section>}
  </div>;
}
