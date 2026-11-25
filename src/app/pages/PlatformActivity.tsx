import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DataError, type DataProvider, type DirectoryAccount, type EnrollmentConfirmation, type Session } from '../data/provider';
import { readableError } from '../data/use-resource';

export function PlatformActivity({ account, provider, session, onClose, onExpired }: {
  account: DirectoryAccount; provider: DataProvider; session: Session; onClose: () => void; onExpired: () => void;
}) {
  const key = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EnrollmentConfirmation>();
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !session.platformId) return;
    const fields = new FormData(event.currentTarget);
    const start = Date.parse(String(fields.get('start')) + '+05:30') / 1000;
    const end = Date.parse(String(fields.get('end')) + '+05:30') / 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end * 1000 > Date.now() || end - start > 604800) {
      setError('Choose an elapsed activity window of up to seven days.');
      return;
    }
    setError('');
    setPending(true);
    key.current ??= crypto.randomUUID();
    try {
      setResult(await provider.recordActivity(session, {
        workerId: account.id, platformId: session.platformId, windowStart: start, windowEnd: end, requestId: key.current,
      }));
    } catch (failure) {
      if (failure instanceof DataError && failure.code === 'ERR_SESSION_EXPIRED') onExpired();
      else setError(readableError(failure));
    } finally {
      setPending(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="account-dialog" container={document.querySelector<HTMLElement>('.account-shell')}>
      <DialogHeader><DialogTitle>Record worker activity</DialogTitle>
        <DialogDescription>Attest a completed work interval for {account.username}. Enter both times in IST.</DialogDescription></DialogHeader>
      {result ? <div role="status"><p>Activity recorded in block {result.blockNumber}.</p><code className="staff-reset-code">{result.txId}</code></div> :
        <form className="staff-form" onChange={() => { key.current = undefined; }} onSubmit={(event) => { void submit(event); }}>
          <label>Activity start (IST)<input name="start" className="account-input" type="datetime-local" step="1" disabled={pending} required /></label>
          <label>Activity end (IST)<input name="end" className="account-input" type="datetime-local" step="1" disabled={pending} required /></label>
          {error && <p role="alert" className="account-message account-error">{error}</p>}
          <Button className="account-button" disabled={pending}>{pending ? 'Recording…' : 'Record activity'}</Button>
        </form>}
      <Button type="button" className="account-quiet" variant="outline" disabled={pending} onClick={onClose}>Close</Button>
    </DialogContent>
  </Dialog>;
}
