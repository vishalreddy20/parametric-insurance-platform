import { useCallback, useRef, useState } from 'react';
import { Activity, CreditCard, FileText, RefreshCw, Shield } from 'lucide-react';
import { DataError } from '../data/provider';
import type { DataProvider, Payout, Session } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';
import { OnboardingFlow } from './OnboardingFlow';
import { SessionHeader } from './SessionHeader';

export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export const dateLabel = (seconds?: number) => seconds
  ? new Date(seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '—';

function Proof({ provider, session, payout, onExpired }: {
  provider: DataProvider; session: Session; payout: Payout; onExpired: () => void;
}) {
  const load = useCallback(async () => {
    const [event, proof] = await Promise.all([
      provider.event(session, payout.eventKey),
      payout.txId ? provider.proof(session, payout.txId, payout.id) : Promise.resolve(null),
    ]);
    return { event, proof };
  }, [provider, session, payout.eventKey, payout.txId, payout.id]);
  const { value, error, loading, refresh } = useResource(load, onExpired);
  if (loading) return <p role="status">Fetching ledger proof…</p>;
  if (error) return <p className="ps-error" role="alert">{error} <button className="btn-secondary" onClick={refresh}>Retry</button></p>;
  if (!value) return <p className="ps-muted">Ledger proof is unavailable.</p>;
  return (
    <div className="ps-proof">
      <dl>
        <dt>Reservation transaction</dt><dd>{payout.txId ?? 'Awaiting proof'}</dd>
        <dt>Block</dt><dd>{value.proof?.blockNumber ?? 'Awaiting the committed event index'}</dd>
        <dt>Event key</dt><dd>{payout.eventKey}</dd>
        <dt>Quorum</dt><dd>{value.event ? value.event.readings.filter((reading) => reading.breach).length + ' breaches / ' + value.event.quorum + ' required' : 'Awaiting event record'}</dd>
      </dl>
      {value.event && <ul className="ps-reading-list">{value.event.readings.map((reading) => (
        <li key={reading.oracleId}>{reading.oracleId} · {reading.value} {value.event!.unit} · {reading.breach ? 'Breach' : 'Below threshold'}</li>
      ))}</ul>}
      {!value.proof && <button className="btn-secondary" onClick={refresh}>Retry proof</button>}
    </div>
  );
}

const tabs = [
  { id: 'overview', label: 'Overview', Icon: Activity }, { id: 'claims', label: 'Claims', Icon: Shield },
  { id: 'payouts', label: 'Payouts', Icon: CreditCard }, { id: 'policy', label: 'My policy', Icon: FileText },
] as const;

export function WorkerDashboard({ provider, session, onExpired, logout }: {
  provider: DataProvider; session: Session; onExpired: () => void; logout: () => void;
}) {
  const [tab, setTab] = useState<typeof tabs[number]['id']>('overview');
  const [selected, setSelected] = useState<string>();
  const [payment, setPayment] = useState('');
  const [paymentError, setPaymentError] = useState(false);
  const [paying, setPaying] = useState(false);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    const policy = await provider.policy(session);
    if (!policy) return { policy, payouts: [], events: [] };
    const [payouts, events] = await Promise.all([provider.payouts(session), provider.events(session, policy.terms.zone)]);
    return { policy, payouts: payouts.sort((a, b) => b.reservedAt - a.reservedAt),
      events: events.sort((a, b) => b.windowStart - a.windowStart) };
  }, [provider, session]);
  const { value, error, loading, refresh } = useResource(load, onExpired, 8000);
  const policy = value?.policy;

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPaying(true);
    setPayment('');
    setPaymentError(false);
    try {
      const result = await provider.payPremium(session);
      const declined = result.status === 'FAILED';
      setPaymentError(declined);
      setPayment(declined ? 'SIMULATED payment failed. The premium remains unpaid.'
        : result.callbackStatus === 'DELIVERED' ? 'SIMULATED premium confirmed.' : 'SIMULATED payment recorded. The ledger confirmation is pending.');
      refresh();
    } catch (error) {
      if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') onExpired();
      else { setPaymentError(true); setPayment(readableError(error)); }
    } finally { inFlight.current = false; setPaying(false); }
  }

  return (
    <>
      <SessionHeader title="Delivery partner dashboard" logout={logout} />
      {policy && <nav className="zs-tab-nav" aria-label="Worker dashboard">
        {tabs.map(({ id, Icon, label }) => <button className={'zs-tab-btn' + (tab === id ? ' is-active' : '')}
          aria-current={tab === id ? 'page' : undefined} key={id} onClick={() => setTab(id)}><Icon size={15} /> {label}</button>)}
      </nav>}
      <main className="ps-main">
        <div className="ps-section-heading"><h2>Delivery protection</h2>
          <button className="btn-secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>
        {loading && !value && <p role="status">Loading policy and settlement records…</p>}
        {error && <p className="ps-error" role="alert">{error} <button className="btn-secondary" onClick={refresh}>Retry</button></p>}
        {value && !policy && <OnboardingFlow provider={provider} session={session} onDone={refresh} onExpired={onExpired} />}
        {policy && value && <>
          {policy.status === 'PENDING_PREMIUM' && <section className="glass-card ps-card">
            <h3>Premium due</h3><p>{money(policy.terms.premiumPaise)} · {policy.terms.tier} plan</p>
            <button className="btn-primary" onClick={() => { void pay(); }} disabled={paying}>
              {paying ? 'Waiting for premium confirmation…' : 'Pay with simulated UPI'}
            </button>
          </section>}
          {payment && <p className={paymentError ? 'ps-error' : 'ps-muted'} role={paymentError ? 'alert' : 'status'}>{payment}</p>}
          {tab === 'overview' && <>
            <div className="zs-grid-3">
              <div className="kpi-card"><div className="kpi-label">Policy status</div><div className="kpi-value">{policy.status.replaceAll('_', ' ')}</div><div className="kpi-sub">{policy.terms.tier} plan · {policy.terms.zone}</div></div>
              <div className="kpi-card"><div className="kpi-label">Weekly income</div><div className="kpi-value">{money(policy.terms.weeklyIncomePaise)}</div><div className="kpi-sub">{policy.terms.weeklyMinutes / 60} hours per week</div></div>
              <div className="kpi-card"><div className="kpi-label">Settled payouts · SIMULATED UPI</div><div className="kpi-value">{money(value.payouts.filter((payout) => payout.status === 'SETTLED').reduce((sum, payout) => sum + payout.amountPaise, 0))}</div></div>
            </div>
            <section className="glass-card ps-card"><h3>Event timeline</h3><span className="badge badge-info">SIMULATED ORACLE DATA</span>
              {!value.events.length && <p className="ps-muted">No events in your coverage zone.</p>}
              <ul className="ps-list">{value.events.map((event) => <li key={event.eventKey}>
                <div><strong>{event.triggerType.replaceAll('_', ' ')}</strong><p>{dateLabel(event.windowStart)} · {event.readings.filter((reading) => reading.breach).length}/{event.quorum} quorum</p></div>
                <span className="badge badge-info">{event.status}</span>
              </li>)}</ul>
            </section>
          </>}
          {(tab === 'claims' || tab === 'payouts') && <section className="glass-card ps-card">
            <h3>{tab === 'claims' ? 'Claim and event records' : 'Payout timeline'}</h3>
            <span className="badge badge-info">SIMULATED UPI</span>
            {!value.payouts.length && <p className="ps-muted">No payouts have been reserved for this policy.</p>}
            <ul className="ps-list">{value.payouts.map((payout) => <li className="ps-payout" key={payout.id}>
              <div className="ps-section-heading"><div><strong>{money(payout.amountPaise)}</strong><p>{dateLabel(payout.finalizedAt ?? payout.reservedAt)}</p></div>
                <span className="badge badge-info">{payout.status}</span></div>
              <button className="btn-secondary" aria-expanded={selected === payout.id}
                onClick={() => setSelected(selected === payout.id ? undefined : payout.id)}>Ledger proof</button>
              {selected === payout.id && <Proof provider={provider} session={session} payout={payout} onExpired={onExpired} />}
            </li>)}</ul>
          </section>}
          {tab === 'policy' && <section className="glass-card ps-card"><h3>My policy</h3>
            <dl className="ps-policy">
              <dt>Policy ID</dt><dd>{policy.id}</dd><dt>Platform</dt><dd>{policy.terms.platform}</dd>
              <dt>Weekly premium</dt><dd>{money(policy.terms.premiumPaise)}</dd>
              <dt>Term starts</dt><dd>{dateLabel(policy.startsAt)}</dd><dt>Waiting period ends</dt><dd>{dateLabel(policy.waitingUntil)}</dd>
              <dt>Term ends</dt><dd>{dateLabel(policy.endsAt)}</dd>
            </dl>
          </section>}
        </>}
      </main>
    </>
  );
}
