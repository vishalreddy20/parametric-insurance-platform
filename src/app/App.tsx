import { useState, useEffect, lazy, Suspense } from 'react';
import { seedDemoData, Users } from './services/mock-db';
import { supabase } from './components/supabase-client';

const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const OnboardingFlow = lazy(() => import('./pages/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow })));
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard').then((m) => ({ default: m.WorkerDashboard })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((m) => ({ default: m.AdminPanel })));

type AppView = 'landing' | 'auth' | 'onboarding' | 'worker' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  useEffect(() => {
    // Seed demo data on first load
    seedDemoData();

    // Check for existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const user = Users.get(session.user.id);
        if (user && user.onboardingComplete) {
          setUserId(session.user.id);
          setView('worker');
        } else if (session.user.id) {
          setUserId(session.user.id);
          setUserEmail(session.user.email || '');
          setUserName(session.user.user_metadata?.name || '');
          setUserPhone(session.user.user_metadata?.phone || '');
          setView('onboarding');
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // Don't auto-redirect to landing on logout if we're handling it
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (id: string, _token: string) => {
    setUserId(id);
    const user = Users.get(id);
    if (user && user.onboardingComplete) {
      setView('worker');
    } else {
      setView('onboarding');
    }
  };

  const handleStartOnboarding = (id: string) => {
    setUserId(id);
    setView('onboarding');
  };

  const handleOnboardingComplete = (id: string, _token: string) => {
    setUserId(id);
    setView('worker');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail('');
    setUserName('');
    setUserPhone('');
    setView('landing');
  };

  const renderView = () => {
    if (view === 'landing') {
      return (
        <LandingPage
          onGetStarted={() => setView('auth')}
          onAdminLogin={() => setView('admin')}
        />
      );
    }

    if (view === 'auth') {
      return (
        <AuthPage
          onAuthSuccess={handleAuthSuccess}
          onStartOnboarding={(id) => {
            handleStartOnboarding(id);
            // Get user metadata from Supabase
            supabase.auth.getUser().then(({ data }) => {
              if (data.user) {
                setUserEmail(data.user.email || '');
                setUserName(data.user.user_metadata?.name || '');
                setUserPhone(data.user.user_metadata?.phone || '');
              }
            });
          }}
        />
      );
    }

    if (view === 'onboarding' && userId) {
      return (
        <OnboardingFlow
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          userPhone={userPhone}
          onComplete={handleOnboardingComplete}
        />
      );
    }

    if (view === 'worker' && userId) {
      return (
        <WorkerDashboard
          userId={userId}
          onLogout={handleLogout}
        />
      );
    }

    if (view === 'admin') {
      return (
        <AdminPanel
          onBack={() => setView('landing')}
        />
      );
    }

    return null;
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Suspense
        fallback={
          <div className="zs-page-loader">
            <div className="zs-page-loader-spinner" />
            <p>Loading interface...</p>
          </div>
        }
      >
        <div key={view} className="zs-view-transition">
          {renderView()}
        </div>
      </Suspense>
    </div>
  );
}