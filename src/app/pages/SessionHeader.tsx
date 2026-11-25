import { LogOut, Shield } from 'lucide-react';

export function SessionHeader({ title, logout }: { title: string; logout: () => void }) {
  return (
    <header className="ps-header">
      <div className="ps-brand">
        <span className="ps-mark"><Shield size={20} color="white" /></span>
        <div><h1 className="gradient-text">ParaShield</h1><p>{title}</p></div>
      </div>
      <div className="ps-actions">
        <button className="btn-secondary" onClick={logout}><LogOut size={15} /> Sign out</button>
      </div>
    </header>
  );
}
