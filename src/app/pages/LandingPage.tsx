import { Shield, Zap, ChevronRight, CheckCircle, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  demo: boolean;
  onGetStarted: () => void;
}

export function LandingPage({ demo, onGetStarted }: LandingPageProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--zs-bg-primary)' }}>
      {/* Navbar */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(10,14,26,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--zs-border)', padding: '12px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={16} color="white" /></div>
            <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Outfit' }} className="gradient-text">ParaShield</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onGetStarted} className="btn-primary" style={{ padding: '8px 20px', fontSize: 12 }}>Sign in <ChevronRight size={14} /></button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 120, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '30%', left: '5%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(99,102,241,0.06)', filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', top: '10%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(168,85,247,0.05)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '30%', width: 350, height: 350, borderRadius: '50%', background: 'rgba(6,182,212,0.04)', filter: 'blur(90px)' }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
          <div className="animate-fade-in-up stagger-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 24 }}>
            <Zap size={14} color="#818cf8" />
            <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>{demo ? 'SIMULATED DEMO · LOCAL DATA' : 'SIMULATED DEMO · DRUNIX LEDGER'}</span>
          </div>

          <h1 className="animate-fade-in-up stagger-2" style={{ fontSize: "clamp(2.4rem, 7vw, 3.5rem)", fontWeight: 900, fontFamily: 'Outfit', lineHeight: 1.1, marginBottom: 20, maxWidth: 800, margin: '0 auto 20px' }}>
            Protecting India's <span className="gradient-text">Delivery Heroes</span> From Income Loss
          </h1>

          <p className="animate-fade-in-up stagger-3" style={{ fontSize: 18, color: 'var(--zs-text-secondary)', maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Parametric income protection for Zomato and Swiggy delivery partners. {demo ? 'Explore simulated policy and payout fixtures.' : 'The demo records coverage, event quorum and payout decisions on DRUNIX.'}
          </p>

          <div className="animate-fade-in-up stagger-4" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 48 }}>
            <button onClick={onGetStarted} className="btn-primary" style={{ padding: '16px 32px', fontSize: 16, borderRadius: 14 }}>Open the demo <ArrowRight size={18} /></button>
          </div>

          {/* Platform logos */}
          <div className="animate-fade-in-up stagger-5" style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'center' }}>
            {['Zomato', 'Swiggy'].map(p => (
              <span key={p} style={{ fontSize: 14, color: 'var(--zs-text-muted)', fontWeight: 600, opacity: 0.5 }}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Outfit', textAlign: 'center', marginBottom: 12 }}>How ParaShield <span className="gradient-text">Works</span></h2>
          <p style={{ fontSize: 14, color: 'var(--zs-text-secondary)', textAlign: 'center', marginBottom: 48 }}>{demo ? 'Browse simulated coverage and payout records.' : 'Coverage, signed readings and settlement are tracked on the ledger.'}</p>

          <div className="zs-grid-4" style={{ gap: 24 }}>
            {[
              { icon: '📍', title: 'Subscribe & Go', desc: 'Choose weekly coverage and confirm the premium through simulated UPI.' },
              { icon: '🌧️', title: 'Disruption Detected', desc: 'Simulated weather, social, traffic and platform readings are signed by distinct oracle identities.' },
              { icon: '🛡️', title: 'Check eligibility', desc: 'The ledger checks coverage, platform activity, overlapping events and the weekly cap.' },
              { icon: '💸', title: 'Track simulated payout', desc: 'Follow the ledger from reservation to a simulated settlement or failure.' },
            ].map((step, i) => (
              <div key={i} className="glass-card" style={{ padding: 28, textAlign: 'center', position: 'relative' }}>
                {i < 3 && <div style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', color: 'var(--zs-text-muted)', fontSize: 20, zIndex: 5 }}>→</div>}
                <span style={{ fontSize: 40 }}>{step.icon}</span>
                <p style={{ fontSize: 11, color: 'var(--zs-accent-light)', fontWeight: 700, margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step {i + 1}</p>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '80px 24px', background: 'var(--zs-bg-secondary)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Outfit', textAlign: 'center', marginBottom: 48 }}>Simple, <span className="gradient-text">Fair Pricing</span></h2>
          <div className="zs-grid-3" style={{ gap: 20, maxWidth: 900, margin: '0 auto' }}>
            {[
              { tier: 'Basic', rate: '5%', price: '₹250', factor: '80%', color: '#94a3b8', features: ['80% income replacement', 'Parametric disruption coverage', 'Weekly cap enforced on the ledger', 'Up to ₹1,000/week payout'] },
              { tier: 'Standard', rate: '7%', price: '₹350', factor: '100%', color: '#6366f1', popular: true, features: ['100% income replacement', 'Parametric disruption coverage', 'Activity requirement', 'Up to ₹1,000/week payout', 'Ledger payout status'] },
              { tier: 'Premium', rate: '10%', price: '₹500', factor: '120%', color: '#a855f7', features: ['120% income replacement', 'All disruption types', 'Activity requirement', 'Up to ₹1,500/week payout', 'Simulated UPI settlement', 'Ledger payout status'] },
            ].map((plan, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 20, border: plan.popular ? `2px solid ${plan.color}` : '1px solid var(--zs-border)', background: plan.popular ? `${plan.color}08` : 'var(--zs-bg-card)', position: 'relative', transition: 'all 0.3s' }}>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.tier}</h3>
                <p style={{ fontSize: 12, color: 'var(--zs-text-muted)', marginBottom: 16 }}>{plan.rate} base rate</p>
                <p style={{ fontSize: 36, fontWeight: 900, fontFamily: 'Outfit', marginBottom: 4 }}>{plan.price}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--zs-text-muted)' }}>/week</span></p>
                <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginBottom: 20 }}>Base premium illustration at ₹5,000 weekly income</p>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {plan.features.map((f, fi) => (
                    <li key={fi} style={{ fontSize: 13, color: 'var(--zs-text-secondary)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={14} color={plan.color} />{f}
                    </li>
                  ))}
                </ul>
                <button onClick={onGetStarted} className="btn-primary" style={{ width: '100%', marginTop: 20, background: plan.popular ? `linear-gradient(135deg, ${plan.color}, ${plan.color}dd)` : undefined }}>
                  Get Started <ChevronRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disruption Types */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Outfit', textAlign: 'center', marginBottom: 48 }}>What We <span className="gradient-text">Protect Against</span></h2>
          <div className="zs-grid-3" style={{ gap: 16 }}>
            {[
              { emoji: '🌧️', title: 'Heavy Rainfall', desc: 'Separate moderate and heavy daily rainfall thresholds feed the oracle quorum.', threshold: '≥45 mm/day' },
              { emoji: '🔥', title: 'Extreme Heat', desc: 'Oracle readings can declare an extreme heat event.', threshold: '≥45°C' },
              { emoji: '🌪️', title: 'Severe Storms', desc: 'Simulated wind readings can declare a severe storm.', threshold: '≥60 km/h' },
              { emoji: '😷', title: 'Hazardous AQI', desc: 'Air quality readings contribute to quorum at the configured AQI threshold.', threshold: 'AQI ≥300' },
              { emoji: '✊', title: 'Strikes & Bandhs', desc: 'Synthetic social signals represent strikes and shutdowns in the demo.', threshold: 'Simulated reports' },
              { emoji: '🚫', title: 'Curfew / Section 144', desc: 'Synthetic social signals represent restrictions in the demo.', threshold: 'Simulated reports' },
            ].map((d, i) => (
              <div key={i} className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <span style={{ fontSize: 36 }}>{d.emoji}</span>
                  <span className="badge badge-info">{d.threshold}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--zs-text-secondary)', lineHeight: 1.5 }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.05), transparent)' }} />
        <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Outfit', marginBottom: 16 }}>Start Protecting Your <span className="gradient-text">Earnings Today</span></h2>
          <p style={{ fontSize: 16, color: 'var(--zs-text-secondary)', marginBottom: 32 }}>Explore the worker, insurer and regulator views with a simulated identity.</p>
          <button onClick={onGetStarted} className="btn-primary animate-pulse-glow" style={{ padding: '18px 40px', fontSize: 16, borderRadius: 14 }}>
            <Shield size={20} /> Open the demo
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--zs-border)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>© 2026 ParaShield — Built for Guidewire DEVTrails 2026 · Parametric income protection for delivery partners</p>
      </footer>
    </div>
  );
}
