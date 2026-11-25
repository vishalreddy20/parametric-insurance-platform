import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Session } from './data/provider';
import { ledgerProvider } from './data/ledger-provider';
import { readableError } from './data/use-resource';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard').then((module) => ({ default: module.WorkerDashboard })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const provider = ledgerProvider(import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8080');

function AppViews() {
  const [view, setView] = useState<'landing' | 'sign-in' | 'register'>('landing');
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const [initializing, setInitializing] = useState(true);
  useEffect(() => {
    let active = true;
    void provider.currentSession().then((current) => { if (active) setSession(current); })
      .catch(() => {}).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);
  const expired = useCallback(() => { setSession(null); setMessage('Your session expired. Sign in again.'); setView('sign-in'); }, []);
  const logout = useCallback(() => {
    if (!session) return;
    setMessage('');
    void provider.signOut(session).then(() => { setSession(null); setView('landing'); })
      .catch((error) => setMessage(readableError(error)));
  }, [session]);

  if (initializing) return <p role="status">Checking your session…</p>;
  if (session) return <>
    {message && <p role="alert">{message}</p>}
    {session.role === 'worker' && session.policyId && session.workerId
      ? <WorkerDashboard provider={provider} session={session} onExpired={expired} logout={logout} />
      : session.role === 'insurer' || session.role === 'regulator'
        ? <AdminPanel provider={provider} session={session} onExpired={expired} logout={logout} />
        : <main><h1>Account</h1><p>Role: {session.role}</p><button type="button" onClick={logout}>Sign out</button></main>}
  </>;
  if (view === 'landing') return <LandingPage onSignIn={() => setView('sign-in')} onCreateAccount={() => setView('register')} />;
  return <AuthPage provider={provider} message={message} createAccount={view === 'register'} onBack={() => {
    setMessage(''); setView('landing');
  }} onSuccess={(signedIn) => {
    setMessage('');
    setSession(signedIn);
  }} />;
}

export default function App() {
  return <Suspense fallback={<p role="status">Loading ParaShield…</p>}><AppViews /></Suspense>;
}
