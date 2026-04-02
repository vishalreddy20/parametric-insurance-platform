# ZyroSafe: AI-Powered Parametric Insurance for India's Gig Workers

Guidewire DEVTrails 2026 submission project focused on protecting delivery partners from income loss caused by external disruptions.

## Problem Statement Alignment

### Persona Focus

Primary persona is food delivery partners.

Supported platforms for onboarding:

- Zomato
- Swiggy

### Golden Rules Compliance

1. Loss of income only. No health, life, accident, or vehicle repair coverage.
2. Weekly pricing model. Premiums and caps are calculated and enforced on a weekly basis.

## What This Platform Does

ZyroSafe is a parametric insurance system where claims are triggered by disruption events instead of document-heavy reimbursement workflows.

Core outcomes:

1. Onboard delivery partner with income and risk profile.
2. Generate AI-based weekly premium.
3. Monitor disruption triggers.
4. Auto-initiate claims in monitoring mode.
5. Run fraud scoring and anomaly checks.
6. Approve and simulate instant payout.
7. Provide worker and insurer dashboards with analytics.

## User Workflow

1. Partner signs up and completes onboarding.
2. Partner enters weekly income, weekly hours, city and zone.
3. Platform computes dynamic weekly premium and plan options.
4. Partner activates policy and sets UPI for payouts.
5. System detects disruptions and evaluates claims.
6. Fraud checks and weekly cap checks run automatically.
7. Approved payouts are processed instantly in mock rails.

## Weekly Financial Model

All financial logic is weekly by design.

### Premium Formula

Final premium = base premium x risk multipliers.

Where:

- Base premium = weeklyIncome x tierRate
- Tier rates: Basic 5%, Standard 7%, Premium 10%
- Multipliers: city risk, seasonality, platform risk, experience, weekly hours exposure, claim history

### Plan Tiers

1. Basic

- 80% income replacement factor
- Weekly payout cap: INR 1000

1. Standard

- 100% income replacement factor
- Weekly payout cap: INR 1000

1. Premium

- 120% income replacement factor
- Weekly payout cap: INR 1500

### Payout Formula

Payout = max(minimumFloor, hourlyIncome x lostHours x planFactor), capped by weekly limit.

- minimumFloor protects low-income workers
- hourlyIncome = weeklyIncome / weeklyHours
- lostHours comes from disruption trigger severity

## Parametric Trigger Design

### Environmental Triggers

1. Extreme heat
2. Heavy or moderate rainfall
3. Severe wind or storm conditions
4. Hazardous pollution (AQI thresholds)

### Social Triggers

1. Curfew and section 144
2. Strike or bandh
3. Protest and road closure situations
4. Market or zone shutdown events

### Traffic Triggers

1. Moderate traffic disruption
2. Severe gridlock disruption

### Platform Triggers

1. Dispatch degradation
2. Platform outage

## AI and ML Strategy

### Dynamic Risk and Premium Engine

- Profile-aware multipliers for weekly pricing
- Transparent premium breakdown during onboarding

### Predictive Risk Analytics

- Forecast-driven city risk outlook
- Expected claim and payout pressure insights

### Fraud Intelligence

Multi-layer anomaly scoring:

1. IP and GPS consistency checks
2. Velocity and impossible movement detection
3. Claim frequency spikes
4. Duplicate claim prevention
5. Behavioral payout-to-income outlier checks

Risk outcomes:

- Low risk: approve
- Medium risk: flag for review
- High risk: reject

## Idempotency and Duplicate Prevention

Claim processing now includes deterministic disruption-window locks.

- Duplicate payouts are prevented for the same user, disruption type, location bucket, and time window.
- Expired locks are purged automatically.

## Architecture Overview

### Frontend

- React + TypeScript + Vite
- Worker and admin dashboards
- Onboarding, policy, claims, payouts, analytics

### Service Layer

1. src/app/services/ai-premium-engine.ts
2. src/app/services/weather-oracle.ts
3. src/app/services/social-oracle.ts
4. src/app/services/traffic-oracle.ts
5. src/app/services/platform-oracle.ts
6. src/app/services/fraud-engine.ts
7. src/app/services/claim-processor.ts
8. src/app/services/analytics-engine.ts
9. src/app/services/mock-payment.ts
10. src/app/services/mock-db.ts

### Backend (Supabase Edge Function Path)

- supabase/functions/server/index.tsx
- supabase/functions/server/kv_store.tsx

## Security and Environment Hardening

### Frontend Required Env

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

Frontend client now fails fast if these are missing.

### Server Required Secrets

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENWEATHER_API_KEY
- NEWS_API_KEY
- ADMIN_API_KEY

Server now fails fast if required secrets are missing.

Admin endpoints require either:

- x-admin-token: ADMIN_API_KEY
- Authorization: Bearer ADMIN_API_KEY

## Must-Have Requirement Coverage

1. Optimized onboarding
2. AI risk profiling
3. Weekly policy pricing
4. Parametric claim triggers
5. Payout processing
6. Fraud detection
7. Analytics dashboards

## Testing and CI

Implemented:

- Unit tests with Vitest
- Idempotency test for duplicate claim prevention
- Premium and payout formula tests
- GitHub Actions CI workflow for test and build

Paths:

- src/app/services/__tests__/ai-premium-engine.test.ts
- src/app/services/__tests__/claim-processor.idempotency.test.ts
- .github/workflows/ci.yml

## Running the Project

### Prerequisites

- Node.js 18+
- npm

### Local Setup

1. Install dependencies.

```bash
npm install
```

1. Start dev server.

```bash
npm run dev
```

1. Run tests.

```bash
npm run test
```

1. Build for production.

```bash
npm run build
```

## Scope Guardrails

This platform intentionally excludes:

1. Health insurance
2. Accident claim coverage
3. Vehicle repair reimbursement

All payouts are tied only to verified income loss due to external disruptions.

## Submission Notes

This repository supports Phase 1 to Phase 3 development and demo workflows.

For final submission, include:

1. Public demo video links
2. Pitch deck PDF link
3. Architecture diagram export
