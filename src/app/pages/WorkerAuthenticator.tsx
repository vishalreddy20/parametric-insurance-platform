import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DataError, type DataProvider, type Session } from '../data/provider';
import { readableError } from '../data/use-resource';

export function WorkerAuthenticator({ enrolled, provider, session, onExpired, onUpdated }: {
  enrolled: boolean; provider: DataProvider; session: Session; onExpired: () => void; onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [setupKey, setSetupKey] = useState<string>();
  const [codes, setCodes] = useState<string[]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setSetupKey(undefined);
    setCodes(undefined);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const action = enrolled ? 'disable' : setupKey ? 'enable' : 'start';
    const code = fields.get('code');
    setError('');
    setPending(true);
    try {
      const response = await provider.manageAuthenticator(session, {
        action, password: String(fields.get('password')), ...(code && { code: String(code).trim() }),
      });
      if (action === 'start') setSetupKey(response.setupKey);
      else if (action === 'enable') {
        setSetupKey(undefined);
        setCodes(response.recoveryCodes);
        onUpdated();
      } else {
        close();
        onUpdated();
      }
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setError(readableError(failure));
    } finally {
      setPending(false);
    }
  }

  return <>
    <Button variant="outline" className="account-quiet" onClick={() => setOpen(true)}>{enrolled ? 'Disable authenticator' : 'Enable authenticator'}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value && !pending) close(); }}>
      <DialogContent className="account-dialog" container={document.querySelector<HTMLElement>('.account-shell')}>
        <DialogHeader><DialogTitle>{codes ? 'Save recovery codes' : enrolled ? 'Disable authenticator' : 'Enable authenticator'}</DialogTitle>
          <DialogDescription>{codes ? 'Store each single-use code privately before closing.' :
            enrolled ? 'Confirm your password and enter an authenticator or recovery code.' : 'Confirm your password to pair an authenticator app.'}</DialogDescription></DialogHeader>
        {codes ? <ul className="staff-list">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul> : <>
          {setupKey && <div><QRCodeSVG value={`otpauth://totp/ParaShield:${encodeURIComponent(session.username)}?secret=${setupKey}&issuer=ParaShield`}
            size={120} aria-label="Authenticator setup QR code" /><p>Manual setup key</p><code className="staff-reset-code">{setupKey}</code></div>}
          <form className="staff-form" onSubmit={(event) => { void submit(event); }}>
            <label>Current password<input className="account-input" name="password" type="password" autoComplete="current-password" required /></label>
            {(setupKey || enrolled) && <label>{enrolled ? 'Authenticator or recovery code' : 'Authenticator code'}
              <input className="account-input" name="code" autoComplete="one-time-code" maxLength={enrolled ? 20 : 6} required /></label>}
            {error && <p role="alert" className="account-message account-error">{error}</p>}
            <Button className="account-button" disabled={pending}>{pending ? 'Checking…' : enrolled ? 'Confirm disable' : setupKey ? 'Verify and enable' : 'Start setup'}</Button>
          </form>
        </>}
        <Button type="button" variant="outline" className="account-quiet" disabled={pending} onClick={close}>{codes ? 'Done' : 'Cancel'}</Button>
      </DialogContent>
    </Dialog>
  </>;
}
