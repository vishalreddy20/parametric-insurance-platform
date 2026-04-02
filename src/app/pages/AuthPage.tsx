import { useState } from 'react';
import { Shield, Mail, Lock, User, Phone, ChevronRight } from 'lucide-react';
import { supabase } from '../components/supabase-client';

interface AuthPageProps {
  onAuthSuccess: (userId: string, token: string) => void;
  onStartOnboarding: (userId: string) => void;
}

export function AuthPage({ onAuthSuccess, onStartOnboarding }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.session) {
        onAuthSuccess(data.user.id, data.session.access_token);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!email || !password || !name) throw new Error('Please fill in all required fields');
      if (password.length < 6) throw new Error('Password must be at least 6 characters');

      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { name, phone } }
      });
      if (authError) throw authError;
      if (data.user) {
        onStartOnboarding(data.user.id);
      }
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zs-gradient-hero)', padding: 24, position: 'relative', overflow: 'hidden' }}>
      {/* Background Effects */}
      <div style={{ position: 'absolute', top: '20%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(99,102,241,0.08)', filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 250, height: 250, borderRadius: '50%', background: 'rgba(168,85,247,0.06)', filter: 'blur(60px)' }} />

      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 10 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }}>
            <Shield size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, fontFamily: 'Outfit' }} className="gradient-text">ZyroSafe</h1>
          <p style={{ fontSize: 14, color: 'var(--zs-text-secondary)', marginTop: 4 }}>AI-Powered Parametric Insurance for Delivery Partners</p>
        </div>

        {/* Card */}
        <div className="glass-strong" style={{ padding: 32 }}>
          {/* Tab Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
            <button onClick={() => { setMode('login'); setError(''); }} style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s', background: mode === 'login' ? 'var(--zs-accent)' : 'transparent', color: mode === 'login' ? 'white' : 'var(--zs-text-muted)' }}>Login</button>
            <button onClick={() => { setMode('signup'); setError(''); }} style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s', background: mode === 'signup' ? 'var(--zs-accent)' : 'transparent', color: mode === 'signup' ? 'white' : 'var(--zs-text-muted)' }}>Sign Up</button>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
            {mode === 'signup' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label className="zs-label">Full Name *</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--zs-text-muted)' }} />
                    <input className="zs-input" style={{ paddingLeft: 36 }} placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="zs-label">Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--zs-text-muted)' }} />
                    <input className="zs-input" style={{ paddingLeft: 36 }} placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
              </>
            )}
            <div style={{ marginBottom: 16 }}>
              <label className="zs-label">Email *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--zs-text-muted)' }} />
                <input className="zs-input" type="email" style={{ paddingLeft: 36 }} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="zs-label">Password *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--zs-text-muted)' }} />
                <input className="zs-input" type="password" style={{ paddingLeft: 36 }} placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '14px 0', fontSize: 14 }}>
              {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}
              {!loading && <ChevronRight size={16} />}
            </button>
          </form>

          {mode === 'login' && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--zs-text-muted)', marginTop: 16 }}>
              New delivery partner? <button onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--zs-accent-light)', cursor: 'pointer', fontWeight: 600 }}>Create an account</button>
            </p>
          )}
        </div>

        {/* Trust indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24 }}>
          {['🔒 Encrypted', '⚡ Instant Payouts', '🤖 AI Powered'].map(item => (
            <span key={item} style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
