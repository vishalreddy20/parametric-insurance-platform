import { useCallback, useRef, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Clock3, Copy, FileCheck2, MapPin, Radio, RefreshCw, Shield } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataError, type DataProvider, type DisruptionEvent, type Payout, type Policy, type Session } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const money = (paise: number) => currency.format(paise / 100);
export const dateLabel = (seconds?: number) => seconds
  ? new Date(seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '—';

const label = (value: string) => value.replaceAll('_', ' ');
const eventTitle = (key: string, event?: DisruptionEvent) => label(event?.triggerType ?? key.split('|')[1] ?? key);
const priceWeek = () => {
  const day = new Date(Date.now() + 330 * 60_000);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
};
const filters = ['All payouts', 'SETTLED', 'RESERVED', 'FAILED'] as const;
type Filter = typeof filters[number];

function PayoutStatus({ status }: { status: Payout['status'] }) {
  const Icon = status === 'SETTLED' ? CircleCheck : status === 'FAILED' ? CircleAlert : Clock3;
  return <span className="worker-status" data-status={status}><Icon size={15} aria-hidden="true" />{status}</span>;
}

function PolicyDetails({ policy }: { policy: Policy }) {
  return <dl className="worker-details">
    <div><dt>Policy ID</dt><dd><code>{policy.id}</code></dd></div>
    <div><dt>Delivery platform</dt><dd>{policy.terms.platform}</dd></div>
    <div><dt>Weekly premium</dt><dd>{money(policy.terms.premiumPaise)}</dd></div>
    <div><dt>Coverage begins</dt><dd>{dateLabel(policy.startsAt)}</dd></div>
    <div><dt>Waiting period ends</dt><dd>{dateLabel(policy.waitingUntil)}</dd></div>
    <div><dt>Coverage ends</dt><dd>{dateLabel(policy.endsAt)}</dd></div>
  </dl>;
}

function Proof({ provider, session, payout, onExpired, close, restoreFocus }: {
  provider: DataProvider; session: Session; payout: Payout; onExpired: () => void; close: () => void; restoreFocus: () => void;
}) {
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    const [event, proof] = await Promise.all([
      provider.event(session, payout.eventKey),
      payout.txId ? provider.proof(session, payout.txId, payout.id) : Promise.resolve(null),
    ]);
    return { event, proof };
  }, [provider, session, payout.eventKey, payout.txId, payout.id]);
  const { value, error, loading, refresh } = useResource(load, onExpired);
  const event = value?.event;
  async function copyProof() {
    if (!value?.proof) return;
    const data = {
      payoutId: payout.id, status: payout.status, amountPaise: payout.amountPaise, eventKey: payout.eventKey,
      transactionId: value.proof.transactionId, blockNumber: value.proof.blockNumber,
      reference: payout.reference || null, oracleReadings: event?.readings ?? [],
    };
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setCopied('Proof copied.'); }
    catch { setCopied('Could not copy the proof.'); }
  }

  return <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
    <SheetContent className="worker-proof-drawer" container={document.querySelector<HTMLElement>('.account-shell')}
      onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
      <SheetHeader className="worker-proof-header">
        <SheetTitle><FileCheck2 aria-hidden="true" />Ledger proof</SheetTitle>
        <SheetDescription>Reservation transaction and signed disruption observations.</SheetDescription>
        <div className="account-disclosures"><span>Payment rail: simulated</span><span>Oracle inputs: synthetic</span></div>
      </SheetHeader>
      <div className="worker-proof-body" role="region" aria-label="Proof details" tabIndex={0}>
        <section className="worker-proof-summary">
          <div><PayoutStatus status={payout.status} /><h2>{eventTitle(payout.eventKey, event ?? undefined)}</h2></div>
          <strong>{money(payout.amountPaise)}</strong>
        </section>
        {loading && <p role="status">Fetching ledger proof…</p>}
        {error && <p role="alert" className="account-message account-error">{error}</p>}
        <section className="worker-proof-section">
          <h3>Transaction details</h3>
          <dl className="worker-details">
            <div><dt>Reservation transaction</dt><dd><code>{payout.txId || 'Unavailable'}</code></dd></div>
            <div><dt>Ledger block</dt><dd>{value?.proof?.blockNumber ?? (loading ? 'Looking up block…' : 'Awaiting proof index')}</dd></div>
            <div><dt>Event key</dt><dd><code>{payout.eventKey}</code></dd></div>
            <div><dt>Payment reference</dt><dd>{payout.reference ? <code>{payout.reference}</code> : 'Not recorded yet'}</dd></div>
          </dl>
        </section>
        <section className="worker-proof-section">
          <h3>Oracle quorum</h3>
          {event ? <>
            <p>{event.readings.filter((reading) => reading.breach).length} breaches / {event.quorum} required</p>
            <ul className="worker-oracles">{event.readings.map((reading) => <li key={reading.oracleId}>
              <code>{reading.oracleId}</code><span>{reading.value} {event.unit}</span><span>{reading.breach ? 'Breach' : 'Below threshold'}</span>
              <time>{dateLabel(reading.observedAt)}</time>
            </li>)}</ul>
          </> : <p>{loading ? 'Looking up event…' : 'Event readings are unavailable.'}</p>}
        </section>
      </div>
      <SheetFooter className="worker-proof-footer">
        <span role="status">{copied}</span>
        {!loading && (!value?.proof || error) && <Button variant="outline" className="account-quiet" onClick={refresh}>Retry proof</Button>}
        <Button variant="outline" className="account-quiet" disabled={!value?.proof} onClick={() => { void copyProof(); }}><Copy aria-hidden="true" /> Copy JSON</Button>
        <SheetClose asChild><Button className="account-button">Close proof</Button></SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>;
}

