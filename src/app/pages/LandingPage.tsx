import { ArrowRight, CheckCircle2, CloudRain, FileCheck2, Radio, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '../components/ui/button';

const steps = [
  { icon: ShieldCheck, title: 'Choose coverage', description: 'Select a plan and activate your policy after premium confirmation.' },
  { icon: Radio, title: 'Confirm the disruption', description: 'Signed oracle observations are checked against the event threshold and quorum.' },
  { icon: FileCheck2, title: 'Trace the payout', description: 'When coverage and activity qualify, review the payout and its ledger proof.' },
];

export function LandingPage({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  return <div className="landing-layout">
    <section className="landing-hero" aria-labelledby="overview-title">
      <div className="landing-intro">
        <p className="account-kicker"><ShieldCheck size={16} aria-hidden="true" /> Parametric income protection</p>
        <h1 id="overview-title">Coverage for delivery partners</h1>
        <p>ParaShield helps delivery partners receive payouts when signed observations confirm a disruption and their policy and work activity qualify. Payout decisions can be traced on a shared ledger.</p>
        <div className="account-actions">
          <Button className="account-button" onClick={onCreateAccount}>Create account <ArrowRight aria-hidden="true" /></Button>
          <Button variant="outline" className="account-quiet" onClick={onSignIn}>Sign in</Button>
        </div>
      </div>
      <section className="account-panel landing-proof" aria-labelledby="proof-title">
        <h2 id="proof-title"><FileCheck2 size={20} aria-hidden="true" /> From disruption to proof</h2>
        <ol className="proof-flow">
          <li><CloudRain aria-hidden="true" /><div><strong>Disruption observed</strong><p>Signed readings are submitted for the affected zone.</p></div></li>
          <li><CheckCircle2 aria-hidden="true" /><div><strong>Eligibility evaluated</strong><p>The ledger checks the event, policy and qualifying activity.</p></div></li>
          <li><Wallet aria-hidden="true" /><div><strong>Decision recorded</strong><p>Eligible payouts have a traceable transaction record.</p></div></li>
        </ol>
        <div className="account-disclosures"><span>Payment rail: simulated</span><span>Oracle inputs: synthetic</span></div>
      </section>
    </section>
    <section id="how-it-works" aria-labelledby="how-title" className="landing-how">
      <h2 id="how-title">How it works</h2>
      <div className="landing-steps">{steps.map(({ icon: Icon, title, description }) => <article className="account-panel" key={title}>
        <Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>
      </article>)}</div>
    </section>
  </div>;
}
