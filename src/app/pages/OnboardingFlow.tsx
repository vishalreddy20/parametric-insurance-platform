import { useState } from 'react';
import { Shield, ChevronRight, ChevronLeft, Check, MapPin, Clock, Bike, CreditCard, Zap, Star } from 'lucide-react';
import { Users, Policies, generateId } from '../services/mock-db';
import type { UserProfile, Policy } from '../services/mock-db';
import { calculateDynamicPremium, TIER_CONFIG, assessCityRisk } from '../services/ai-premium-engine';
import { createSubscription, createPaymentCheckout } from '../services/mock-payment';
import { ACTIVE_PERSONA, PERSONA_LABELS, PERSONA_PLATFORMS } from '../config/persona';

interface OnboardingFlowProps {
  userId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
  onComplete: (userId: string, token: string) => void;
}

const PLATFORMS = PERSONA_PLATFORMS[ACTIVE_PERSONA];

const CITIES = ['Mumbai', 'Delhi', 'Hyderabad', 'Bangalore', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const VEHICLES = [
  { id: 'bicycle', label: 'Bicycle', emoji: '🚲' },
  { id: 'scooter', label: 'Scooter', emoji: '🛵' },
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { id: 'car', label: 'Car', emoji: '🚗' },
];

export function OnboardingFlow({ userId, userEmail, userName, userPhone, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zone, setZone] = useState('');
  const [weeklyIncome, setWeeklyIncome] = useState('');
  const [weeklyHours, setWeeklyHours] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [yearsExp, setYearsExp] = useState('1');
  const [selectedTier, setSelectedTier] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [upiId, setUpiId] = useState('');
  const [processing, setProcessing] = useState(false);

  const totalSteps = 5;

  const profileData = {
    platform: platform as any,
    city,
    state,
    zone,
    weeklyIncome: parseFloat(weeklyIncome) || 5000,
    weeklyHours: parseFloat(weeklyHours) || 50,
    yearsExperience: parseInt(yearsExp) || 1,
    claimCount: 0,
  };

  const premiumBreakdown = calculateDynamicPremium(profileData, selectedTier);
  const cityRisk = city ? assessCityRisk(city) : null;

  const handleFinish = async () => {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1500));

    const policyId = `ZS-POL-${generateId()}`;
    const policyNumber = `ZS-${city.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Create user profile
    const profile: UserProfile = {
      userId, email: userEmail, name: userName, phone: userPhone,
      platform: platform as any, vehicleType: vehicleType as any,
      city, state, zone,
      weeklyIncome: parseFloat(weeklyIncome) || 5000,
      weeklyHours: parseFloat(weeklyHours) || 50,
      yearsExperience: parseInt(yearsExp) || 1,
      subscriptionTier: selectedTier,
      subscriptionStatus: 'active',
      policyId,
      weeklyPremium: premiumBreakdown.finalPremium,
      subscriptionStartDate: new Date().toISOString(),
      totalPayouts: 0, claimCount: 0, weeklyClaimCount: 0,
      riskScore: 0,
      createdAt: new Date().toISOString(),
      lastClaimDate: null,
      onboardingComplete: true,
    };
    Users.set(userId, profile);

    // Create policy
    const tierConfig = TIER_CONFIG[selectedTier];
    const policy: Policy = {
      policyId, userId, policyNumber,
      tier: selectedTier, status: 'active',
      weeklyPremium: premiumBreakdown.finalPremium,
      coverageAmount: profile.weeklyIncome,
      weeklyCap: tierConfig.weeklyCap,
      planFactor: tierConfig.planFactor,
      startDate: new Date().toISOString(),
      renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      city, platform,
      riskFactors: premiumBreakdown,
      createdAt: new Date().toISOString(),
    };
    Policies.set(policyId, policy);

    // Simulate payment
    createSubscription(userId, selectedTier, premiumBreakdown.finalPremium, 'upi', upiId || 'user@paytm');

    onComplete(userId, `mock_token_${userId}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--zs-bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--zs-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={16} color="white" /></div>
          <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Outfit' }} className="gradient-text">ZyroSafe</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>Step {step} of {totalSteps}</span>
      </header>

      {/* Progress */}
      <div style={{ padding: '0 24px' }}>
        <div style={{ height: 3, background: 'var(--zs-border)', borderRadius: 2, marginTop: 12 }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--zs-gradient-brand)', width: `${(step / totalSteps) * 100}%`, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Content */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560 }} className="animate-fade-in">

          {/* STEP 1: Platform Selection */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 8 }}>Which platform do you deliver for?</h2>
              <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginBottom: 8 }}>We'll customize your coverage based on your delivery platform.</p>
              <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginBottom: 24 }}>Active persona: {PERSONA_LABELS[ACTIVE_PERSONA]}</p>
              <div className="zs-grid-3" style={{ gap: 12 }}>
                {PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    style={{ padding: '24px 16px', borderRadius: 16, border: platform === p.id ? `2px solid ${p.color}` : '1px solid var(--zs-border)', background: platform === p.id ? `${p.color}15` : 'var(--zs-bg-glass)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                    <span style={{ fontSize: 32 }}>{p.emoji}</span>
                    <p style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: platform === p.id ? p.color : 'var(--zs-text-primary)' }}>{p.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Location */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 8 }}>Where do you operate?</h2>
              <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginBottom: 24 }}>Your city's risk profile affects your premium pricing.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="zs-label">City *</label>
                  <select className="zs-select" value={city} onChange={e => setCity(e.target.value)}>
                    <option value="">Select your city</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {cityRisk && (
                  <div style={{ padding: 16, borderRadius: 12, background: `rgba(${cityRisk.level === 'critical' ? '239,68,68' : cityRisk.level === 'high' ? '245,158,11' : '16,185,129'},0.08)`, border: `1px solid rgba(${cityRisk.level === 'critical' ? '239,68,68' : cityRisk.level === 'high' ? '245,158,11' : '16,185,129'},0.15)` }}>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📍 {city} — <span style={{ color: cityRisk.level === 'critical' ? '#ef4444' : cityRisk.level === 'high' ? '#f59e0b' : '#10b981' }}>{cityRisk.level.toUpperCase()} RISK</span></p>
                    {cityRisk.factors.map((f, i) => <p key={i} style={{ fontSize: 11, color: 'var(--zs-text-secondary)', paddingLeft: 12 }}>• {f}</p>)}
                  </div>
                )}
                <div>
                  <label className="zs-label">State *</label>
                  <input className="zs-input" placeholder="e.g. Maharashtra" value={state} onChange={e => setState(e.target.value)} />
                </div>
                <div>
                  <label className="zs-label">Delivery Zone / Area</label>
                  <input className="zs-input" placeholder="e.g. Banjara Hills, Andheri West" value={zone} onChange={e => setZone(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Work Profile */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 8 }}>Tell us about your work</h2>
              <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginBottom: 24 }}>This helps us calculate your exact income protection amount.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="zs-label">Average Weekly Income (₹) *</label>
                  <input className="zs-input" type="number" placeholder="e.g. 5000" value={weeklyIncome} onChange={e => setWeeklyIncome(e.target.value)} />
                  {weeklyIncome && <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginTop: 4 }}>≈ ₹{Math.round(parseFloat(weeklyIncome) * 4.33).toLocaleString('en-IN')}/month</p>}
                </div>
                <div>
                  <label className="zs-label">Weekly Working Hours *</label>
                  <input className="zs-input" type="number" placeholder="e.g. 50" value={weeklyHours} onChange={e => setWeeklyHours(e.target.value)} />
                  {weeklyIncome && weeklyHours && <p style={{ fontSize: 11, color: 'var(--zs-accent-light)', marginTop: 4 }}>Your hourly rate: ₹{Math.round(parseFloat(weeklyIncome) / parseFloat(weeklyHours))}/hr</p>}
                </div>
                <div>
                  <label className="zs-label">Vehicle Type</label>
                  <div className="zs-grid-4" style={{ gap: 8 }}>
                    {VEHICLES.map(v => (
                      <button key={v.id} onClick={() => setVehicleType(v.id)}
                        style={{ padding: '16px 8px', borderRadius: 12, border: vehicleType === v.id ? '2px solid var(--zs-accent)' : '1px solid var(--zs-border)', background: vehicleType === v.id ? 'rgba(99,102,241,0.1)' : 'var(--zs-bg-glass)', cursor: 'pointer', textAlign: 'center' }}>
                        <span style={{ fontSize: 24 }}>{v.emoji}</span>
                        <p style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: vehicleType === v.id ? 'var(--zs-accent-light)' : 'var(--zs-text-secondary)' }}>{v.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="zs-label">Years of Experience</label>
                  <select className="zs-select" value={yearsExp} onChange={e => setYearsExp(e.target.value)}>
                    {[1,2,3,4,5,6,7,8,9,10].map(y => <option key={y} value={y}>{y} {y === 1 ? 'year' : 'years'}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Plan Selection */}
          {step === 4 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 8 }}>Choose Your Protection Plan</h2>
              <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginBottom: 24 }}>AI-calculated premium based on your risk profile.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(['basic', 'standard', 'premium'] as const).map(tier => {
                  const config = TIER_CONFIG[tier];
                  const premium = calculateDynamicPremium(profileData, tier);
                  return (
                    <button key={tier} onClick={() => setSelectedTier(tier)}
                      style={{ padding: 20, borderRadius: 16, border: selectedTier === tier ? `2px solid ${config.color}` : '1px solid var(--zs-border)', background: selectedTier === tier ? `${config.color}12` : 'var(--zs-bg-glass)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', position: 'relative' }}>
                      {tier === 'standard' && <span style={{ position: 'absolute', top: -8, right: 16, background: 'var(--zs-accent)', color: 'white', padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>POPULAR</span>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: 18, fontWeight: 700, color: config.color }}>{config.label}</p>
                          <p style={{ fontSize: 12, color: 'var(--zs-text-secondary)', marginTop: 2 }}>{config.description}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', color: config.color }}>₹{premium.finalPremium}</p>
                          <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>per week</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                        {config.features.slice(0, 3).map((f, i) => (
                          <span key={i} style={{ fontSize: 10, padding: '3px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, color: 'var(--zs-text-secondary)' }}>{f}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Premium Breakdown */}
              <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.1)' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--zs-accent-light)', marginBottom: 8 }}>🤖 AI Premium Breakdown</p>
                {Object.entries(premiumBreakdown).filter(([k]) => k !== 'finalPremium' && k !== 'basePremium').map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                    <span style={{ color: 'var(--zs-text-muted)' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                    <span style={{ fontWeight: 600, color: (val as number) > 1.1 ? '#f59e0b' : (val as number) < 1 ? '#10b981' : 'var(--zs-text-primary)' }}>{(val as number).toFixed(2)}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: Payment */}
          {step === 5 && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 8 }}>Activate Your Coverage</h2>
              <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', marginBottom: 24 }}>Set up weekly auto-debit to start your protection immediately.</p>
              
              <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Selected Plan</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: TIER_CONFIG[selectedTier].color }}>{TIER_CONFIG[selectedTier].label}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: 'var(--zs-text-muted)' }}>Weekly Premium</p>
                    <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit' }}>₹{premiumBreakdown.finalPremium}</p>
                  </div>
                </div>
                <div className="zs-divider" />
                <div className="zs-grid-2" style={{ gap: 8, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--zs-text-muted)' }}>Coverage</span><br/><span style={{ fontWeight: 600 }}>{TIER_CONFIG[selectedTier].planFactor * 100}% income</span></div>
                  <div><span style={{ color: 'var(--zs-text-muted)' }}>Weekly Cap</span><br/><span style={{ fontWeight: 600 }}>₹{TIER_CONFIG[selectedTier].weeklyCap}</span></div>
                  <div><span style={{ color: 'var(--zs-text-muted)' }}>Platform</span><br/><span style={{ fontWeight: 600 }}>{(platform || 'N/A').charAt(0).toUpperCase() + platform.slice(1)}</span></div>
                  <div><span style={{ color: 'var(--zs-text-muted)' }}>City</span><br/><span style={{ fontWeight: 600 }}>{city || 'N/A'}</span></div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="zs-label">UPI ID (for payouts)</label>
                <input className="zs-input" placeholder="yourname@paytm" value={upiId} onChange={e => setUpiId(e.target.value)} />
                <p style={{ fontSize: 10, color: 'var(--zs-text-muted)', marginTop: 4 }}>Payouts will be sent instantly to this UPI address</p>
              </div>

              <button onClick={handleFinish} disabled={processing} className="btn-primary" style={{ width: '100%', padding: '16px 0', fontSize: 15 }}>
                {processing ? (<><RefreshCw size={16} className="animate-spin-slow" /> Activating...</>) : (<><CreditCard size={16} /> Pay ₹{premiumBreakdown.finalPremium} & Activate</>)}
              </button>
              <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--zs-text-muted)', marginTop: 8 }}>🔒 Secured by Razorpay · Auto-renewed weekly</p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
            ) : <div />}
            {step < totalSteps && (
              <button onClick={() => setStep(s => s + 1)} className="btn-primary"
                disabled={(step === 1 && !platform) || (step === 2 && !city) || (step === 3 && (!weeklyIncome || !weeklyHours))}>
                Continue <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function RefreshCw({ size, className }: { size: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
