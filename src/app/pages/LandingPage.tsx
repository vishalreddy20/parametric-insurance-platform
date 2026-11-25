export function LandingPage({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  return (
    <section className="account-card account-overview" aria-labelledby="overview-title">
      <h1 id="overview-title">Coverage for delivery partners</h1>
      <p>Eligible disruptions trigger payouts based on policy terms and signed observations.</p>
      <div className="account-actions">
        <button type="button" className="account-button" onClick={onSignIn}>Sign in</button>
        <button type="button" className="account-quiet" onClick={onCreateAccount}>Create account</button>
      </div>
      <h2>How it works</h2>
      <ol>
        <li>Choose a plan and activate your policy after premium confirmation.</li>
        <li>Signed oracle readings are recorded and checked against the event threshold and quorum.</li>
        <li>When coverage and activity qualify, inspect the payout and its DRUNIX transaction and block proof.</li>
      </ol>
      <footer>Payment rail: simulated. Oracle inputs: synthetic.</footer>
    </section>
  );
}
