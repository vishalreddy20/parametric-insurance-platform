import { useCallback, useState, type FormEvent } from 'react';
import { PlatformActivity } from './PlatformActivity';
import { AuthAudit } from './AuthAudit';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { DataError, type DataProvider, type Session, type StaffAccount, type DirectoryAccount } from '../data/provider';
import { readableError, useResource } from '../data/use-resource';

const roles: StaffAccount['role'][] = ['insurer', 'regulator', 'platform', 'admin'];

export function StaffDirectory({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const admin = session.role === 'admin';
  const [after, setAfter] = useState<string>();
  const [role, setRole] = useState<StaffAccount['role']>('insurer');
  const [editing, setEditing] = useState<DirectoryAccount>();
  const [editRole, setEditRole] = useState<StaffAccount['role']>('insurer');
  const [attest, setAttest] = useState<DirectoryAccount>();
  const [reset, setReset] = useState<{ code: string; expiresAt: number }>();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const load = useCallback(() => provider.directory(session, after), [provider, session, after]);
  const { value, loading, error, refresh } = useResource(load, onExpired);

  async function perform(action: () => Promise<void>, success: string) {
    setPending(true);
    setFeedback(undefined);
    try {
      await action();
      setFeedback({ error: false, text: success });
      return true;
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setFeedback({ error: true, text: readableError(failure) });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const staff = {
      username: String(fields.get('username')), password: String(fields.get('password')), role,
      platformId: role === 'platform' ? fields.get('platformId') as StaffAccount['platformId'] : null,
    };
    if (await perform(() => provider.provisionStaff(session, staff), 'Staff account created. The first sign-in requires authenticator setup.')) {
      form.reset();
      setRole('insurer');
      if (after) setAfter(undefined);
      else refresh();
    }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || pending) return;
    const fields = new FormData(event.currentTarget);
    const platformId = editRole === 'platform' ? fields.get('platformId') as StaffAccount['platformId'] : null;
    if (await perform(() => provider.changeStaffRole(session, editing.id, editRole, platformId), 'Role updated. Existing sessions have ended.')) {
      setEditing(undefined);
      refresh();
    }
  }

  return <div className="insurer-console">
    <header className="insurer-title"><div>
      <h1>{admin ? 'Admin and identity' : 'Platform fleet'}</h1>
      <p>{admin ? 'Provision staff accounts and manage active sessions.' : 'Registered workers assigned to your platform.'}</p>
    </div></header>
    {admin && <section className="account-panel"><h2>Provision staff account</h2>
      <form className="staff-form" onSubmit={(event) => { void provision(event); }}>
        <label>Username<input name="username" autoComplete="off" minLength={3} maxLength={64} required className="account-input" /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="account-input" /></label>
        <label>Role<select name="role" className="account-input" value={role} onChange={(event) => setRole(event.target.value as StaffAccount['role'])}>
          {roles.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        {role === 'platform' && <label>Platform<select name="platformId" className="account-input"><option value="zomato">Zomato</option><option value="swiggy">Swiggy</option></select></label>}
        <Button className="account-button" disabled={pending}>Create staff account</Button>
      </form>
    </section>}
    {reset && <section className="account-panel"><h2>One-time reset code</h2>
      <p>Share privately. Expires at {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(reset.expiresAt)} IST.</p>
      <code className="staff-reset-code">{reset.code}</code>
      <div><Button variant="outline" onClick={() => setReset(undefined)}>Hide code</Button></div>
    </section>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'account-message account-error' : 'account-message'}>{feedback.text}</p>}
    <section className="account-panel"><h2>{admin ? 'Account directory' : 'Workers'}</h2>
      {loading && <p role="status">Loading accounts…</p>}
      {error && <p role="alert">{error} <Button variant="outline" onClick={refresh}>Retry</Button></p>}
      {!loading && !error && value && <>
        {!value.records.length && <p>No accounts to show.</p>}
        <ul className="staff-list">{value.records.map((account) => <li key={account.id}>
          <div><strong>{account.username}</strong><p>{admin ? account.role : <code>{account.id}</code>}</p></div>
          {admin && account.username !== session.username && <div className="account-actions">
            {account.role !== 'worker' && <Button variant="outline" className="account-quiet" disabled={pending}
              aria-label={'Change role for ' + account.username} onClick={() => {
                setFeedback(undefined); setEditRole(account.role as StaffAccount['role']); setEditing(account);
              }}>Change role</Button>}
            <Button variant="outline" className="account-quiet" disabled={pending} aria-label={'Issue reset code for ' + account.username}
              onClick={() => {
                setReset(undefined);
                void perform(async () => { setReset(await provider.issuePasswordReset(session, account.id)); }, 'Reset code issued.');
              }}>Issue reset code</Button>
            <Button variant="outline" className="account-quiet" disabled={pending}
            aria-label={'Revoke all sessions for ' + account.username}
            onClick={() => { void perform(() => provider.revokeAccount(session, account.id), 'All sessions revoked for ' + account.username + '.'); }}>
            Revoke sessions
          </Button></div>}
          {!admin && <Button variant="outline" className="account-quiet" onClick={() => setAttest(account)}>Record activity</Button>}
        </li>)}</ul>
        <div className="account-actions">
          {after && <Button variant="outline" onClick={() => setAfter(undefined)}>First page</Button>}
          {value.next && <Button variant="outline" onClick={() => setAfter(value.next ?? undefined)}>Next page</Button>}
        </div>
      </>}
    </section>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(undefined); }}>
      <DialogContent className="account-dialog" container={document.querySelector<HTMLElement>('.account-shell')}>
        <DialogHeader><DialogTitle>Change staff role</DialogTitle>
          <DialogDescription>Update {editing?.username} and end their existing sessions.</DialogDescription></DialogHeader>
        <form className="staff-form" onSubmit={(event) => { void saveRole(event); }}>
          <label>Role<select className="account-input" value={editRole} onChange={(event) => setEditRole(event.target.value as StaffAccount['role'])}>
            {roles.map((item) => <option key={item}>{item}</option>)}
          </select></label>
          {editRole === 'platform' && <label>Platform<select name="platformId" className="account-input" defaultValue={editing?.platformId ?? 'zomato'}>
            <option value="zomato">Zomato</option><option value="swiggy">Swiggy</option>
          </select></label>}
          {feedback?.error && <p role="alert">{feedback.text}</p>}
          <Button className="account-button" disabled={pending}>{pending ? 'Saving…' : 'Save role'}</Button>
        </form>
      </DialogContent>
    </Dialog>
    {attest && <PlatformActivity key={attest.id} account={attest} provider={provider} session={session}
      onClose={() => setAttest(undefined)} onExpired={onExpired} />}
    {admin && <AuthAudit provider={provider} session={session} onExpired={onExpired} />}
  </div>;
}
