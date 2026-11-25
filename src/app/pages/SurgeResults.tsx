import { ArrowLeft, BarChart3 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { dateLabel, money } from './WorkerDashboard';
import small from '../../../docs/benchmark-runs/rerun-32.json';
import medium from '../../../docs/benchmark-runs/rerun-200.json';
import large from '../../../docs/benchmark-runs/rerun-1000.json';

const runs = [small, medium, large];
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function SurgeResults() {
  return <div className="insurer-console">
    <header className="insurer-title">
      <div><p className="account-kicker"><BarChart3 size={16} aria-hidden="true" /> Insurer workspace</p>
        <h1>Surge results</h1><p>Published DRUNIX benchmark runs with synthetic oracle inputs and simulated payment.</p></div>
      <Button asChild variant="outline" className="account-quiet"><Link to="/insurer"><ArrowLeft aria-hidden="true" /> Back to insurer console</Link></Button>
    </header>
    <div className="insurer-run-grid">
      {runs.map((run) => <section className="account-panel insurer-run" key={run.eventKey}>
        <p className="account-kicker">{run.passed ? 'Passed' : 'Failed'} · {run.environment.litePeers} Lite Peers</p>
        <h2>{number.format(run.policies)} policies</h2>
        <p>{dateLabel(Date.parse(run.completedAt) / 1000)}</p>
        <dl className="worker-details">
          <div><dt>Settled</dt><dd>{number.format(run.metrics.settled)}</dd></div>
          <div><dt>Throughput</dt><dd>{number.format(run.metrics.tps)} payouts/s</dd></div>
          <div><dt>p95 payout latency</dt><dd>{number.format(run.metrics.p95Ms / 1000)} s</dd></div>
          <div><dt>Ledger settled</dt><dd>{money(run.reconciliation.ledgerPaise)}</dd></div>
          <div><dt>Simulated rail settled</dt><dd>{money(run.reconciliation.mockUPIPaise)}</dd></div>
          <div><dt>Duplicate payouts</dt><dd>{run.reconciliation.duplicates}</dd></div>
        </dl>
      </section>)}
    </div>
  </div>;
}
