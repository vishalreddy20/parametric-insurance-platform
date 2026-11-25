import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '../components/ui/button';
import type { DataProvider } from '../data/provider';
import { readableError } from '../data/use-resource';

export function ResetPassword({ provider }: { provider: DataProvider }) {
  const { state } = useLocation();
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await provider.resetPassword(String(fields.get('code')).trim(), String(fields.get('newPassword')));
      setComplete(true);
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setPending(false);
    }
  }

  return <section className="account-card account-notice">
    <div className="account-icon"><KeyRound aria-hidden="true" /></div>
    <h1>Forgot password?</h1>
    <p>Password resets are handled by an administrator.</p>
    {complete ? <p role="status">Password changed. Sign in with your new password.</p> : active ?
      <form className="staff-form" onSubmit={(event) => { void submit(event); }}>
        <label>Reset code<input className="account-input" type="password" name="code" autoComplete="off" maxLength={43} required /></label>
        <label>New password<input className="account-input" type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <Button className="account-button" disabled={pending}>{pending ? 'Saving…' : 'Reset password'}</Button>
        {error && <p role="alert" className="account-message account-error">{error}</p>}
      </form> : <Button variant="outline" className="account-quiet" onClick={() => setActive(true)}>I have a reset code</Button>}
    <Button asChild className="account-button"><Link to="/sign-in" state={state}>Back to sign in</Link></Button>
  </section>;
}