export function WorkerDashboard({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const [tab, setTab] = useState('overview');
  const [filter, setFilter] = useState<Filter>('All payouts');
  const [selected, setSelected] = useState<Payout>();
  const [payment, setPayment] = useState<{ text: string; error?: boolean }>();
  const [paying, setPaying] = useState(false);
  const inFlight = useRef(false);
  const proofTrigger = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    const policy = await provider.policy(session);
    if (!policy) return { policy, payouts: [], events: [], weeklyCapPaise: null };
    const [payouts, events, coverage] = await Promise.all([
      provider.payouts(session), provider.events(session, policy.terms.zone),
      provider.coverage(session).catch((failure) => {
        if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') throw failure;
        return { weeklyCapPaise: null };
      }),
    ]);
    return { policy, payouts: payouts.sort((a, b) => b.reservedAt - a.reservedAt),
      events: events.sort((a, b) => b.windowStart - a.windowStart), weeklyCapPaise: coverage.weeklyCapPaise };
  }, [provider, session]);
  const { value, error, loading, refresh } = useResource(load, onExpired);
  const policy = value?.policy;
  const week = priceWeek();
  const currentWeek = value?.payouts.filter((item) => item.weekStartIST === week) ?? [];
  const used = currentWeek.filter((item) => item.status !== 'FAILED').reduce((sum, item) => sum + item.amountPaise, 0);
  const cap = value?.weeklyCapPaise ?? null;
  const filtered = value?.payouts.filter((item) => filter === 'All payouts' || item.status === filter) ?? [];
  const events = new Map(value?.events.map((event) => [event.eventKey, event]));
  const selectedPayout = selected && (value?.payouts.find(({ id }) => id === selected.id) ?? selected);

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPaying(true);
    setPayment(undefined);
    try {
      const result = await provider.payPremium(session);
      setPayment(result.status === 'FAILED'
        ? { error: true, text: 'Simulated payment failed. The premium remains unpaid.' }
        : { text: result.callbackStatus === 'DELIVERED' ? 'Simulated premium confirmed.' : 'Waiting for ledger confirmation.' });
      refresh();
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setPayment({ error: true, text: readableError(failure) });
    } finally { inFlight.current = false; setPaying(false); }
  }

  const claims = <section className="account-panel worker-payouts">
    <header className="worker-panel-heading"><div><h2>Disruption events and payouts</h2><p>Inspect the ledger proof for an eligible payout.</p></div>
      <label className="worker-filter">Payout status<select className="account-input" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
        {filters.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label></header>
    {filtered.length === 0 && <p className="worker-empty">{filter === 'All payouts' ? 'No payouts have been reserved for this policy.' : 'No payouts match this status.'}</p>}
    <ol className="worker-timeline">{filtered.map((payout) => <li key={payout.id}>
      <div className="worker-payout-summary">
        <div><h3>{eventTitle(payout.eventKey, events.get(payout.eventKey))}</h3><p>{dateLabel(payout.finalizedAt ?? payout.reservedAt)}</p></div>
        <PayoutStatus status={payout.status} /><strong>{money(payout.amountPaise)}</strong>
      </div>
      <dl className="worker-details">
        <div><dt>Event key</dt><dd><code>{payout.eventKey}</code></dd></div>
        {payout.reference && <div><dt>Payment reference</dt><dd><code>{payout.reference}</code></dd></div>}
      </dl>
      <Button variant="outline" className="account-quiet" onClick={(event) => { proofTrigger.current = event.currentTarget; setSelected(payout); }}>
        Inspect ledger proof <ArrowRight aria-hidden="true" />
      </Button>
    </li>)}</ol>
  </section>;

  return <div className="worker-workspace">
    <header className="worker-page-header">
      <div><h1>Worker workspace</h1><p>{session.username} · {policy?.terms.platform ?? session.platformId}</p></div>
      <Button variant="outline" className="account-quiet" onClick={refresh} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</Button>
    </header>
    {loading && !value && <section className="account-panel worker-loading" role="status">Loading policy and payout records…</section>}
    {error && <p role="alert" className="account-message account-error">{error} <Button variant="outline" className="account-quiet" onClick={refresh}>Retry</Button></p>}
    {value && !policy && <section className="account-panel worker-empty-policy"><Shield aria-hidden="true" /><h2>Set up your policy</h2>
      <p>Enter your profile and review the plan before activating coverage.</p>
      <Button asChild className="account-button"><Link to="/worker/onboarding">Start onboarding <ArrowRight aria-hidden="true" /></Link></Button>
    </section>}
    {policy && value && <Tabs value={tab} onValueChange={setTab} className="worker-tabs">
      <TabsList aria-label="Worker workspace sections">
        <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="policy">Active policy</TabsTrigger>
        <TabsTrigger value="claims">Claims and proof</TabsTrigger>
      </TabsList>
      {policy.status === 'PENDING_PREMIUM' && <section className="account-panel worker-premium">
        <div><h2>Premium due</h2><p>{money(policy.terms.premiumPaise)} · Payment rail: simulated</p></div>
        <Button className="account-button" disabled={paying} onClick={() => { void pay(); }}>
          {paying ? 'Waiting for ledger…' : 'Pay simulated premium'}
        </Button>
      </section>}
      {payment && <p className={'account-message' + (payment.error ? ' account-error' : '')} role={payment.error ? 'alert' : 'status'}>{payment.text}</p>}
      <TabsContent value="overview" className="worker-layout">
        <div className="worker-stack">
          <section className="account-panel worker-policy">
            <div className="worker-policy-banner">
              <div className="account-icon"><Shield aria-hidden="true" /></div>
              <div><h2>{policy.terms.tier} protection plan</h2><p>Coverage window: {dateLabel(policy.startsAt)} – {dateLabel(policy.endsAt)}</p></div>
              <span className="worker-status" data-status={policy.status}>{label(policy.status)}</span>
            </div>
            <div className="worker-policy-body">
              <dl className="worker-metrics">
                <div><dt>Weekly cap</dt><dd>{cap === null ? 'Unavailable' : money(cap)}</dd></div>
                <div><dt>Reserved or settled this week</dt><dd>{money(used)}</dd></div>
                <div><dt>Cap remaining</dt><dd>{cap === null ? 'Unavailable' : money(Math.max(0, cap - used))}</dd></div>
              </dl>
              {cap !== null && cap > 0 && <label className="worker-progress">Weekly cap used <progress value={Math.min(used, cap)} max={cap} /></label>}
              {cap === null && <p className="worker-muted">The cap for this policy version is unavailable.</p>}
              <Button variant="outline" className="account-quiet" onClick={() => setTab('policy')}>View policy details</Button>
            </div>
          </section>
          {claims}
        </div>
        <aside className="worker-stack">
          <section className="account-panel worker-zone">
            <h2><MapPin size={18} aria-hidden="true" /> Coverage zone</h2>
            <strong className="worker-zone-name">{policy.terms.zone}</strong>
            <div className="account-disclosures"><span>Oracle inputs: synthetic</span><span>Payment rail: simulated</span></div>
          </section>
          <section className="account-panel worker-zone">
            <h2><Radio size={18} aria-hidden="true" /> Recent disruption events</h2>
            {!value.events.length && <p>No events in your coverage zone.</p>}
            <ul className="worker-zone-events">{value.events.slice(0, 5).map((event) => <li key={event.eventKey}>
              <strong>{eventTitle(event.eventKey, event)}</strong><span>{event.status} · {dateLabel(event.windowStart)}</span>
              <span>{event.readings.filter((reading) => reading.breach).length}/{event.quorum} quorum</span>
            </li>)}</ul>
          </section>
        </aside>
      </TabsContent>
      <TabsContent value="policy"><section className="account-panel worker-zone"><h2>Policy details</h2><PolicyDetails policy={policy} /></section></TabsContent>
      <TabsContent value="claims">{claims}</TabsContent>
    </Tabs>}
    {selectedPayout && <Proof provider={provider} session={session} payout={selectedPayout} onExpired={onExpired}
      close={() => setSelected(undefined)} restoreFocus={() => proofTrigger.current?.focus()} />}
  </div>;
}
