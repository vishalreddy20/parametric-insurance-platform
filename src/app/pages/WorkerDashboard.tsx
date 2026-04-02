import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, MapPin, Clock, CheckCircle, AlertTriangle, TrendingUp,
  Zap, CreditCard, User, ChevronRight, RefreshCw, LogOut, FileText,
  CloudRain, Sun, Wind, Activity, ArrowUpRight, ArrowDownRight, BarChart3
} from 'lucide-react';
import { Users, Claims, Payouts, Policies } from '../services/mock-db';
import type { UserProfile, Policy, Claim, Payout } from '../services/mock-db';
import { getCurrentWeather, type WeatherData } from '../services/weather-oracle';
import { processClaim, type ClaimProcessResult } from '../services/claim-processor';
import { getUserAnalytics } from '../services/analytics-engine';
import { TIER_CONFIG, calculatePayout } from '../services/ai-premium-engine';
import { formatTransactionForDisplay } from '../services/mock-payment';

interface WorkerDashboardProps {
  userId: string;
  onLogout: () => void;
}

export function WorkerDashboard({ userId, onLogout }: WorkerDashboardProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'claims' | 'payouts' | 'policy'>('overview');
  const [claimResult, setClaimResult] = useState<ClaimProcessResult | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [simulationType, setSimulationType] = useState<string>('auto');
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(true);
  const autoMonitorRunningRef = useRef(false);
  const AUTO_MONITOR_INTERVAL_MS = 90 * 1000;
  const AUTO_CLAIM_COOLDOWN_MS = 2 * 60 * 60 * 1000;

  const refreshData = useCallback(() => {
    const u = Users.get(userId);
    if (u) {
      setUser(u);
      const p = Policies.getByUser(userId).find(p => p.status === 'active');
      setPolicy(p || null);
      setClaims(Claims.getByUser(userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPayouts(Payouts.getByUser(userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setWeather(getCurrentWeather(u.city));
      setAnalytics(getUserAnalytics(userId));
    }
  }, [userId]);

  useEffect(() => {
    refreshData();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setLocation({ lat: 17.385, lon: 78.486 })
      );
    } else { setLocation({ lat: 17.385, lon: 78.486 }); }
  }, [refreshData]);

  useEffect(() => {
    if (!autoMonitorEnabled || !location || !user || !policy) return;

    const runAutoMonitor = async () => {
      if (autoMonitorRunningRef.current) return;

      const cooldownKey = `zyrosafe_autoclaim_${userId}`;
      const lastAutoClaimAt = Number(localStorage.getItem(cooldownKey) || '0');
      if (Date.now() - lastAutoClaimAt < AUTO_CLAIM_COOLDOWN_MS) return;

      autoMonitorRunningRef.current = true;
      try {
        const result = await processClaim(userId, location.lat, location.lon, undefined, 'auto');
        if (result.success || result.status === 'flagged') {
          localStorage.setItem(cooldownKey, String(Date.now()));
          setClaimResult(result);
          refreshData();
        }
      } catch (error) {
        console.error('Auto monitoring failed:', error);
      } finally {
        autoMonitorRunningRef.current = false;
      }
    };

    runAutoMonitor();
    const timer = setInterval(runAutoMonitor, AUTO_MONITOR_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoMonitorEnabled, location, user, policy, userId, refreshData]);

  const handleClaim = async () => {
    if (!location || !user || !policy) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      await new Promise(r => setTimeout(r, 800));
      const simType = simulationType === 'auto' ? undefined : simulationType as any;
      const result = await processClaim(userId, location.lat, location.lon, simType, 'manual');
      setClaimResult(result);
      refreshData();
    } catch (e) { console.error(e); }
    finally { setClaiming(false); }
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--zs-bg-primary)' }}><div className="animate-spin-slow" style={{ width: 40, height: 40, border: '3px solid var(--zs-border)', borderTopColor: 'var(--zs-accent)', borderRadius: '50%' }}/></div>;

  const isSubscribed = user.subscriptionStatus === 'active' && policy;
  const tierConfig = isSubscribed ? TIER_CONFIG[policy!.tier] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--zs-bg-primary)' }}>
      {/* Header */}
      <header style={{ background: 'var(--zs-bg-secondary)', borderBottom: '1px solid var(--zs-border)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={20} color="white" /></div>
          <div><h1 style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }} className="gradient-text">ZyroSafe</h1>
          <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Delivery Partner Dashboard</p></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--zs-text-primary)' }}>{user.name}</p>
            <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{user.city} · {user.platform?.charAt(0).toUpperCase()}{user.platform?.slice(1)}</p>
          </div>
          <button onClick={onLogout} style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><LogOut size={14} /> Logout</button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="zs-tab-nav">
        {[
          { key: 'overview', label: 'Overview', icon: <Activity size={14} /> },
          { key: 'claims', label: 'Claims', icon: <Shield size={14} /> },
          { key: 'payouts', label: 'Payouts', icon: <CreditCard size={14} /> },
          { key: 'policy', label: 'My Policy', icon: <FileText size={14} /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`zs-tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="zs-tab-panel">
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div className="kpi-card">
                <div className="kpi-label">Active Coverage</div>
                <div className="kpi-value" style={{ color: isSubscribed ? '#10b981' : '#ef4444' }}>{isSubscribed ? tierConfig!.label : 'None'}</div>
                <div className="kpi-sub">{isSubscribed ? `₹${user.weeklyPremium}/week premium` : 'Subscribe for protection'}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Total Earnings Protected</div>
                <div className="kpi-value" style={{ color: '#6366f1' }}>₹{(user.totalPayouts || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-sub">{user.claimCount || 0} successful claims</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Weekly Income</div>
                <div className="kpi-value">₹{user.weeklyIncome.toLocaleString('en-IN')}</div>
                <div className="kpi-sub">{user.weeklyHours}h/week · ₹{Math.round(user.weeklyIncome / user.weeklyHours)}/hr</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Risk Score</div>
                <div className="kpi-value" style={{ color: user.riskScore <= 30 ? '#10b981' : user.riskScore <= 70 ? '#f59e0b' : '#ef4444' }}>{user.riskScore}/100</div>
                <div className="kpi-sub">{user.riskScore <= 30 ? 'Low Risk' : user.riskScore <= 70 ? 'Medium Risk' : 'High Risk'}</div>
              </div>
            </div>

            {/* Weather Monitor + Quick Claim */}
            <div className="zs-grid-2">
              {/* Live Weather */}
              {weather && (
                <div className="glass-card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><CloudRain size={16} /> Live Conditions — {weather.cityName}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 40 }}>{weather.icon}</span>
                      <div>
                        <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Outfit' }}>{weather.temperature}°</p>
                        <p style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>Feels {weather.feelsLike}°</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--zs-text-muted)' }}>Rain (24h)</span>
                        <span style={{ fontWeight: 600, color: weather.rainAccumulation24h > 45 ? '#ef4444' : 'var(--zs-text-primary)' }}>{weather.rainAccumulation24h}mm</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--zs-text-muted)' }}>Wind</span>
                        <span style={{ fontWeight: 600, color: weather.windSpeed > 40 ? '#f59e0b' : 'var(--zs-text-primary)' }}>{weather.windSpeed} km/h</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--zs-text-muted)' }}>AQI</span>
                        <span style={{ fontWeight: 600, color: weather.aqi > 200 ? '#ef4444' : weather.aqi > 100 ? '#f59e0b' : '#10b981' }}>{weather.aqi}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--zs-text-muted)' }}>Humidity</span>
                        <span style={{ fontWeight: 600 }}>{weather.humidity}%</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ marginTop: 12, fontSize: 12, color: 'var(--zs-text-muted)' }}>{weather.description} · Updated {new Date(weather.timestamp).toLocaleTimeString()}</p>
                </div>
              )}

              {/* Quick Claim */}
              {isSubscribed && (
                <div className="glass-card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={16} /> Disruption Check & Claim</h3>
                  <p style={{ fontSize: 12, color: 'var(--zs-text-muted)', marginBottom: 12 }}>
                    GPS: {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Detecting...'}
                  </p>

                  <div style={{ marginBottom: 12 }}>
                    <label className="zs-label">Simulation Mode (for demo)</label>
                    <select className="zs-select" value={simulationType} onChange={e => setSimulationType(e.target.value)} style={{ fontSize: 12 }}>
                      <option value="auto">🔍 Auto-detect (real conditions)</option>
                      <option value="rainfall">🌧️ Simulate: Heavy Rainfall (72mm)</option>
                      <option value="heat">🔥 Simulate: Extreme Heat (47°C)</option>
                      <option value="storm">🌪️ Simulate: Severe Storm (78km/h)</option>
                      <option value="pollution">😷 Simulate: Hazardous AQI (380)</option>
                      <option value="cyclone">🌀 Simulate: Cyclone Alert</option>
                      <option value="strike">✊ Simulate: Bandh/Strike</option>
                      <option value="curfew">🚫 Simulate: Section 144 Curfew</option>
                      <option value="traffic">🚦 Simulate: Traffic Gridlock</option>
                      <option value="outage">📱 Simulate: Platform Outage</option>
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--zs-text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={autoMonitorEnabled}
                      onChange={(e) => setAutoMonitorEnabled(e.target.checked)}
                    />
                    Auto-monitor and trigger zero-touch claims
                  </label>

                  <button onClick={handleClaim} disabled={claiming} className="btn-primary" style={{ width: '100%', padding: '14px 20px' }}>
                    {claiming ? (<><RefreshCw size={16} className="animate-spin-slow" /> Processing Claim...</>) : (<><Shield size={16} /> Check Disruption & Claim</>)}
                  </button>

                  {claimResult && (
                    <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: claimResult.success ? 'rgba(16,185,129,0.1)' : claimResult.status === 'flagged' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${claimResult.success ? 'rgba(16,185,129,0.2)' : claimResult.status === 'flagged' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: claimResult.success ? '#10b981' : claimResult.status === 'flagged' ? '#f59e0b' : '#ef4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {claimResult.success ? <><CheckCircle size={14} /> Payout Approved!</> : claimResult.status === 'flagged' ? <><AlertTriangle size={14} /> Under Review</> : <><AlertTriangle size={14} /> {claimResult.status === 'rejected' ? 'Not Approved' : 'Error'}</>}
                      </p>
                      {claimResult.payout && <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit', color: '#10b981', margin: '4px 0' }}>₹{claimResult.payout}</p>}
                      <p style={{ fontSize: 11, color: 'var(--zs-text-secondary)' }}>{claimResult.message}</p>
                      {claimResult.claimId && <p style={{ fontSize: 10, color: 'var(--zs-text-muted)', marginTop: 4 }}>Claim ID: {claimResult.claimId}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ROI Summary */}
            {analytics && (
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16 }}>📊 Your Insurance ROI</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  <div><p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Premium Paid</p><p style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>₹{analytics.totalPremiumPaid.toLocaleString('en-IN')}</p></div>
                  <div><p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Earnings Protected</p><p style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>₹{analytics.totalProtected.toLocaleString('en-IN')}</p></div>
                  <div><p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Return on Investment</p><p style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{analytics.roi}%</p></div>
                  <div><p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Claim Success Rate</p><p style={{ fontSize: 18, fontWeight: 700 }}>{analytics.claimSuccessRate}%</p></div>
                  <div><p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Avg Payout Speed</p><p style={{ fontSize: 18, fontWeight: 700, color: '#06b6d4' }}>3 sec</p></div>
                </div>
              </div>
            )}

            {/* Recent Claims */}
            {claims.length > 0 && (
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--zs-text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} /> Recent Claims</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {claims.slice(0, 5).map(claim => (
                    <div key={claim.claimId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--zs-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 20 }}>{claim.disruptionType === 'heavy_rainfall' ? '🌧️' : claim.disruptionType === 'extreme_heat' ? '🔥' : claim.disruptionType === 'severe_storm' ? '🌪️' : claim.disruptionType === 'strike' ? '✊' : claim.disruptionType === 'curfew' ? '🚫' : claim.disruptionType === 'hazardous_pollution' ? '😷' : claim.disruptionType === 'cyclone' ? '🌀' : '⚡'}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{claim.disruptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                          <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{new Date(claim.createdAt).toLocaleDateString('en-IN')} · {claim.lostHours}h lost</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: claim.status === 'paid' ? '#10b981' : claim.status === 'approved' ? '#6366f1' : claim.status === 'flagged' ? '#f59e0b' : '#ef4444' }}>
                          {claim.status === 'paid' || claim.status === 'approved' ? `₹${claim.payoutAmount}` : claim.status.toUpperCase()}
                        </p>
                        <span className={`badge badge-${claim.status === 'paid' ? 'success' : claim.status === 'approved' ? 'info' : claim.status === 'flagged' ? 'warning' : 'danger'}`}>{claim.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CLAIMS TAB ===== */}
        {activeTab === 'claims' && (
          <div className="zs-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>Claim History</h2>
            {claims.length === 0 ? (
              <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
                <Shield size={40} style={{ color: 'var(--zs-text-muted)', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--zs-text-secondary)' }}>No claims yet. Your coverage is active and monitoring for disruptions.</p>
              </div>
            ) : claims.map(claim => (
              <div key={claim.claimId} className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{claim.claimId}</p>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>{claim.disruptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge badge-${claim.status === 'paid' ? 'success' : claim.status === 'flagged' ? 'warning' : claim.status === 'rejected' ? 'danger' : 'info'}`}>{claim.status}</span>
                    {(claim.status === 'paid' || claim.status === 'approved') && <p style={{ fontSize: 20, fontWeight: 800, color: '#10b981', fontFamily: 'Outfit', marginTop: 4 }}>₹{claim.payoutAmount}</p>}
                  </div>
                </div>
                {/* Timeline */}
                <div style={{ borderLeft: '2px solid var(--zs-border)', paddingLeft: 16, marginLeft: 8 }}>
                  {claim.stateHistory.map((entry, i) => (
                    <div key={i} style={{ marginBottom: 10, position: 'relative' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === claim.stateHistory.length - 1 ? '#10b981' : 'var(--zs-accent)', position: 'absolute', left: -21, top: 4 }} />
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--zs-text-primary)', textTransform: 'capitalize' }}>{entry.state.replace(/_/g, ' ')}</p>
                      <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{entry.detail}</p>
                      <p style={{ fontSize: 10, color: 'var(--zs-text-muted)' }}>{new Date(entry.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: 'var(--zs-text-muted)' }}>
                  <span>📍 {claim.latitude.toFixed(4)}, {claim.longitude.toFixed(4)}</span>
                  <span>⏱️ {claim.lostHours}h lost</span>
                  <span>🛡️ Fraud score: {claim.riskScore}/100</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== PAYOUTS TAB ===== */}
        {activeTab === 'payouts' && (
          <div className="zs-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>Payout Ledger</h2>
            <div className="kpi-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><p className="kpi-label">Total Received</p><p className="kpi-value" style={{ color: '#10b981' }}>₹{payouts.reduce((s, p) => s + p.amount, 0).toLocaleString('en-IN')}</p></div>
              <div style={{ textAlign: 'right' }}><p className="kpi-label">Transactions</p><p className="kpi-value">{payouts.length}</p></div>
            </div>
            {payouts.map(payout => {
              const display = formatTransactionForDisplay(payout);
              return (
                <div key={payout.payoutId} className="glass-card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowDownRight size={18} color="#10b981" /></div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{display.amount}</p>
                      <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>{display.method} · {display.date}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge badge-${display.statusColor}`}>{display.status}</span>
                    <p style={{ fontSize: 10, color: 'var(--zs-text-muted)', marginTop: 4 }}>{payout.transactionId.substring(0, 18)}...</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== POLICY TAB ===== */}
        {activeTab === 'policy' && (
          <div className="zs-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit' }}>My Policy</h2>
            {policy ? (
              <>
                {/* Policy Card */}
                <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95)', borderRadius: 20, padding: 32, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(99,102,241,0.2)' }} />
                  <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(168,85,247,0.15)' }} />
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                      <div><p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Insurance Policy</p>
                        <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Outfit' }}>ZyroSafe {tierConfig!.label}</p></div>
                      <Shield size={36} color="rgba(255,255,255,0.3)" />
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.15em', marginBottom: 20, color: 'rgba(255,255,255,0.8)' }}>{policy.policyNumber}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                      <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>HOLDER</p><p style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</p></div>
                      <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>VALID UNTIL</p><p style={{ fontSize: 13, fontWeight: 600 }}>{new Date(policy.renewalDate).toLocaleDateString('en-IN')}</p></div>
                      <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>COVERAGE</p><p style={{ fontSize: 13, fontWeight: 600 }}>₹{policy.weeklyCap}/week</p></div>
                    </div>
                  </div>
                </div>

                {/* Policy Details */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Coverage Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      ['Plan', tierConfig!.label],
                      ['Weekly Premium', `₹${policy.weeklyPremium}`],
                      ['Plan Factor', `${policy.planFactor}x`],
                      ['Weekly Cap', `₹${policy.weeklyCap}`],
                      ['Income Replacement', `${policy.planFactor * 100}%`],
                      ['Platform', user.platform],
                      ['City', policy.city],
                      ['Status', policy.status.toUpperCase()],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--zs-border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Premium Breakdown */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>AI Premium Breakdown</h3>
                  {policy.riskFactors && Object.entries(policy.riskFactors).filter(([k]) => k !== 'finalPremium' && k !== 'basePremium').map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--zs-border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--zs-border)' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: (val as number) > 1.1 ? '#ef4444' : (val as number) < 1 ? '#10b981' : '#6366f1', width: `${Math.min(100, ((val as number) / 1.5) * 100)}%` }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{typeof val === 'number' ? val.toFixed(2) : val}×</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Final Weekly Premium</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#6366f1', fontFamily: 'Outfit' }}>₹{policy.weeklyPremium}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
                <Shield size={48} style={{ color: 'var(--zs-text-muted)', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Active Policy</h3>
                <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)' }}>Subscribe to a plan to start protecting your earnings from disruptions.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
