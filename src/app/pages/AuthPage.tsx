import { useRef, useState, type FormEvent } from 'react';
import type { DataProvider, Session, SignInResult } from '../data/provider';
import { readableError } from '../data/use-resource';

export function AuthPage({ provider, onSuccess, onBack, message, createAccount }: {
  provider: DataProvider; onSuccess: (session: Session) => void; onBack: () => void; message: string; createAccount: boolean;
}) {
  const [register, setRegister] = useState(createAccount);
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<'zomato' | 'swiggy'>('zomato');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [challenge, setChallenge] = useState<Exclude<SignInResult, { status: 'signed-in' }>>();
  const [mfaCode, setMfaCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [pendingSession, setPendingSession] = useState<Extract<SignInResult, { status: 'signed-in' }>>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(message);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (register) {
        await provider.register(username.trim(), code, platform);
        setRegister(false);
        setCode('');
        setNotice('Account created. Sign in to continue.');
        return;
      }
      const result = await provider.signIn(username.trim(), code, challenge ? { code: mfaCode.trim(), recovery: useRecovery } : undefined);
      if (result.status !== 'signed-in') {
        setChallenge(result);
        return;
      }
      setCode('');
      setMfaCode('');
      if (result.recoveryCodes.length) setPendingSession(result);
      else onSuccess(result.session);
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="ps-auth">
      <div className="ps-auth-frame">
        <button type="button" className="btn-secondary" onClick={onBack}>Home</button>
        <section className="ps-card">
          <h1>{pendingSession ? 'Save your recovery codes' : challenge ? 'Two-factor authentication' : register ? 'Create a worker account' : 'Sign in'}</h1>
          {error && <p className="ps-error" role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {pendingSession ? <>
            <p>Store these one-time codes somewhere safe. They are shown once.</p>
            <ul>{pendingSession.recoveryCodes.map((value) => <li key={value}><code>{value}</code></li>)}</ul>
            <button type="button" className="btn-primary" onClick={() => onSuccess(pendingSession.session)}>Continue</button>
          </> : <form onSubmit={submit} className="ps-form">
            {challenge ? <>
              {challenge.status === 'enrol' && <p>Enter this setup key in your authenticator app, then enter the six-digit code it displays. <code>{challenge.setupKey}</code></p>}
              <label className="zs-label">{useRecovery ? 'Recovery code' : 'Authenticator code'}
                <input key={String(useRecovery)} autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'} className="zs-input"
                  value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required maxLength={useRecovery ? 20 : 6} />
              </label>
              {challenge.status === 'challenge' && <button type="button" className="btn-secondary" disabled={loading}
                onClick={() => { setUseRecovery(!useRecovery); setMfaCode(''); }}>{useRecovery ? 'Use an authenticator code' : 'Use a recovery code'}</button>}
            </> : <>
              <label className="zs-label">Username
                <input autoComplete="username" className="zs-input" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={64} />
              </label>
              {register && <label className="zs-label">Platform
                <select className="zs-input" value={platform} onChange={(event) => setPlatform(event.target.value === 'swiggy' ? 'swiggy' : 'zomato')}>
                  <option value="zomato">Zomato</option><option value="swiggy">Swiggy</option>
                </select>
              </label>}
              <label className="zs-label">Access code
                <input autoComplete={register ? 'new-password' : 'current-password'} type={showCode ? 'text' : 'password'} className="zs-input"
                  value={code} onChange={(event) => setCode(event.target.value)} required minLength={register ? 12 : undefined} maxLength={128}
                  aria-describedby={register ? 'access-code-rules' : undefined} />
              </label>
              {register && <p id="access-code-rules">Use 12 or more characters. Choose a unique, hard-to-guess passphrase.</p>}
              <button type="button" className="btn-secondary" onClick={() => setShowCode(!showCode)}>{showCode ? 'Hide access code' : 'Show access code'}</button>
            </>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Submitting…' : challenge ? 'Verify' : register ? 'Create account' : 'Sign in'}
            </button>
          </form>}
          {!challenge && !pendingSession && <button type="button" className="btn-secondary" disabled={loading} onClick={() => {
            setRegister(!register); setCode(''); setError(''); setNotice('');
          }}>{register ? 'Sign in' : 'Create a worker account'}</button>}
        </section>
      </div>
    </main>
  );
}
