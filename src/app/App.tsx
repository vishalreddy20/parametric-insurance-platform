import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, useLocation, useNavigate } from 'react-router';
import { DataError, type Session } from './data/provider';
import { ledgerProvider } from './data/ledger-provider';
import { readableError } from './data/use-resource';
import './account.css';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
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

function AccountFrame({ session, onSignOut, children }: {
  session?: Session | null;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  return <div className="account-shell" data-theme={theme}>
    <a className="account-skip" href="#account-content">Skip to content</a>
    <header className="account-header">
      <div className="account-header-inner">
        <Link className="account-brand" to={session ? '/account' : '/'}>ParaShield</Link>
        <nav aria-label="Account">
          {session && <Link to="/account">My account</Link>}
          <button type="button" className="account-quiet" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          {session && <button type="button" className="account-quiet" onClick={onSignOut}>Sign out</button>}
        </nav>
      </div>
    </header>
    <main id="account-content" className="account-content">{children}</main>
  </div>;
}

function AppViews() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [sessionRedirect, setSessionRedirect] = useState<{ path: string; returnPath?: string }>();
  const targetRole = (Object.keys(workspaces) as (keyof typeof workspaces)[]).find((role) => workspaces[role].path === pathname);
  const protectedPage = pathname === '/account' || Boolean(targetRole);
  const returnPath = typeof state?.returnPath === 'string' &&
    ['/account', ...Object.values(workspaces).map(({ path }) => path) ].includes(state.returnPath) ? state.returnPath : '/account';

  function sessionEnded() {
    setSession(null);
    setMessage('Your session expired. Sign in again.');
    setSessionRedirect({ path: '/sign-in', returnPath: pathname });
  }

  useEffect(() => {
    let active = true;
    void provider.currentSession().then((current) => { if (active) setSession(current); })
      .catch((error) => {
        if (active && error instanceof DataError && error.code !== 'ERR_AUTHENTICATION') setMessage(error.message);
      }).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (sessionRedirect?.path === pathname) setSessionRedirect(undefined);
  }, [pathname, sessionRedirect]);

  function logout() {
    if (!session) return;
    setMessage('');
    void provider.signOut(session).then(() => {
      setSession(null);
      setSessionRedirect({ path: '/' });
    })
      .catch((error) => {
        if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') sessionEnded();
        else setMessage(readableError(error));
      });
  }

  async function signIn() {
    const confirmed = await provider.currentSession();
    setMessage('');
    setSession(confirmed);
  }

  if (initializing) return <AccountFrame><p role="status">Checking your session…</p></AccountFrame>;
  if (sessionRedirect && sessionRedirect.path !== pathname) {
    return <Navigate to={sessionRedirect.path} replace state={{ returnPath: sessionRedirect.returnPath }} />;
  }
  if (protectedPage && !session) {
    return <Navigate to="/sign-in" replace state={{ returnPath: pathname }} />;
  }
  if (session && targetRole && session.role !== targetRole) return <AccountFrame session={session} onSignOut={logout}>
    <section className="account-card" aria-labelledby="forbidden-title">
      <h1 id="forbidden-title">403 · Access denied</h1>
      <p>This workspace requires the {targetRole} role. You are signed in as {session.role}.</p>
      <Link className="account-button" to="/account">Back to my account</Link>
      {message && <p role="alert">{message}</p>}
    </section>
  </AccountFrame>;
  if (session && targetRole) {
    if (targetRole === 'worker' && session.policyId && session.workerId) {
      return <>{message && <p role="alert">{message}</p>}<WorkerDashboard provider={provider} session={session} onExpired={sessionEnded} logout={logout} /></>;
    }
    if (targetRole === 'insurer' || targetRole === 'regulator') {
      return <>{message && <p role="alert">{message}</p>}<AdminPanel provider={provider} session={session} onExpired={sessionEnded} logout={logout} /></>;
    }
  }

  if (session && protectedPage) return <AccountFrame session={session} onSignOut={logout}>
    <section className="account-card" aria-labelledby="account-title">
      <h1 id="account-title">My account</h1>
      <dl className="account-details"><dt>Username</dt><dd>{session.username}</dd><dt>Role</dt><dd>{session.role}</dd></dl>
      {pathname === '/account' && !['admin', 'platform'].includes(session.role) &&
        <Link className="account-button" to={workspaces[session.role].path}>{workspaces[session.role].label}</Link>}
      {message && <p role="alert">{message}</p>}
    </section>
  </AccountFrame>;

  if (pathname === '/sign-in' || pathname === '/sign-up') {
    if (session) return <Navigate to={returnPath} replace />;
    return <AccountFrame>
      <AuthPage key={pathname} provider={provider} message={message} createAccount={pathname === '/sign-up'}
        onSuccess={signIn} onRegistered={(username) => navigate('/sign-in', { replace: true, state: { returnPath, registered: true, username } })}
        registered={state?.registered === true} initialUsername={typeof state?.username === 'string' ? state.username : ''} />
    </AccountFrame>;
  }
  if (pathname === '/') {
    if (session) return <Navigate to="/account" replace />;
    return <AccountFrame><LandingPage onSignIn={() => { setMessage(''); navigate('/sign-in'); }}
      onCreateAccount={() => { setMessage(''); navigate('/sign-up'); }} /></AccountFrame>;
  }
  return <AccountFrame session={session} onSignOut={logout}>
    <section className="account-card"><h1>404 · Page not found</h1><Link to={session ? '/account' : '/'}>Go back</Link></section>
  </AccountFrame>;
}

export default function App() {
  return <BrowserRouter><Suspense fallback={<p role="status">Loading ParaShield…</p>}><AppViews /></Suspense></BrowserRouter>;
}
