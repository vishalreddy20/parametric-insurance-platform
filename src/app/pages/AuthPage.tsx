import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, FileCheck2, KeyRound, ShieldCheck } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { DataError, type DataProvider, type SignInResult } from '../data/provider';
import { readableError } from '../data/use-resource';

function InformationPanel({ register, verification }: { register: boolean; verification: boolean }) {
  return <aside className="auth-context">
    <p className="account-kicker"><ShieldCheck size={16} aria-hidden="true" /> {verification ? 'Staff authentication' : 'Parametric income protection'}</p>
    <h2>{verification ? 'Confirm your identity' : register ? 'Before you enrol' : 'Income protection for delivery partners'}</h2>
    <p>{verification ? 'Use your authenticator app or one of your saved recovery codes to continue.' :
      'Signed observations establish when a disruption meets the policy threshold and quorum. You can trace payout decisions on the ledger.'}</p>
    <div className="account-panel auth-protocol">
      <h3><FileCheck2 size={18} aria-hidden="true" /> {register ? 'After account creation' : 'Coverage and proof'}</h3>
      <dl><div><dt>Coverage start</dt><dd>Policy terms apply after premium confirmation.</dd></div>
        <div><dt>Disruption quorum</dt><dd>Signed oracle readings are checked against the policy threshold.</dd></div></dl>
      <div className="account-disclosures"><span>Payment rail: simulated</span><span>Oracle inputs: synthetic</span></div>
    </div>
    <div className="account-panel auth-proof-preview"><h3>{register ? 'Onboarding' : 'Ledger verification'}</h3>
      <p>{register ? 'Review your profile, plan and policy details before activating coverage.' : 'Open the payout in your workspace to see its recorded decision and proof.'}</p></div>
    {verification && <p className="auth-note"><KeyRound size={18} aria-hidden="true" /> Password resets are handled by an administrator.</p>}
  </aside>;
}

function AccountTerms() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <Dialog onOpenChange={(open) => { if (open) setContainer(document.querySelector('.account-shell')); }}>
    <DialogTrigger asChild><button type="button" className="account-text-button">Terms and Privacy Notice</button></DialogTrigger>
    <DialogContent className="account-dialog" container={container}>
      <DialogHeader><DialogTitle>Terms and Privacy Notice</DialogTitle>
        <DialogDescription>How your account information is used and how coverage works.</DialogDescription>
      </DialogHeader>
      <h3>Coverage</h3><p>Creating an account does not activate coverage. Review the applicable plan terms before enrolling. Payout eligibility depends on the policy, declared event and qualifying work activity.</p>
      <h3>Account information</h3><p>Your username and selected platform are used to create a worker account and route requests. Your password is stored as a hash. Keep your password and recovery codes private.</p>
      <p>Payment rail: simulated. Oracle inputs: synthetic.</p>
    </DialogContent>
  </Dialog>;
}

