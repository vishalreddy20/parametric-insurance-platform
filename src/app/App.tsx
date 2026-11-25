import { lazy, Suspense, useCallback, useState } from 'react';
import type { DataProvider, Session } from './data/provider';
import { ledgerProvider } from './data/ledger-provider';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard').then((module) => ({ default: module.WorkerDashboard })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const demoEnabled = import.meta.env.VITE_DATA_MODE === 'demo';

function AppViews({ provider }: { provider: DataProvider }) {
  const [view, setView] = useState<'landing' | 'sign-in'>('landing');
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const logout = useCallback(() => { setSession(null); setMessage(''); setView('landing'); }, []);
  const expired = useCallback(() => { setSession(null); setMessage('Your session expired. Sign in again.'); setView('sign-in'); }, []);

  if (session?.role === 'worker' && session.policyId && session.workerId) {
    return <WorkerDashboard provider={provider} session={session} onExpired={expired} logout={logout} />;
  }
  if (session?.role === 'insurer' || session?.role === 'regulator') {
    return <AdminPanel provider={provider} session={session} onExpired={expired} logout={logout} />;
  }
  if (view === 'landing') return <LandingPage demo={provider.mode === 'demo'} onGetStarted={() => setView('sign-in')} />;
  return <AuthPage provider={provider} message={message} onBack={logout} onSuccess={(signedIn) => {
    if (!['worker', 'insurer', 'regulator'].includes(signedIn.role)) {
      setMessage('This simulated service role uses the API.');
      return;
    }
    setMessage('');
    setSession(signedIn);
  }} />;
}

const provider = ledgerProvider(import.meta.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:8080');
const DemoApp = lazy(async () => {
  const { demoProvider } = await import('./data/demo-provider');
  return { default: () => <AppViews provider={demoProvider} /> };
});

export default function App() {
  return <Suspense fallback={<div className="zs-page-loader" role="status"><div className="zs-page-loader-spinner" /><p>Loading ParaShield…</p></div>}>
    {demoEnabled ? <DemoApp /> : <AppViews provider={provider} />}
  </Suspense>;
}
