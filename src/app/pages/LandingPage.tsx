export function LandingPage({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  return (
    <main className="ps-auth">
      <div className="ps-auth-frame">
        <h1>ParaShield</h1>
        <p>Parametric income protection for delivery partners. Eligible disruptions trigger payouts based on policy terms and signed observations.</p>
        <div>
          <button type="button" className="btn-primary" onClick={onSignIn}>Sign in</button>{' '}
          <button type="button" className="btn-secondary" onClick={onCreateAccount}>Create account</button>
        </div>
        <section>
          <h2>How it works</h2>
          <ol>
            <li>Choose a plan and activate your policy after premium confirmation.</li>
            <li>Signed oracle readings are recorded and checked against the event threshold and quorum.</li>
            <li>When coverage and activity qualify, inspect the payout and its DRUNIX transaction and block proof.</li>
          </ol>
        </section>
        <footer>Payment rail: simulated. Oracle inputs: synthetic.</footer>
      </div>
    </main>
  );
}
