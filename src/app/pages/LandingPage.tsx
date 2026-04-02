import { Shield, Zap, Cloud, TrendingUp, Users, ChevronRight, CheckCircle, ArrowRight, Activity, CreditCard } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onAdminLogin: () => void;
}

export function LandingPage({ onGetStarted, onAdminLogin }: LandingPageProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--zs-bg-primary)' }}>
      {/* Navbar */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(10,14,26,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--zs-border)', padding: '12px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--zs-gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={16} color="white" /></div>
            <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Outfit' }} className="gradient-text">ZyroSafe</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onAdminLogin} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 12 }}>Admin Portal</button>
            <button onClick={onGetStarted} className="btn-primary" style={{ padding: '8px 20px', fontSize: 12 }}>Get Protected <ChevronRight size={14} /></button>
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
            <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>Guidewire DEVTrails 2026 — AI-Powered Insurance Innovation</span>
          </div>

          <h1 className="animate-fade-in-up stagger-2" style={{ fontSize: 56, fontWeight: 900, fontFamily: 'Outfit', lineHeight: 1.1, marginBottom: 20, maxWidth: 800, margin: '0 auto 20px' }}>
            Protecting India's <span className="gradient-text">Delivery Heroes</span> From Income Loss
          </h1>

          <p className="animate-fade-in-up stagger-3" style={{ fontSize: 18, color: 'var(--zs-text-secondary)', maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
            AI-powered parametric insurance that automatically compensates food delivery partners when weather, pollution, or social disruptions impact their earnings.
          </p>

          <div className="animate-fade-in-up stagger-4" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 48 }}>
            <button onClick={onGetStarted} className="btn-primary" style={{ padding: '16px 32px', fontSize: 16, borderRadius: 14 }}>Get Started — It's ₹15/week <ArrowRight size={18} /></button>
          </div>

          {/* Platform logos */}
          <div className="animate-fade-in-up stagger-5" style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'center' }}>
            {['Zomato', 'Swiggy', 'Zepto', 'Amazon', 'Dunzo'].map(p => (
              <span key={p} style={{ fontSize: 14, color: 'var(--zs-text-muted)', fontWeight: 600, opacity: 0.5 }}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section style={{ background: 'var(--zs-bg-secondary)', borderTop: '1px solid var(--zs-border)', borderBottom: '1px solid var(--zs-border)', padding: '32px 24px' }}>
        <div className="zs-grid-4" style={{ maxWidth: 1200, margin: '0 auto', gap: 32, textAlign: 'center' }}>
          {[
            { value: '12,450+', label: 'Partners Protected', icon: <Users size={20} /> },
            { value: '₹2.8Cr', label: 'Total Payouts', icon: <CreditCard size={20} /> },
            { value: '3 sec', label: 'Avg Payout Speed', icon: <Zap size={20} /> },
            { value: '99.2%', label: 'Fraud Detection Rate', icon: <Shield size={20} /> },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--zs-accent-light)' }}>{s.icon}</span>
              <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Outfit' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Outfit', textAlign: 'center', marginBottom: 12 }}>How ZyroSafe <span className="gradient-text">Works</span></h2>
          <p style={{ fontSize: 14, color: 'var(--zs-text-secondary)', textAlign: 'center', marginBottom: 48 }}>Fully automated. No manual claims. No paperwork. Just protection.</p>

          <div className="zs-grid-4" style={{ gap: 24 }}>
            {[
              { icon: '📍', title: 'Subscribe & Go', desc: 'Choose your plan, pay weekly, and continue delivering. Our AI monitors conditions 24/7.' },
              { icon: '🌧️', title: 'Disruption Detected', desc: 'Weather oracles detect rainfall >45mm, heat >45°C, storms, or our NLP engine detects strikes/curfews.' },
              { icon: '🛡️', title: 'Fraud Engine Validates', desc: 'Zero-trust AI validates your GPS, IP, device sensors, and behavioral patterns in <1 second.' },
              { icon: '💸', title: 'Instant Payout via UPI', desc: 'Your calculated income loss is transferred instantly to your UPI. No claims form. No waiting.' },
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
              { tier: 'Basic', rate: '5%', price: '₹250', factor: '80%', color: '#94a3b8', features: ['80% income replacement', 'Weather disruption coverage', 'Basic fraud protection', 'Up to ₹1,000/week payout'] },
              { tier: 'Standard', rate: '7%', price: '₹350', factor: '100%', color: '#6366f1', popular: true, features: ['100% income replacement', 'Weather + Social coverage', 'Advanced AI fraud shield', 'Up to ₹1,000/week payout', 'Priority processing'] },
              { tier: 'Premium', rate: '10%', price: '₹500', factor: '120%', color: '#a855f7', features: ['120% income replacement', 'All disruption types', 'Zero-trust fraud shield', 'Up to ₹1,500/week payout', 'Instant UPI payout', 'Predictive alerts'] },
            ].map((plan, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 20, border: plan.popular ? `2px solid ${plan.color}` : '1px solid var(--zs-border)', background: plan.popular ? `${plan.color}08` : 'var(--zs-bg-card)', position: 'relative', transition: 'all 0.3s' }}>
                {plan.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: 'white', padding: '4px 16px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>MOST POPULAR</div>}
                <h3 style={{ fontSize: 22, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.tier}</h3>
                <p style={{ fontSize: 12, color: 'var(--zs-text-muted)', marginBottom: 16 }}>{plan.rate} of weekly income</p>
                <p style={{ fontSize: 36, fontWeight: 900, fontFamily: 'Outfit', marginBottom: 4 }}>{plan.price}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--zs-text-muted)' }}>/week</span></p>
                <p style={{ fontSize: 11, color: 'var(--zs-text-muted)', marginBottom: 20 }}>for ₹5,000 weekly income</p>
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
              { emoji: '🌧️', title: 'Heavy Rainfall', desc: 'Triggered when 24h accumulation exceeds 45mm. Automatic payout for 3-5 lost hours.', threshold: '>45mm/day' },
              { emoji: '🔥', title: 'Extreme Heat', desc: 'Triggered when ambient temperature exceeds 45°C. Prevents heat stroke risks.', threshold: '>45°C' },
              { emoji: '🌪️', title: 'Severe Storms', desc: 'Wind speed exceeding 60km/h makes two-wheeled transit unsafe. Full coverage activated.', threshold: '>60km/h' },
              { emoji: '😷', title: 'Hazardous AQI', desc: 'Air Quality Index above 300 is dangerous for prolonged outdoor exposure.', threshold: 'AQI >300' },
              { emoji: '✊', title: 'Strikes & Bandhs', desc: 'NLP-powered news monitoring detects confirmed strikes, hartals, and shutdowns.', threshold: 'AI Detection' },
              { emoji: '🚫', title: 'Curfew / Section 144', desc: 'Government-imposed movement restrictions automatically verified and compensated.', threshold: 'Govt Order' },
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
          <p style={{ fontSize: 16, color: 'var(--zs-text-secondary)', marginBottom: 32 }}>Join thousands of delivery partners who never worry about weather disruptions again.</p>
          <button onClick={onGetStarted} className="btn-primary animate-pulse-glow" style={{ padding: '18px 40px', fontSize: 16, borderRadius: 14 }}>
            <Shield size={20} /> Get Protected Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--zs-border)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--zs-text-muted)' }}>© 2026 ZyroSafe — Built for Guidewire DEVTrails 2026 · AI-Powered Parametric Insurance for India's Gig Economy</p>
      </footer>
    </div>
  );
}
