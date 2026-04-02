# ZyroSafe - Deployment & Configuration Guide

## System Overview

ZyroSafe is a parametric insurance platform for gig economy delivery partners, providing automated income protection against:
- **Weather Disruptions**: Heavy rainfall (>45mm/day), extreme heat (>45°C), cyclones
- **Social Disruptions**: Curfews, strikes (bandhs), civil unrest, zone closures

## Architecture

**Frontend**: React + Tailwind CSS (Mobile-first responsive design)
**Backend**: Supabase Edge Functions with Hono web server
**Database**: Supabase KV Store (key-value database)
**External APIs**:
- OpenWeather API (weather data)
- News API (social disruption detection)
- Razorpay (payment processing - configured but not fully integrated)

## Deployment Steps

### 1. Supabase Connection

The backend code has been created in `supabase/functions/server/index.tsx`. To deploy:

1. **In Figma Make settings**: Ensure your Supabase project is connected
2. **Deploy the Edge Function**: Go to Make settings → Deploy Supabase function
3. **Verify deployment**: The function will be available at:
   ```
   https://{project-id}.supabase.co/functions/v1/make-server-0a99cdba/*
   ```

### 2. API Keys Configuration

The following secrets have already been added (as confirmed):
- ✅ `OPENWEATHER_API_KEY` - Weather data oracle
- ✅ `NEWS_API_KEY` - Social disruption detection
- ✅ `ADMIN_API_KEY` - Admin endpoint authentication token
- ✅ `RAZORPAY_WEBHOOK_SECRET` - Required for webhook signature verification and replay protection
- ✅ `RAZORPAY_KEY_ID` - Payment integration
- ✅ `RAZORPAY_KEY_SECRET` - Payment integration
- ✅ `SUPABASE_ANON_KEY` - Auto-configured
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured

### 3. Frontend Configuration

Set environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The frontend client fails fast at runtime if these are missing.

## System Features

### Delivery Partner Dashboard
- **Authentication**: Signup/Login with email and password
- **Profile Management**: Weekly income, working hours, location data
- **Subscription Tiers**:
  - **Basic**: 5% weekly income → 80% payout factor
  - **Standard**: 7% weekly income → 100% payout factor (recommended)
  - **Premium**: 10% weekly income → 120% payout factor
- **Disruption Checking**: Real-time location-based disruption detection
- **Payout History**: Transparent ledger of all claims and payouts

### Admin Dashboard
- **System Statistics**: Total users, active subscriptions, payout metrics, pool balance
- **User Management**: Complete user list with subscription status and risk scores
- **Fraud Detection**: Flagged claims requiring manual review (risk score 30-70)
- **Data Visualization**: Subscription distribution, risk score analysis

## Backend API Endpoints

All endpoints are prefixed with `/make-server-0a99cdba/`

### Public Endpoints
- `GET /health` - Health check
- `POST /signup` - Create new user account
- `POST /webhook/razorpay` - Payment webhook handler

### Authenticated Endpoints (require Bearer token)
- `POST /subscribe` - Subscribe to a plan (basic/standard/premium)
- `POST /check-disruption` - Submit location for disruption verification
- `GET /profile` - Get user profile and recent payouts

### Admin Endpoints (require admin auth)
- `GET /admin/users` - List all users
- `GET /admin/flagged` - List flagged claims
- `GET /admin/stats` - System-wide statistics

Authentication options:
- `x-admin-token: <ADMIN_API_KEY>` header, or
- `Authorization: Bearer <ADMIN_API_KEY>` header

## Actuarial Model

### Payout Calculation Formula
```
Payout = max(MinimumPayout, HourlyIncome × LostHours × PlanFactor)

Where:
- MinimumPayout = max(₹50, WeeklyIncome × 0.01)
- HourlyIncome = WeeklyIncome / WeeklyHours
- LostHours = Estimated duration of disruption (from oracle)
- PlanFactor = 0.8 (Basic), 1.0 (Standard), 1.2 (Premium)
```

