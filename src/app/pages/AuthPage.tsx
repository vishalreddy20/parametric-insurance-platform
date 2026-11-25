import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { DataError, type DataProvider, type SignInResult } from '../data/provider';
import { readableError } from '../data/use-resource';

export function AuthPage({ provider, onSuccess, onRegistered, message, createAccount: register, registered, initialUsername }: {
  provider: DataProvider; onSuccess: () => Promise<void>; onRegistered: (username: string) => void;
  message: string; createAccount: boolean; registered: boolean; initialUsername: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [platform, setPlatform] = useState<'zomato' | 'swiggy'>('zomato');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<Exclude<SignInResult, { status: 'signed-in' }>>();
  const [mfaCode, setMfaCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [pendingSession, setPendingSession] = useState<Extract<SignInResult, { status: 'signed-in' }>>();
  const [error, setError] = useState<{ heading: string; message: string }>();
  const [notice, setNotice] = useState(registered ? 'Account created. Sign in to continue.' : message);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const registrationKey = useRef<string>();
  const resetKey = () => { registrationKey.current = undefined; };

  function showError(failure: unknown) {
    const titles: Record<string, string> = {
      ERR_ACCOUNT_LOCKED: 'Sign-in temporarily locked',
      ERR_RATE_LIMIT: 'Too many requests',
      ERR_OFFLINE: 'Gateway unreachable',
      ERR_SESSION_EXPIRED: 'Session expired',
      ERR_AUTHENTICATION: challenge ? 'Verification failed' : 'Sign-in failed',
    };
    const heading = failure instanceof DataError ? titles[failure.code] : undefined;
    setError({ heading: heading ?? (register ? 'Account creation failed' : 'Sign-in failed'),
      message: failure instanceof DataError && failure.code === 'ERR_AUTHENTICATION' && !challenge
        ? 'Check your username and password, then try again.' : readableError(failure) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(undefined);
    setNotice('');
    try {
      if (register) {
        registrationKey.current ??= crypto.randomUUID();
        await provider.register(username.trim(), password, platform, registrationKey.current);
        onRegistered(username.trim());
        return;
      }
      const result = await provider.signIn(username.trim(), password, challenge ? { code: mfaCode.trim(), recovery: useRecovery } : undefined);
      if (result.status !== 'signed-in') {
        setChallenge(result);
        return;
      }
      setPassword('');
      setMfaCode('');
      if (result.recoveryCodes.length) setPendingSession(result);
      else await onSuccess();
    } catch (failure) {
      showError(failure);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="account-card" aria-labelledby="sign-in-title">
      <Link className="account-back" to="/">← Home</Link>
      <h1 id="sign-in-title">{pendingSession ? 'Save your recovery codes' : challenge ? 'Two-factor authentication' : register ? 'Create a worker account' : 'Sign in'}</h1>
      {error && <div ref={errorRef} className="account-message account-error" role="alert" tabIndex={-1}>
        <strong>{error.heading}</strong><p>{error.message}</p>
      </div>}
      {notice && <p className="account-message" role="status">{notice}</p>}
      {pendingSession ? <>
        <p>Store these one-time codes somewhere safe. They are shown once.</p>
        <ul>{pendingSession.recoveryCodes.map((value) => <li key={value}><code>{value}</code></li>)}</ul>
        <button type="button" className="account-button" onClick={() => { void onSuccess().catch(showError); }}>Continue</button>
      </> : <form onSubmit={submit} className="account-form">
        {challenge ? <>
          {challenge.status === 'enrol' && <p>Enter this setup key in your authenticator app, then enter the six-digit code it displays. <code>{challenge.setupKey}</code></p>}
          <label className="account-field">{useRecovery ? 'Recovery code' : 'Authenticator code'}
            <input key={String(useRecovery)} autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'} className="account-input"
              value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required maxLength={useRecovery ? 20 : 6} />
          </label>
          {challenge.status === 'challenge' && <button type="button" className="account-quiet" disabled={loading}
            onClick={() => { setUseRecovery(!useRecovery); setMfaCode(''); }}>{useRecovery ? 'Use an authenticator code' : 'Use a recovery code'}</button>}
        </> : <>
          <label className="account-field">Username
            <input autoComplete="username" className="account-input" value={username} onChange={(event) => { resetKey(); setUsername(event.target.value); }} required minLength={3} maxLength={64} />
          </label>
          {register && <label className="account-field">Platform
            <select className="account-input" value={platform} onChange={(event) => { resetKey(); setPlatform(event.target.value === 'swiggy' ? 'swiggy' : 'zomato'); }}>
              <option value="zomato">Zomato</option><option value="swiggy">Swiggy</option>
            </select>
          </label>}
          <label className="account-field">Password
            <input autoComplete={register ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} className="account-input"
              value={password} onChange={(event) => { resetKey(); setPassword(event.target.value); }} required minLength={register ? 12 : undefined} maxLength={128}
              aria-describedby={register ? 'password-rules' : undefined} />
          </label>
          {register && <p id="password-rules">Use 12 or more characters. Choose a unique, hard-to-guess passphrase.</p>}
          <button type="button" className="account-quiet" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button>
        </>}
        <button className="account-button" type="submit" disabled={loading}>
          {loading ? 'Submitting…' : challenge ? 'Verify' : register ? 'Create account' : 'Sign in'}
        </button>
      </form>}
      {!challenge && !pendingSession && <Link className="account-back" to={register ? '/sign-in' : '/sign-up'}>
        {register ? 'Already have an account? Sign in' : 'Create a worker account'}</Link>}
    </section>
  );
}
