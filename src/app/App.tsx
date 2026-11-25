import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ArrowRight, KeyRound, LayoutGrid, Moon, Shield, Sun, UserRound } from 'lucide-react';
import { Button } from './components/ui/button';
import { AccountSecurity } from './pages/AccountSecurity';
import { AccountNotice } from './pages/AccountNotice';
import { DataError, type Session } from './data/provider';
import { ledgerProvider } from './data/ledger-provider';
import { readableError } from './data/use-resource';
import './account.css';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const OnboardingFlow = lazy(() => import('./pages/OnboardingFlow').then((module) => ({ default: module.OnboardingFlow })));
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard').then((module) => ({ default: module.WorkerDashboard })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const provider = ledgerProvider(import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8080');
const workspaces = {
  worker: { path: '/worker', label: 'Worker workspace' },
  insurer: { path: '/insurer', label: 'Insurer workspace' },
  regulator: { path: '/regulator', label: 'Regulator workspace' },
  platform: { path: '/platform', label: 'Platform workspace' },
  admin: { path: '/admin', label: 'Admin workspace' },
};

function AccountFrame({ session, onSignOut, variant, children }: {
  session?: Session | null;
  onSignOut?: () => void;
  variant?: 'home' | 'auth' | 'register' | 'workspace';
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  return <div className="account-shell" data-theme={theme} data-variant={variant}>
    <a className="account-skip" href="#account-content">Skip to content</a>
    <header className="account-header">
      <div className="account-header-inner">
        <Link className="account-brand" to={session ? '/account' : '/'}><Shield size={22} aria-hidden="true" /> ParaShield</Link>
        {variant === 'home' && <nav aria-label="Product" className="account-header-guide">
          <a href="#how-it-works">How it works</a><a href="#claims-proof">Claims and proof</a>
        </nav>}
        <nav aria-label="Account">
          {session && <><Link to="/account">My account</Link><Link to="/account/security">Account security</Link></>}
          {variant === 'home' && <><Link to="/sign-in">Sign in</Link><Link to="/sign-up" className="account-nav-primary">Create account</Link></>}
          <Button variant="ghost" className="account-theme" aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
          {session && <Button variant="outline" className="account-quiet" onClick={onSignOut}>Sign out</Button>}
        </nav>
      </div>
    </header>
    <main id="account-content" className="account-content">{children}</main>
    <footer className="account-footer"><span>ParaShield</span><span>Payment rail: simulated · Oracle inputs: synthetic</span></footer>
  </div>;
}

function AccountWorkspace({ session, workspace, message, security, onExpired, onSignedOut }: {
  session: Session; workspace?: { path: string; label: string }; message: string;
  security: boolean; onExpired: () => void; onSignedOut: () => void;
}) {
  return <div className="account-workspace">
    <aside className="account-sidebar"><nav aria-label="Workspace">
      <Link to="/account" aria-current={security ? undefined : 'page'}><UserRound size={18} aria-hidden="true" /> My account</Link>
      <Link to="/account/security" aria-current={security ? 'page' : undefined}><KeyRound size={18} aria-hidden="true" /> Account security</Link>
      {workspace && <Link to={workspace.path}><LayoutGrid size={18} aria-hidden="true" /> {workspace.label}</Link>}
      {workspace && session.role === 'worker' && <Link to="/worker/onboarding"><Shield size={18} aria-hidden="true" /> Set up coverage</Link>}
    </nav></aside>
    <div className="account-workspace-body">
      <section className="account-panel account-profile" aria-labelledby="account-title">
        <div className="account-icon"><UserRound aria-hidden="true" /></div>
        <div><h1 id="account-title">{security ? 'Account security' : 'My account'}</h1><p>{session.username} <span className="account-role">{session.role}</span></p></div>
        {workspace && <Button asChild className="account-button"><Link to={workspace.path}>{workspace.label} <ArrowRight aria-hidden="true" /></Link></Button>}
      </section>
      {message && <p role="alert" className="account-message account-error">{message}</p>}
      {security ? <AccountSecurity provider={provider} session={session} onExpired={onExpired} onSignedOut={onSignedOut} /> : <>
      <div className="account-workspace-label"><UserRound size={18} aria-hidden="true" /> Account overview</div>
      <div className="account-workspace-grid">
        <section className="account-panel">
          <h2><KeyRound size={20} aria-hidden="true" /> Account details</h2>
          <dl className="account-details"><dt>Username</dt><dd>{session.username}</dd><dt>Role</dt><dd>{session.role}</dd>
            {session.platformId && <><dt>Platform</dt><dd>{session.platformId === 'zomato' ? 'Zomato' : 'Swiggy'}</dd></>}
          </dl>
        </section>
        <section className="account-panel"><h2>Sign-in assistance</h2><p>Password resets are handled by an administrator.</p></section>
      </div></>}
    </div>
  </div>;
}

class AccountErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <AccountFrame><AccountNotice kind={500} message="The application could not finish loading." back="/" backLabel="Back to home"
      retry={() => window.location.reload()} /></AccountFrame>;
  }
}

