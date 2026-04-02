import { useState, useEffect } from 'react';
import {
  Shield, Users as UsersIcon, AlertTriangle, TrendingUp, Activity,
  BarChart3, PieChart as PieChartIcon, Eye, Check, X, ArrowLeft,
  Zap, Clock, MapPin, CreditCard, RefreshCw, Search, Filter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { getSystemMetrics, getPredictiveAnalytics, type SystemMetrics, type PredictiveInsight } from '../services/analytics-engine';
import { Users, Flagged, Claims } from '../services/mock-db';
import type { UserProfile, FlaggedClaim, Claim } from '../services/mock-db';
import { adminApproveClaim, adminRejectClaim } from '../services/claim-processor';
import { detectFraudRings } from '../services/fraud-engine';

interface AdminPanelProps {
  onBack: () => void;
}

export function AdminPanel({ onBack }: AdminPanelProps) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [predictions, setPredictions] = useState<PredictiveInsight[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [flagged, setFlagged] = useState<FlaggedClaim[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'fraud' | 'predictions' | 'users'>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const refreshData = () => {
    setMetrics(getSystemMetrics());
    setPredictions(getPredictiveAnalytics());
    setUsers(Users.getAll());
    setFlagged(Flagged.getAll());
  };

  useEffect(() => { refreshData(); }, []);

  const handleApprove = (claimId: string) => {
    adminApproveClaim(claimId, 'Verified legitimate by admin');
    refreshData();
  };

  const handleReject = (claimId: string) => {
    adminRejectClaim(claimId, 'Confirmed fraudulent activity');
    refreshData();
  };

  const fraudRings = detectFraudRings();
  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()) || u.city.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!metrics) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--zs-bg-primary)' }}><RefreshCw className="animate-spin-slow" size={32} color="var(--zs-accent)" /></div>;

  const chartColors = ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--zs-bg-primary)' }}>
      {/* Header */}
      <header style={{ background: 'var(--zs-bg-secondary)', borderBottom: '1px solid var(--zs-border)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={20} color="white" /></div>
          <div><h1 style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Outfit' }} className="gradient-text">ZyroSafe Admin</h1>
          <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Insurer Intelligence Dashboard</p></div>
        </div>
        <button onClick={onBack} className="btn-secondary" style={{ fontSize: 12 }}><ArrowLeft size={14} /> Back to Login</button>
      </header>

      {/* Tab Nav */}
      <nav className="zs-tab-nav">
        {[
          { key: 'overview', label: 'Analytics', icon: <BarChart3 size={14} /> },
          { key: 'fraud', label: 'Fraud Detection', icon: <AlertTriangle size={14} /> },
          { key: 'predictions', label: 'Predictive', icon: <Zap size={14} /> },
          { key: 'users', label: 'Users', icon: <UsersIcon size={14} /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`zs-tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}>
            {tab.icon} {tab.label}
            {tab.key === 'fraud' && flagged.filter(f => f.reviewStatus === 'pending').length > 0 && (
              <span style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{flagged.filter(f => f.reviewStatus === 'pending').length}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="zs-tab-panel">
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Users', value: metrics.totalUsers, sub: `${metrics.activeSubscriptions} active`, color: '#6366f1' },
                { label: 'Total Claims', value: metrics.totalClaims, sub: `${metrics.approvedClaims} approved`, color: '#10b981' },
                { label: 'Total Payouts', value: `₹${metrics.totalPayouts.toLocaleString('en-IN')}`, sub: `Avg ₹${metrics.avgPayoutAmount}`, color: '#f59e0b' },
                { label: 'Premium Collected', value: `₹${metrics.totalPremiumCollected.toLocaleString('en-IN')}`, sub: 'Aggregate pool', color: '#06b6d4' },
                { label: 'Loss Ratio', value: `${(metrics.lossRatio * 100).toFixed(0)}%`, sub: metrics.lossRatio < 0.7 ? 'Healthy' : 'Watch', color: metrics.lossRatio < 0.7 ? '#10b981' : '#ef4444' },
                { label: 'Pool Balance', value: `₹${metrics.poolBalance.toLocaleString('en-IN')}`, sub: 'Available liquidity', color: '#a855f7' },
                { label: 'Fraud Detection', value: `${metrics.fraudDetectionRate}%`, sub: `${metrics.flaggedClaims} pending review`, color: '#ef4444' },
                { label: 'Avg Risk Score', value: `${metrics.avgRiskScore}/100`, sub: metrics.avgRiskScore < 30 ? 'Low risk pool' : 'Elevated', color: metrics.avgRiskScore < 30 ? '#10b981' : '#f59e0b' },
              ].map((kpi, i) => (
                <div key={i} className="kpi-card">
                  <div className="kpi-label">{kpi.label}</div>
                  <div className="kpi-value" style={{ color: kpi.color, fontSize: 22 }}>{kpi.value}</div>
                  <div className="kpi-sub">{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="zs-grid-2">
              {/* Revenue vs Payouts */}
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16 }}>📈 Premium vs Payouts (Weekly)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={metrics.weeklyRevenue.map((r, i) => ({ week: r.week, revenue: r.amount, payouts: metrics.weeklyPayouts[i]?.amount || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                    <Area type="monotone" dataKey="revenue" stackId="1" stroke="#6366f1" fill="rgba(99,102,241,0.3)" name="Premium" />
                    <Area type="monotone" dataKey="payouts" stackId="2" stroke="#ef4444" fill="rgba(239,68,68,0.2)" name="Payouts" />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Tier Distribution */}
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16 }}>🎯 Tier Distribution</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={metrics.tierDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      {metrics.tierDistribution.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Claims by Type + Risk Distribution */}
            <div className="zs-grid-2">
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16 }}>🌧️ Claims by Disruption Type</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(metrics.claimsByType).map(([type, count]) => ({ type: type.replace(/_/g, ' '), count }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16 }}>🛡️ Risk Score Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={metrics.riskDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {metrics.riskDistribution.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ===== FRAUD DETECTION TAB ===== */}
        {activeTab === 'fraud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="zs-tab-panel">
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>🛡️ Fraud Detection & Review</h2>

            {/* Fraud Rings */}
            {fraudRings.length > 0 && (
              <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> Detected Fraud Rings</h3>
                {fraudRings.map(ring => (
                  <div key={ring.ringId} style={{ padding: 12, marginBottom: 8, background: 'rgba(239,68,68,0.05)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="badge badge-danger">{ring.severity}</span>
                      <span style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{ring.ringId}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--zs-text-secondary)', marginBottom: 4 }}>{ring.pattern}</p>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Accounts: {ring.accounts.join(', ')}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Flagged Claims */}
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Flagged Claims for Review</h3>
            {flagged.filter(f => f.reviewStatus === 'pending').length === 0 ? (
              <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
                <Check size={40} style={{ color: '#10b981', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--zs-text-secondary)' }}>No flagged claims pending review. All clear.</p>
              </div>
            ) : flagged.filter(f => f.reviewStatus === 'pending').map(flag => (
              <div key={flag.claimId} className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{flag.claimId}</p>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>Risk Score: <span style={{ color: flag.riskScore > 70 ? '#ef4444' : '#f59e0b' }}>{flag.riskScore}/100</span></p>
                  </div>
                  <span className={`badge badge-${flag.riskScore > 70 ? 'danger' : 'warning'}`}>{flag.riskScore > 70 ? 'High Risk' : 'Medium Risk'}</span>
                </div>
                {/* Fraud Factor Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {Object.entries(flag.fraudFactors).filter(([k]) => k !== 'totalScore').map(([key, val]: [string, any]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: val.score > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)', borderRadius: 8, border: `1px solid ${val.score > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}` }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</p>
                        <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{val.detail}</p>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: val.score > 0 ? '#ef4444' : '#10b981', minWidth: 40, textAlign: 'right' }}>+{val.score}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => handleApprove(flag.claimId)} className="btn-success" style={{ flex: 1 }}><Check size={14} /> Approve Payout</button>
                  <button onClick={() => handleReject(flag.claimId)} className="btn-danger" style={{ flex: 1 }}><X size={14} /> Reject & Flag</button>
                </div>
              </div>
            ))}

            {/* Reviewed Claims */}
            {flagged.filter(f => f.reviewStatus !== 'pending').length > 0 && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Reviewed Claims</h3>
                {flagged.filter(f => f.reviewStatus !== 'pending').map(flag => (
                  <div key={flag.claimId} className="glass-card" style={{ padding: 16, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600 }}>{flag.claimId}</p>
                      <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Risk: {flag.riskScore}/100 · {flag.reviewNote}</p>
                    </div>
                    <span className={`badge badge-${flag.reviewStatus === 'approved' ? 'success' : 'danger'}`}>{flag.reviewStatus}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ===== PREDICTIVE ANALYTICS TAB ===== */}
        {activeTab === 'predictions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="zs-tab-panel">
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>🔮 Predictive Analytics — Next 7 Days</h2>
            <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginTop: -12 }}>AI-powered predictions based on weather forecast models and historical claim data.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
              {predictions.map(prediction => (
                <div key={prediction.city} className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{prediction.city}</h3>
                      <span className={`badge badge-${prediction.nextWeekRisk === 'critical' ? 'danger' : prediction.nextWeekRisk === 'high' ? 'warning' : prediction.nextWeekRisk === 'moderate' ? 'info' : 'success'}`}>
                        {prediction.nextWeekRisk.toUpperCase()} RISK
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', color: '#6366f1' }}>{prediction.predictedClaims}</p>
                      <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>predicted claims</p>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginBottom: 4 }}>Risk Factors:</p>
                    {prediction.riskFactors.map((f, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--zs-text-secondary)', paddingLeft: 12, borderLeft: '2px solid var(--zs-accent)', marginBottom: 4 }}>• {f}</p>
                    ))}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginBottom: 8 }}>7-Day Forecast:</p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {prediction.forecast.map((day: any, i: number) => (
                        <div key={i} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRadius: 8, background: day.riskLevel === 'danger' ? 'rgba(239,68,68,0.1)' : day.riskLevel === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${day.riskLevel === 'danger' ? 'rgba(239,68,68,0.15)' : day.riskLevel === 'warning' ? 'rgba(245,158,11,0.15)' : 'var(--zs-border)'}` }}>
                          <p style={{ fontSize: 14 }}>{day.icon}</p>
                          <p style={{ fontSize: 10, fontWeight: 600 }}>{day.tempHigh}°</p>
                          <p style={{ fontSize: 9, color: 'var(--zs-text-muted)' }}>{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--zs-border)', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Est. Payouts</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>₹{prediction.predictedPayouts.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== USERS TAB ===== */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="zs-tab-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>👥 User Management</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={14} style={{ color: 'var(--zs-text-muted)' }} />
                <input type="text" placeholder="Search by name, email, city..." className="zs-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: 280 }} />
              </div>
            </div>

            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--zs-border)' }}>
                    {['Name', 'Platform', 'City', 'Tier', 'Income/wk', 'Premium/wk', 'Claims', 'Payouts', 'Risk'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--zs-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.userId} style={{ borderBottom: '1px solid var(--zs-border)', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{u.email}</p>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{u.platform ? u.platform.charAt(0).toUpperCase() + u.platform.slice(1) : 'N/A'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{u.city}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge badge-${u.subscriptionTier === 'premium' ? 'info' : u.subscriptionTier === 'standard' ? 'info' : u.subscriptionStatus === 'active' ? 'neutral' : 'danger'}`}>
                          {u.subscriptionTier || 'None'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600 }}>₹{u.weeklyIncome?.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>₹{u.weeklyPremium || 0}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{u.claimCount || 0}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#10b981' }}>₹{(u.totalPayouts || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--zs-border)' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${u.riskScore}%`, background: u.riskScore <= 30 ? '#10b981' : u.riskScore <= 70 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: u.riskScore <= 30 ? '#10b981' : u.riskScore <= 70 ? '#f59e0b' : '#ef4444' }}>{u.riskScore}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--zs-text-muted)', fontSize: 13 }}>No users match your search.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
