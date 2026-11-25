import { useCallback, useState } from 'react';
import { Button } from '../components/ui/button';
import type { DataProvider, Session } from '../data/provider';
import { useResource } from '../data/use-resource';
import { dateLabel } from './WorkerDashboard';

export function AuthAudit({ provider, session, onExpired }: {
  provider: DataProvider; session: Session; onExpired: () => void;
}) {
  const [before, setBefore] = useState<number>();
  const load = useCallback(() => provider.authAudit(session, before), [provider, session, before]);
  const { value, error, loading, refresh } = useResource(load, onExpired);
  return <section className="account-panel" aria-labelledby="auth-audit-title">
    <h2 id="auth-audit-title">Authentication audit</h2>
    <p>Recorded account security events and request references.</p>
    {loading && <p role="status">Loading authentication audit…</p>}
    {error && <p role="alert">{error} <Button variant="outline" onClick={refresh}>Retry</Button></p>}
    {!error && !loading && value && <>
      {!value.records.length && <p>No authentication events recorded.</p>}
      <ul className="staff-list">{value.records.map((entry) => <li key={entry.id}>
        <div><strong>{entry.action.replaceAll('_', ' ').toLowerCase()}</strong>
          <p>{dateLabel(entry.at / 1000)}{entry.role && ' · ' + entry.role}</p></div>
        <p><code>{entry.requestId}</code></p>
      </li>)}</ul>
      <div className="account-actions">
        {before && <Button variant="outline" onClick={() => setBefore(undefined)}>Latest events</Button>}
        {value.next && <Button variant="outline" onClick={() => setBefore(value.next ?? undefined)}>Older events</Button>}
      </div>
    </>}
  </section>;
}
