import { ArrowRight, CloudRain, FileCheck2, Radio, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '../components/ui/button';
import deliveryPartner from '../assets/stitch-delivery-partner.jpg';

const steps = [
  { icon: ShieldCheck, title: 'Policy and premium', description: 'Choose a weekly coverage plan. Coverage follows the policy terms after premium confirmation.', detail: 'Select a plan during onboarding' },
  { icon: Radio, title: 'Signed oracle quorum', description: 'The ledger checks signed observations against the disruption threshold and quorum.', detail: 'Oracle inputs: synthetic' },
  { icon: FileCheck2, title: 'Ledger payout proof', description: 'When the event, policy and work activity qualify, the payout decision has a traceable ledger record.', detail: 'Payment rail: simulated' },
];

export function LandingPage({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  return <div className="landing-layout">
    <div className="stitch-context-strip"><span><ShieldCheck size={14} aria-hidden="true" /> Delivery partner coverage</span><span>Currency: INR · Time zone: IST</span></div>
    <section className="landing-hero" aria-labelledby="overview-title">
      <div className="landing-intro">
        <p className="account-kicker"><ShieldCheck size={16} aria-hidden="true" /> Parametric income protection</p>
        <h1 id="overview-title">Coverage for delivery partners in India</h1>
        <p>ParaShield helps delivery partners receive payouts when signed observations confirm a disruption and their policy and work activity qualify. Payout decisions can be traced on a shared ledger.</p>
        <div className="account-actions">
          <Button className="account-button" onClick={onCreateAccount}>Create account <ArrowRight aria-hidden="true" /></Button>
          <Button variant="outline" className="account-quiet" onClick={onSignIn}>Sign in</Button>
        </div>
        <div className="account-disclosures"><span>Payment rail: simulated</span><span>Oracle inputs: synthetic</span></div>
      </div>
      <section className="account-panel landing-proof" aria-labelledby="proof-title">
        <h2 id="proof-title"><CloudRain size={18} aria-hidden="true" /> Disruption and payout proof</h2>
        <img src={deliveryPartner} alt="Delivery partner on a rain-soaked street" />
        <div className="landing-proof-caption"><strong>Signed observations and transaction records</strong><p>Sign in to view the records available to your role.</p></div>
      </section>
    </section>
    <div className="landing-facts" aria-label="Coverage details">
      <div><ShieldCheck aria-hidden="true" /><strong>Coverage activation</strong><p>After premium confirmation</p></div>
      <div><Radio aria-hidden="true" /><strong>Disruption quorum</strong><p>Signed oracle observations</p></div>
      <div><FileCheck2 aria-hidden="true" /><strong>Ledger verification</strong><p>Transaction and block proof</p></div>
      <div><Wallet aria-hidden="true" /><strong>Payment details</strong><p>₹ (INR) · India Standard Time</p></div>
    </div>
    <section id="how-it-works" aria-labelledby="how-title" className="landing-how">
      <h2 id="how-title">How it works</h2>
      <div className="landing-steps">{steps.map(({ icon: Icon, title, description, detail }) => <article className="account-panel" key={title}>
        <Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{description}</p><p className="landing-step-detail">{detail}</p>
      </article>)}</div>
    </section>
    <section id="claims-proof" className="landing-ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title"><FileCheck2 size={22} aria-hidden="true" /> Claims and ledger proof</h2>
      <div className="account-panel"><p>Policy and payout details are available in your signed-in workspace. Payout proof includes the transaction, block and associated event when available.</p></div>
    </section>
    <section className="account-panel landing-action"><div><h2>Set up your worker account</h2><p>Create an account to start reviewing coverage options.</p></div>
      <Button className="account-button" onClick={onCreateAccount}>Create worker account <ArrowRight aria-hidden="true" /></Button>
    </section>
  </div>;
}