export function AuthPage({ provider, onSuccess, onRegistered, message, createAccount: register, registered, initialUsername }: {
  provider: DataProvider; onSuccess: () => Promise<void>; onRegistered: (username: string) => void;
  message: string; createAccount: boolean; registered: boolean; initialUsername: string;
}) {
  const { state: routeState } = useLocation();
  const [username, setUsername] = useState(initialUsername);
  const [platform, setPlatform] = useState<'zomato' | 'swiggy'>('zomato');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState<Exclude<SignInResult, { status: 'signed-in' }>>();
  const [mfaCode, setMfaCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState<{ heading: string; message: string; requestId?: string }>();
  const [notice, setNotice] = useState(registered ? 'Account created. Sign in to continue.' : message);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const registrationKey = useRef<string>();
  const resetKey = () => { registrationKey.current = undefined; };

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function showError(failure: unknown) {
    const code = failure instanceof DataError ? failure.code : '';
    const headings: Record<string, string> = {
      ERR_ACCOUNT_LOCKED: 'Sign-in temporarily locked', ERR_RATE_LIMIT: 'Too many requests', ERR_OFFLINE: 'Gateway unreachable',
      ERR_SESSION_EXPIRED: 'Session expired', ERR_AUTHENTICATION: challenge ? 'Verification failed' : 'Sign-in failed',
    };
    const rateLimited = code === 'ERR_ACCOUNT_LOCKED' || code === 'ERR_RATE_LIMIT';
    const seconds = failure instanceof DataError ? failure.retryAfter : undefined;
    setError({
      heading: headings[code] ?? (register ? 'Account creation failed' : 'Sign-in failed'),
      message: rateLimited && seconds ? 'Too many attempts. Try again in ' + Math.ceil(seconds / 60) + (seconds <= 60 ? ' minute.' : ' minutes.')
        : code === 'ERR_AUTHENTICATION' && !challenge ? 'Check your username and password, then try again.' : readableError(failure),
      requestId: failure instanceof DataError ? failure.requestId : undefined,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || (register && !consent)) return;
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
      if (result.recoveryCodes.length) setRecoveryCodes(result.recoveryCodes);
      else await onSuccess();
    } catch (failure) {
      showError(failure);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const title = recoveryCodes.length ? 'Save one-time recovery codes' : challenge?.status === 'enrol' ? 'Set up your authenticator'
    : challenge ? useRecovery ? 'Enter recovery code' : 'Enter authenticator code'
      : register ? 'Create a worker account' : 'Sign in to ParaShield';

  const pairing = !recoveryCodes.length && challenge?.status === 'enrol';
  const verify = !recoveryCodes.length && challenge?.status === 'challenge' && !useRecovery;
  return <div className={['auth-layout', register && 'auth-layout-register',
    pairing && 'auth-layout-pairing', verify && 'auth-layout-verification',
    recoveryCodes.length > 0 && 'auth-layout-codes'].filter(Boolean).join(' ')}>
    {register && <nav className="auth-registration-path" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Delivery partner registration</span></nav>}
    <section className="auth-primary" aria-labelledby="sign-in-title">
      {register && <p className="account-kicker">Worker registration</p>}
      <h1 id="sign-in-title">{title}</h1>
      {!challenge && <p className="auth-intro">{register ? 'Create an account to choose coverage and follow payout decisions.' : 'Enter your credentials to access your workspace.'}</p>}
      {error && <div ref={errorRef} tabIndex={-1}>
        <Alert className="account-alert account-error"><CircleAlert aria-hidden="true" /><div>
          <strong>{error.heading}</strong><p>{error.message}</p>
          {error.requestId && <small>Support request ID <code>{error.requestId}</code></small>}
        </div></Alert>
      </div>}
      {notice && <p className="account-message" role="status">{notice}</p>}
      {recoveryCodes.length ? <div className="account-form">
        <p>Store these codes somewhere safe. Each code works once and is only shown here.</p>
        <ul className="auth-code-grid">{recoveryCodes.map((value) => <li key={value}><code>{value}</code></li>)}</ul>
        <div className="auth-consent"><Checkbox className="account-checkbox" id="saved-codes" checked={savedCodes} onCheckedChange={(value) => setSavedCodes(value === true)} />
          <label htmlFor="saved-codes">I have saved my recovery codes.</label></div>
        <Button type="button" className="account-button" disabled={!savedCodes} onClick={() => { void onSuccess().catch(showError); }}>Continue <ArrowRight aria-hidden="true" /></Button>
      </div> : <form onSubmit={submit} className="account-form">
        {challenge ? <>
          <label className="account-field" htmlFor="mfa-code">{useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
          {useRecovery
            ? <Input id="mfa-code" className="account-input" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required maxLength={20} />
            : <InputOTP id="mfa-code" aria-label="Authenticator code" autoComplete="one-time-code" inputMode="numeric" value={mfaCode}
                onChange={(value) => setMfaCode(value.replace(/\D/g, ''))} required maxLength={6}>
                <InputOTPGroup className="auth-otp">{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
              </InputOTP>}
          {challenge.status === 'challenge' && <button type="button" className="account-text-button" disabled={loading}
            onClick={() => { setUseRecovery(!useRecovery); setMfaCode(''); }}>{useRecovery ? 'Use an authenticator code' : 'Use a recovery code'}</button>}
        </> : <>
          {register && <div className="account-field">
            <span id="platform-label">Delivery platform</span>
            <RadioGroup className="auth-platforms" aria-labelledby="platform-label" value={platform}
              onValueChange={(value) => { resetKey(); setPlatform(value === 'swiggy' ? 'swiggy' : 'zomato'); }}>
              {['swiggy', 'zomato'].map((value) => <label className="auth-platform" key={value}>
                <RadioGroupItem value={value} /><span>{value === 'swiggy' ? 'Swiggy' : 'Zomato'}</span>
              </label>)}
            </RadioGroup>
          </div>}
          <label className="account-field">Username
            <Input name="username" autoComplete="username" placeholder={register ? 'Choose a username' : 'Enter your username'} className="account-input"
              value={username} onChange={(event) => { resetKey(); setUsername(event.target.value); }} required minLength={3} maxLength={64} />
          </label>
          <div className="account-field">
            <label htmlFor="account-password">Password</label>
            <div className="auth-password">
              <Input id="account-password" name="password" autoComplete={register ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'}
                className="account-input" value={password} placeholder={register ? 'Minimum 12 characters' : 'Enter your password'}
                onChange={(event) => { resetKey(); setPassword(event.target.value); }} required minLength={register ? 12 : undefined} maxLength={128}
                aria-describedby={register ? 'password-rules' : undefined} />
              <Button type="button" variant="ghost" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
            </div>
          </div>
          {register ? <>
            <p id="password-rules" className="auth-password-rules">Use 12 or more characters and a unique, hard-to-guess passphrase.</p>
            <div className="auth-consent"><Checkbox className="account-checkbox" id="registration-consent" checked={consent}
              required onCheckedChange={(value) => setConsent(value === true)} />
              <div><label htmlFor="registration-consent">I agree to the Terms and Privacy Notice.</label><br /><AccountTerms /></div></div>
          </> : <Link className="account-back" to="/forgot-password" state={routeState}>Forgot password?</Link>}
        </>}
        <Button className="account-button auth-submit" type="submit"
          disabled={loading || (register && !consent) || Boolean(challenge && (!mfaCode || (!useRecovery && mfaCode.length !== 6)))}>
          {loading ? 'Submitting…' : challenge ? 'Verify and continue' : register ? 'Create account' : 'Sign in'} <ArrowRight aria-hidden="true" />
        </Button>
      </form>}
      {!challenge && <p className="auth-switch">
        {register ? 'Already registered? ' : 'Don’t have an account? '}
        <Link className="account-back" to={register ? '/sign-in' : '/sign-up'} state={routeState}>{register ? 'Sign in' : 'Create account'}</Link>
      </p>}
      {!challenge && <p className="auth-note"><ShieldCheck size={18} aria-hidden="true" /> Staff accounts are issued by an administrator.</p>}
    </section>
    {pairing && challenge?.status === 'enrol' ? <aside className="auth-context auth-pairing">
      <h2>Authenticator setup key</h2>
      <div className="auth-pairing-qr">
        <QRCodeCanvas value={`otpauth://totp/ParaShield:${encodeURIComponent(username)}?secret=${encodeURIComponent(challenge.setupKey)}&issuer=ParaShield`}
          size={176} marginSize={4} title="Authenticator setup QR code" />
        <p>Scan this code with your authenticator app, then enter the six-digit code it shows.</p>
      </div>
      <div className="auth-note auth-key"><p>Or enter this key manually.</p><code>{challenge.setupKey}</code></div>
    </aside> : !recoveryCodes.length && <InformationPanel register={register} verification={Boolean(challenge)} />}
  </div>;
}
