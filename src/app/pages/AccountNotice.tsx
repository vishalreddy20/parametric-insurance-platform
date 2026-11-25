import { CircleAlert, LockKeyhole, Search, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';

const notices = {
  403: { title: '403 · Access denied', icon: LockKeyhole },
  404: { title: '404 · Page not found', icon: Search },
  500: { title: '500 · Something went wrong', icon: CircleAlert },
  offline: { title: 'Gateway unreachable', icon: WifiOff },
} as const;

export function AccountNotice({ kind, message, back, backLabel, retry, requestId }: {
  kind: keyof typeof notices; message: string; back: string; backLabel: string; retry?: () => void; requestId?: string;
}) {
  const { title, icon: Icon } = notices[kind];
  return <section className="account-card account-notice" aria-labelledby="account-notice-title">
    <div className="account-icon"><Icon aria-hidden="true" /></div>
    <h1 id="account-notice-title">{title}</h1>
    <p>{message}</p>
    {requestId && <p>Support request ID <code>{requestId}</code></p>}
    <div className="account-actions">
      {retry && <Button className="account-button" onClick={retry}>Try again</Button>}
      <Button asChild variant={retry ? 'outline' : 'default'} className={retry ? 'account-quiet' : 'account-button'}>
        <Link to={back}>{backLabel}</Link>
      </Button>
    </div>
  </section>;
}