### Weekly Payout Caps
- Basic/Standard: ₹1,000 per week
- Premium: ₹1,500 per week

## Fraud Detection System

### Multi-Layer Security
1. **IP Geolocation Validation**: Compares GPS coordinates with IP-derived location
2. **Velocity Analysis**: Detects impossible movement speeds (teleportation)
3. **Claim Frequency Monitoring**: Flags excessive claim patterns
4. **Risk Scoring Algorithm** (0-100 scale):
   - **0-30 (Low Risk)**: Auto-approved
   - **30-70 (Medium Risk)**: Flagged for manual review
   - **70-100 (High Risk)**: Auto-rejected

### Risk Score Factors
- IP validation failure: +30 points
- High travel velocity (>100 km/h): +25 points
- Frequent claims (>5/week): +20 points
- Suspicious device patterns: +25 points

## Weather Oracle Thresholds

### Rainfall
- **Moderate Disruption**: 45-60mm/day → 3 lost hours
- **Severe Disruption**: >60mm/day → 5 lost hours

### Extreme Heat
- **Severe Disruption**: >45°C → 4 lost hours

### Cyclones/Storms
- **Severe Disruption**: Based on official alerts → 6 lost hours

## Social Disruption Detection

### NLP Keyword Analysis
Monitors news sources for:
- "curfew", "section 144" → High confidence (35 points)
- "strike", "bandh" → Medium confidence (25 points)
- "riot", "protest" → Lower confidence (20 points)

### Confidence Threshold
- **50+ points**: Confirmed disruption → 8 lost hours
- **<50 points**: No payout triggered

## Testing the System

### Test User Signup
```javascript
// Example signup data
{
  "email": "test.rider@example.com",
  "password": "secure123",
  "name": "Test Rider",
  "phone": "+919876543210",
  "weeklyIncome": 5000,
  "weeklyHours": 50,
  "city": "Hyderabad",
  "state": "Telangana"
}
```

### Test Disruption Check
```javascript
// Hyderabad coordinates (demo location)
{
  "latitude": 17.385044,
  "longitude": 78.486671,
  "timestamp": Date.now()
}
```

## Known Limitations & Production Notes

### ⚠️ Important Disclaimers
1. **PII Warning**: Figma Make is NOT intended for collecting sensitive personal information or real financial data
2. **Payment Integration**: Razorpay endpoints are implemented but require full production setup
3. **Email Confirmation**: Email verification is disabled (auto-confirmed) as email server is not configured
4. **Mock Location**: Frontend uses demo Hyderabad coordinates if geolocation is unavailable

### Production Deployment Requirements
For real-world deployment, you'll need:
1. **Dedicated FastAPI backend** (as per original blueprint) on AWS/Render/Vercel
2. **Production Razorpay account** with webhook configuration
3. **Email service** (SendGrid/AWS SES) for user notifications
4. **PostgreSQL database** with proper schema migrations
5. **Redis** for caching and rate limiting
6. **Monitoring** (Sentry, DataDog) for production observability

## Support & Maintenance

### Database Management
All data is stored in the `kv_store_0a99cdba` table with prefixed keys:
- `user:{userId}` - User profiles
- `payout:{userId}:{timestamp}` - Payout records
- `flagged:{userId}:{timestamp}` - Flagged claims
- `location:{userId}` - Last known location (for velocity checks)

### Monitoring Recommendations
- Track weekly pool balance vs. payout obligations
- Monitor fraud detection false positive rates
- Analyze weather oracle accuracy vs. actual disruptions
- Review user churn after claim rejections

## License & Compliance

This prototype demonstrates parametric insurance concepts. For production use:
- Obtain insurance regulatory approvals (IRDAI in India)
- Implement proper KYC/AML procedures
- Ensure GDPR/data protection compliance
- Set up proper financial audit trails

---

**Built with ZyroSafe - Protecting Platform Workers Through Automated Parametric Insurance**