function AppViews() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [sessionFailure, setSessionFailure] = useState<DataError>();
  const [sessionCheck, setSessionCheck] = useState(0);
  const [sessionRedirect, setSessionRedirect] = useState<{ path: string; returnPath?: string }>();
  const onboarding = pathname === '/worker/onboarding';
  const targetRole = onboarding ? 'worker' : (Object.keys(workspaces) as (keyof typeof workspaces)[]).find((role) => workspaces[role].path === pathname);
  const accountPage = pathname === '/account' || pathname === '/account/security';
  const protectedPage = accountPage || Boolean(targetRole);
  const returnPath = typeof state?.returnPath === 'string' &&
    ['/account', '/account/security', '/worker/onboarding', ...Object.values(workspaces).map(({ path }) => path) ].includes(state.returnPath) ? state.returnPath : '/account';

  const sessionEnded = useCallback(() => {
    setSession(null);
    setMessage('Your session expired. Sign in again.');
    setSessionRedirect({ path: '/sign-in', returnPath: pathname });
  }, [pathname]);

  useEffect(() => {
    let active = true;
    void provider.currentSession().then((current) => { if (active) setSession(current); })
      .catch((error) => {
        if (!active || !(error instanceof DataError)) return;
        if (error.code === 'ERR_OFFLINE' || (error.status ?? 0) >= 500) setSessionFailure(error);
        else if (error.code !== 'ERR_AUTHENTICATION') setMessage(error.message);
      }).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, [sessionCheck]);

  useEffect(() => {
    if (sessionRedirect?.path === pathname) setSessionRedirect(undefined);
  }, [pathname, sessionRedirect]);

  function signedOut() {
    setSession(null);
    setSessionRedirect({ path: '/' });
  }

  function logout() {
    if (!session) return;
    setMessage('');
    void provider.signOut(session).then(signedOut)
      .catch((error) => {
        if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') sessionEnded();
        else setMessage(readableError(error));
      });
  }

  async function signIn() {
    const confirmed = await provider.currentSession();
    setMessage('');
    setSessionFailure(undefined);
    setSession(confirmed);
  }

  if (initializing) return <AccountFrame><p role="status">Checking your session…</p></AccountFrame>;
  if (protectedPage && sessionFailure) return <AccountFrame>
    <AccountNotice kind={sessionFailure.code === 'ERR_OFFLINE' ? 'offline' : 500} message={sessionFailure.message}
      requestId={sessionFailure.requestId} back="/" backLabel="Back to home" retry={() => {
        setSessionFailure(undefined);
        setInitializing(true);
        setSessionCheck((value) => value + 1);
      }} />
  </AccountFrame>;
  if (sessionRedirect && sessionRedirect.path !== pathname) {
    return <Navigate to={sessionRedirect.path} replace state={{ returnPath: sessionRedirect.returnPath }} />;
  }
  if (protectedPage && !session) {
    return <Navigate to="/sign-in" replace state={{ returnPath: pathname }} />;
  }
  if (session && targetRole && session.role !== targetRole) return <AccountFrame session={session} onSignOut={logout}>
    <AccountNotice kind={403} message={`This workspace requires the ${targetRole} role. You are signed in as ${session.role}.`}
      back="/account" backLabel="Back to my account" />
    {message && <p role="alert">{message}</p>}
  </AccountFrame>;
  if (session && targetRole) {
    if (targetRole === 'worker' && session.policyId && session.workerId) {
      if (onboarding) return <AccountFrame session={session} onSignOut={logout} variant="workspace">
        {message && <p role="alert">{message}</p>}
        <OnboardingFlow provider={provider} session={session} onExpired={sessionEnded} />
      </AccountFrame>;
      return <>{message && <p role="alert">{message}</p>}<WorkerDashboard provider={provider} session={session} onExpired={sessionEnded} logout={logout} /></>;
    }
    if (targetRole === 'insurer' || targetRole === 'regulator') {
      return <>{message && <p role="alert">{message}</p>}<AdminPanel provider={provider} session={session} onExpired={sessionEnded} logout={logout} /></>;
    }
  }

  if (session && protectedPage) return <AccountFrame session={session} onSignOut={logout} variant="workspace">
    <AccountWorkspace session={session} message={message} security={pathname === '/account/security'}
      onExpired={sessionEnded} onSignedOut={signedOut} workspace={accountPage && !['admin', 'platform'].includes(session.role)
      ? workspaces[session.role] : undefined} />
  </AccountFrame>;

  if (pathname === '/forgot-password') return <AccountFrame variant="auth">
    <section className="account-card account-notice"><div className="account-icon"><KeyRound aria-hidden="true" /></div>
      <h1>Forgot password?</h1><p>Password resets are handled by an administrator.</p>
      <Button asChild className="account-button"><Link to="/sign-in" state={state}>Back to sign in</Link></Button>
    </section>
  </AccountFrame>;

  if (pathname === '/sign-in' || pathname === '/sign-up') {
    if (session) return <Navigate to={returnPath} replace />;
    return <AccountFrame variant={pathname === '/sign-up' ? 'register' : 'auth'}>
      <AuthPage key={pathname} provider={provider} message={message} createAccount={pathname === '/sign-up'}
        onSuccess={signIn} onRegistered={(username) => navigate('/sign-in', { replace: true, state: { returnPath, registered: true, username } })}
        registered={state?.registered === true} initialUsername={typeof state?.username === 'string' ? state.username : ''} />
    </AccountFrame>;
  }
  if (pathname === '/') {
    if (session) return <Navigate to="/account" replace />;
    return <AccountFrame variant="home"><LandingPage onSignIn={() => { setMessage(''); navigate('/sign-in'); }}
      onCreateAccount={() => { setMessage(''); navigate('/sign-up'); }} /></AccountFrame>;
  }
  const back = session ? '/account' : '/';
  const backLabel = session ? 'Back to my account' : 'Back to home';
  const errorKind = pathname === '/500' ? 500 : pathname === '/offline' ? 'offline' : 404;
  const errorMessage = errorKind === 500 ? 'The application could not complete the request.'
    : errorKind === 'offline' ? 'The application could not reach the gateway. Check your connection and try again.'
    : 'The requested page could not be found.';
  return <AccountFrame session={session} onSignOut={logout}>
    <AccountNotice kind={errorKind} message={errorMessage} back={back} backLabel={backLabel}
      retry={errorKind === 404 ? undefined : () => navigate(back, { replace: true })} />
  </AccountFrame>;
}

export default function App() {
  return <BrowserRouter><AccountErrorBoundary><Suspense fallback={<p role="status">Loading ParaShield…</p>}>
    <AppViews />
  </Suspense></AccountErrorBoundary></BrowserRouter>;
}
