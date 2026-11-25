import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ChevronRight, Shield } from 'lucide-react';
import type { DataProvider, Session } from '../data/provider';
import { readableError } from '../data/use-resource';

export function AuthPage({ provider, onSuccess, onBack, message }: {
  provider: DataProvider; onSuccess: (session: Session) => void; onBack: () => void; message: string;
}) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const demo = provider.mode === 'demo';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try { onSuccess(await provider.signIn(username.trim(), code)); }
    catch (error) { setError(readableError(error)); }
    finally { busy.current = false; setLoading(false); }
  }

  return (
    <main className="ps-auth">
      <div className="ps-auth-frame animate-fade-in-up">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={15} /> Home</button>
        <div className="ps-auth-brand"><span className="ps-mark"><Shield size={28} color="white" /></span>
          <h1 className="gradient-text">ParaShield</h1>
          <p>Income protection for delivery partners</p>
        </div>
        <section className="glass-strong ps-card">
          <span className="badge badge-info">{demo ? 'SIMULATED · LOCAL DATA' : 'SIMULATED IDENTITY'}</span>
          <h2>Sign in</h2>
          {(error || message) && <p className="ps-error" role="alert">{error || message}</p>}
          <form onSubmit={submit} className="ps-form">
            {!demo && <>
              <label className="zs-label">Username
                <input autoComplete="username" className="zs-input" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={64} />
              </label>
              <label className="zs-label">Access code
                <input autoComplete="current-password" type="password" className="zs-input" value={code} onChange={(event) => setCode(event.target.value)} required minLength={16} maxLength={256} />
              </label>
            </>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : demo ? 'Open local worker demo' : 'Sign in'} <ChevronRight size={16} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
