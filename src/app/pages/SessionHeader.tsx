import { LogOut, Shield } from 'lucide-react';

export function SessionHeader({ title, logout, demo }: { title: string; logout: () => void; demo: boolean }) {
  return (
    <header className="ps-header">
      <div className="ps-brand">
        <span className="ps-mark"><Shield size={20} color="white" /></span>
        <div><h1 className="gradient-text">ParaShield</h1><p>{title}</p></div>
      </div>
      <div className="ps-actions">
        <span className="badge badge-info">{demo ? 'SIMULATED · LOCAL DATA' : 'SIMULATED IDENTITY'}</span>
        <button className="btn-secondary" onClick={logout}><LogOut size={15} /> Sign out</button>
      </div>
    </header>
  );
}
