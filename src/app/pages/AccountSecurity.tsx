import { useCallback, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Monitor, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DataError, type DataProvider, type Session } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';

const timeInIndia = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
});
const formatExpiry = (value: number) => timeInIndia.format(value) + ' IST';

export function AccountSecurity({ provider, session, onExpired, onSignedOut }: {
  provider: DataProvider; session: Session; onExpired: () => void; onSignedOut: () => void;
}) {
  const load = useCallback(() => provider.security(session), [provider, session]);
  const { value, error, loading, refresh } = useResource(load, onExpired);
  const [selection, setSelection] = useState<{ sessionId?: string }>();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordPending) return;
    setPasswordPending(true);
    setPasswordError('');
    const fields = new FormData(event.currentTarget);
    try {
      await provider.changePassword(session, String(fields.get('currentPassword')), String(fields.get('newPassword')));
      onSignedOut();
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setPasswordError(readableError(failure));
    } finally {
      setPasswordPending(false);
    }
  }

  async function confirm() {
    if (!selection || pending) return;
    setPending(true);
    setFeedback(undefined);
    try {
      if (selection.sessionId) {
        await provider.revokeSession(session, selection.sessionId);
        refresh();
        setFeedback({ text: 'Session signed out.' });
      } else {
        await provider.signOut(session, true);
        onSignedOut();
      }
      setSelection(undefined);
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setFeedback({ text: readableError(failure), error: true });
    } finally {
      setPending(false);
    }
  }

  return <>
    <section className="account-panel security-credentials" aria-labelledby="security-credentials-title">
      <div className="security-panel-heading"><h2 id="security-credentials-title"><KeyRound size={20} aria-hidden="true" /> Login credentials</h2></div>
      <div className="security-panel-body">
        <h3>Password</h3><p>Changing your password signs out all browsers.</p>
        <form className="staff-form" onSubmit={(event) => { void changePassword(event); }}>
          <label>Current password<input className="account-input" name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New password<input className="account-input" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <Button className="account-button" disabled={passwordPending}>{passwordPending ? 'Changing password…' : 'Change password'}</Button>
          {passwordError && <p role="alert" className="account-message account-error">{passwordError}</p>}
        </form>
        <div className="auth-note"><ShieldCheck size={20} aria-hidden="true" /><div>
          <strong>Authenticator app</strong>
          <p>{value ? value.authenticatorEnrolled ? 'Enabled for this account.' : 'No authenticator enrolled.' : 'Checking authenticator status…'}</p>
        </div></div>
      </div>
    </section>
    <section className="account-panel security-sessions" aria-labelledby="security-sessions-title">
      <div className="security-panel-heading">
        <div><h2 id="security-sessions-title"><Monitor size={20} aria-hidden="true" /> Active sessions</h2>
          <p>Review the browsers signed in to your account.</p></div>
        <Button variant="outline" className="account-quiet security-danger" onClick={() => { setFeedback(undefined); setSelection({}); }}>
          <LogOut aria-hidden="true" /> Sign out everywhere
        </Button>
      </div>
      {loading && <p className="security-panel-body" role="status">Loading sessions…</p>}
      {error && <div className="security-panel-body" role="alert">{error} <Button variant="outline" className="account-quiet" onClick={refresh}>Retry</Button></div>}
      {feedback && !selection && <p className="security-panel-body" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      {value && !error && <ul className="security-session-list" aria-label="Signed-in sessions">
        {value.sessions.map((entry, index) => <li key={entry.id}>
          <div><strong>{entry.current ? 'This browser' : 'Other session ' + (index + 1)}</strong>
            {entry.current && <span className="security-current">Current session</span>}</div>
          <div><span className="security-caption">Expires if idle</span><time dateTime={new Date(entry.idleExpiresAt).toISOString()}>{formatExpiry(entry.idleExpiresAt)}</time></div>
          <div><span className="security-caption">Session ends by</span><time dateTime={new Date(entry.absoluteExpiresAt).toISOString()}>{formatExpiry(entry.absoluteExpiresAt)}</time></div>
          {!entry.current && <Button variant="outline" className="account-quiet"
            onClick={() => { setFeedback(undefined); setSelection({ sessionId: entry.id }); }}>Revoke session</Button>}
        </li>)}
      </ul>}
      {value && value.sessions.every((entry) => entry.current) && !error && <p className="security-panel-body">You have no other active sessions.</p>}
    </section>
    <Dialog open={Boolean(selection)} onOpenChange={(open) => { if (!open && !pending) setSelection(undefined); }}>
      <DialogContent className="account-dialog" container={document.querySelector<HTMLElement>('.account-shell')}>
        <DialogHeader>
          <DialogTitle>{selection?.sessionId ? 'Revoke this session?' : 'Sign out everywhere?'}</DialogTitle>
          <DialogDescription>{selection?.sessionId ? 'This ends access from the selected browser.' : 'This ends all sessions, including this browser.'}</DialogDescription>
        </DialogHeader>
        {feedback?.error && <p role="alert">{feedback.text}</p>}
        <DialogFooter>
          <Button variant="outline" className="account-quiet" disabled={pending} onClick={() => setSelection(undefined)}>Cancel</Button>
          <Button className="account-button" disabled={pending} onClick={() => { void confirm(); }}>
            {pending ? 'Signing out…' : selection?.sessionId ? 'Revoke session' : 'Sign out everywhere'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
