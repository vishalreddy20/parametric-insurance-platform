/**
 * ZyroSafe Mock Database — localStorage-based KV store
 * Simulates MongoDB collections with typed operations
 */

const DB_PREFIX = 'zyrosafe_';

// ============= Core Operations =============

export function dbSet(key: string, value: any): void {
  localStorage.setItem(`${DB_PREFIX}${key}`, JSON.stringify(value));
}

export function dbGet<T = any>(key: string): T | null {
  const raw = localStorage.getItem(`${DB_PREFIX}${key}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function dbDelete(key: string): void {
  localStorage.removeItem(`${DB_PREFIX}${key}`);
}

export function dbGetByPrefix<T = any>(prefix: string): T[] {
  const results: T[] = [];
  const fullPrefix = `${DB_PREFIX}${prefix}`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(fullPrefix)) {
      const raw = localStorage.getItem(key);
      if (raw) { try { results.push(JSON.parse(raw)); } catch {} }
    }
  }
  return results;
}

export function dbQuery<T = any>(prefix: string, filter: (item: T) => boolean): T[] {
  return dbGetByPrefix<T>(prefix).filter(filter);
}

export function generateId(prefix: string = ''): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${ts}${rand}` : `${ts}${rand}`;
}

// ============= Type Definitions =============

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  phone: string;
  platform: 'zomato' | 'swiggy' | 'zepto' | 'amazon' | 'dunzo' | 'other';
  vehicleType: 'bicycle' | 'scooter' | 'motorcycle' | 'car';
  city: string;
  state: string;
  zone: string;
  weeklyIncome: number;
  weeklyHours: number;
  yearsExperience: number;
  subscriptionTier: 'none' | 'basic' | 'standard' | 'premium';
  subscriptionStatus: 'inactive' | 'active' | 'expired';
  policyId: string | null;
  weeklyPremium: number;
  subscriptionStartDate: string | null;
  totalPayouts: number;
  claimCount: number;
  weeklyClaimCount: number;
  riskScore: number;
  createdAt: string;
  lastClaimDate: string | null;
  onboardingComplete: boolean;
}

export interface Policy {
  policyId: string;
  userId: string;
  policyNumber: string;
  tier: 'basic' | 'standard' | 'premium';
  status: 'active' | 'expired' | 'cancelled';
  weeklyPremium: number;
  coverageAmount: number;
  weeklyCap: number;
  planFactor: number;
  startDate: string;
  renewalDate: string;
  city: string;
  platform: string;
  riskFactors: PremiumBreakdown;
  createdAt: string;
}

export interface PremiumBreakdown {
  basePremium: number;
  cityRiskMultiplier: number;
  seasonalMultiplier: number;
  platformMultiplier: number;
  experienceDiscount: number;
  hoursMultiplier: number;
  claimHistoryMultiplier: number;
  finalPremium: number;
}

export interface Claim {
  claimId: string;
  userId: string;
  policyId: string;
  status: 'submitted' | 'evaluating' | 'fraud_check' | 'calculating' | 'approved' | 'rejected' | 'flagged' | 'paid';
  disruptionType: string;
  disruptionSeverity: 'moderate' | 'severe';
  latitude: number;
  longitude: number;
  lostHours: number;
  payoutAmount: number;
  riskScore: number;
  fraudFactors: FraudBreakdown;
  weatherData: any;
  socialData: any;
  stateHistory: ClaimStateEntry[];
  createdAt: string;
  resolvedAt: string | null;
}

export interface FraudBreakdown {
  ipValidation: { score: number; detail: string };
  velocityCheck: { score: number; detail: string };
  frequencyCheck: { score: number; detail: string };
  duplicateCheck: { score: number; detail: string };
  patternCheck: { score: number; detail: string };
  totalScore: number;
}

export interface ClaimStateEntry {
  state: string;
  timestamp: string;
  detail: string;
}

export interface Payout {
  payoutId: string;
  transactionId: string;
  claimId: string;
  userId: string;
  amount: number;
  method: 'upi' | 'bank_transfer';
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  razorpayId: string;
  idempotencyKey: string;
  createdAt: string;
  completedAt: string | null;
}

export interface FlaggedClaim {
  claimId: string;
  userId: string;
  riskScore: number;
  fraudFactors: FraudBreakdown;
  claim: Claim;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface ClaimLock {
  lockKey: string;
  userId: string;
  disruptionType: string;
  windowStart: string;
  expiresAt: string;
  createdAt: string;
  source: 'manual' | 'auto';
}

// ============= Collection Operations =============

export const Users = {
  get: (userId: string) => dbGet<UserProfile>(`user:${userId}`),
  set: (userId: string, profile: UserProfile) => dbSet(`user:${userId}`, profile),
  getAll: () => dbGetByPrefix<UserProfile>('user:'),
  getActive: () => dbQuery<UserProfile>('user:', u => u.subscriptionStatus === 'active'),
};

export const Policies = {
  get: (policyId: string) => dbGet<Policy>(`policy:${policyId}`),
  set: (policyId: string, policy: Policy) => dbSet(`policy:${policyId}`, policy),
  getByUser: (userId: string) => dbQuery<Policy>('policy:', p => p.userId === userId),
  getAll: () => dbGetByPrefix<Policy>('policy:'),
  getActive: () => dbQuery<Policy>('policy:', p => p.status === 'active'),
};

export const Claims = {
  get: (claimId: string) => dbGet<Claim>(`claim:${claimId}`),
  set: (claimId: string, claim: Claim) => dbSet(`claim:${claimId}`, claim),
  getByUser: (userId: string) => dbQuery<Claim>('claim:', c => c.userId === userId),
  getAll: () => dbGetByPrefix<Claim>('claim:'),
  getRecent: (n: number = 10) => {
    const all = dbGetByPrefix<Claim>('claim:');
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, n);
  },
};

export const Payouts = {
  get: (payoutId: string) => dbGet<Payout>(`payout:${payoutId}`),
  set: (payoutId: string, payout: Payout) => dbSet(`payout:${payoutId}`, payout),
  getByUser: (userId: string) => dbQuery<Payout>('payout:', p => p.userId === userId),
  getAll: () => dbGetByPrefix<Payout>('payout:'),
};

export const Flagged = {
  get: (claimId: string) => dbGet<FlaggedClaim>(`flagged:${claimId}`),
  set: (claimId: string, flagged: FlaggedClaim) => dbSet(`flagged:${claimId}`, flagged),
  getAll: () => dbGetByPrefix<FlaggedClaim>('flagged:'),
  getPending: () => dbQuery<FlaggedClaim>('flagged:', f => f.reviewStatus === 'pending'),
};

export const ClaimLocks = {
  get: (lockKey: string) => dbGet<ClaimLock>(`claim_lock:${lockKey}`),
  set: (lock: ClaimLock) => dbSet(`claim_lock:${lock.lockKey}`, lock),
  delete: (lockKey: string) => dbDelete(`claim_lock:${lockKey}`),
  getAll: () => dbGetByPrefix<ClaimLock>('claim_lock:'),
  purgeExpired: () => {
    const now = Date.now();
    const locks = dbGetByPrefix<ClaimLock>('claim_lock:');
    locks.forEach((lock) => {
      if (new Date(lock.expiresAt).getTime() <= now) {
        dbDelete(`claim_lock:${lock.lockKey}`);
      }
    });
  },
};

// ============= Seed Demo Data =============

export function seedDemoData(): void {
  // Only seed if no users exist
  if (Users.getAll().length > 0) return;

  const demoUsers: Partial<UserProfile>[] = [
    { name: 'Rahul Sharma', email: 'rahul@demo.com', platform: 'zomato', city: 'Mumbai', state: 'Maharashtra', zone: 'Andheri West', weeklyIncome: 6000, weeklyHours: 55, subscriptionTier: 'standard', subscriptionStatus: 'active', totalPayouts: 1200, claimCount: 4, riskScore: 12 },
    { name: 'Priya Patel', email: 'priya@demo.com', platform: 'swiggy', city: 'Hyderabad', state: 'Telangana', zone: 'Banjara Hills', weeklyIncome: 5500, weeklyHours: 50, subscriptionTier: 'premium', subscriptionStatus: 'active', totalPayouts: 2400, claimCount: 7, riskScore: 8 },
    { name: 'Arjun Kumar', email: 'arjun@demo.com', platform: 'zomato', city: 'Delhi', state: 'Delhi', zone: 'Connaught Place', weeklyIncome: 7000, weeklyHours: 60, subscriptionTier: 'basic', subscriptionStatus: 'active', totalPayouts: 500, claimCount: 2, riskScore: 5 },
    { name: 'Sneha Reddy', email: 'sneha@demo.com', platform: 'zepto', city: 'Bangalore', state: 'Karnataka', zone: 'Koramangala', weeklyIncome: 4500, weeklyHours: 45, subscriptionTier: 'standard', subscriptionStatus: 'active', totalPayouts: 900, claimCount: 3, riskScore: 15 },
    { name: 'Vikram Singh', email: 'vikram@demo.com', platform: 'swiggy', city: 'Chennai', state: 'Tamil Nadu', zone: 'T Nagar', weeklyIncome: 5000, weeklyHours: 48, subscriptionTier: 'premium', subscriptionStatus: 'active', totalPayouts: 3600, claimCount: 10, riskScore: 35 },
  ];

  demoUsers.forEach((u, i) => {
    const userId = `demo_user_${i + 1}`;
    const fullUser: UserProfile = {
      userId,
      email: u.email!,
      name: u.name!,
      phone: `+9198765${(43210 + i).toString()}`,
      platform: u.platform as any,
      vehicleType: 'scooter',
      city: u.city!,
      state: u.state!,
      zone: u.zone!,
      weeklyIncome: u.weeklyIncome!,
      weeklyHours: u.weeklyHours!,
      yearsExperience: 2 + i,
      subscriptionTier: u.subscriptionTier as any,
      subscriptionStatus: u.subscriptionStatus as any,
      policyId: `ZS-POL-${1000 + i}`,
      weeklyPremium: Math.round(u.weeklyIncome! * (u.subscriptionTier === 'basic' ? 0.05 : u.subscriptionTier === 'standard' ? 0.07 : 0.10)),
      subscriptionStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      totalPayouts: u.totalPayouts!,
      claimCount: u.claimCount!,
      weeklyClaimCount: 1,
      riskScore: u.riskScore!,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      lastClaimDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      onboardingComplete: true,
    };
    Users.set(userId, fullUser);

    // Create corresponding policies
    const policy: Policy = {
      policyId: fullUser.policyId!,
      userId,
      policyNumber: `ZS-${u.city!.substring(0, 3).toUpperCase()}-${(2026000 + i * 100 + Math.floor(Math.random() * 100))}`,
      tier: u.subscriptionTier as any,
      status: 'active',
      weeklyPremium: fullUser.weeklyPremium,
      coverageAmount: u.weeklyIncome!,
      weeklyCap: u.subscriptionTier === 'premium' ? 1500 : 1000,
      planFactor: u.subscriptionTier === 'basic' ? 0.8 : u.subscriptionTier === 'standard' ? 1.0 : 1.2,
      startDate: fullUser.subscriptionStartDate!,
      renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      city: u.city!,
      platform: u.platform!,
      riskFactors: {
        basePremium: u.weeklyIncome! * 0.05,
        cityRiskMultiplier: 1.2,
        seasonalMultiplier: 1.1,
        platformMultiplier: 1.0,
        experienceDiscount: 0.95,
        hoursMultiplier: 1.05,
        claimHistoryMultiplier: 1.0,
        finalPremium: fullUser.weeklyPremium,
      },
      createdAt: fullUser.subscriptionStartDate!,
    };
    Policies.set(policy.policyId, policy);

    // Create sample claims
    const claimTypes = ['heavy_rainfall', 'extreme_heat', 'moderate_rainfall', 'strike', 'severe_storm'];
    for (let c = 0; c < Math.min(u.claimCount!, 3); c++) {
      const claimId = generateId('ZS-CLM');
      const claim: Claim = {
        claimId,
        userId,
        policyId: policy.policyId,
        status: c === 0 ? 'paid' : c === 1 ? 'approved' : 'paid',
        disruptionType: claimTypes[c % claimTypes.length],
        disruptionSeverity: c % 2 === 0 ? 'severe' : 'moderate',
        latitude: 17.385 + Math.random() * 0.1,
        longitude: 78.486 + Math.random() * 0.1,
        lostHours: 3 + c,
        payoutAmount: Math.round((u.weeklyIncome! / u.weeklyHours!) * (3 + c) * policy.planFactor),
        riskScore: Math.floor(Math.random() * 25),
        fraudFactors: {
          ipValidation: { score: 0, detail: 'IP matches GPS region' },
          velocityCheck: { score: 0, detail: 'Normal movement speed' },
          frequencyCheck: { score: Math.floor(Math.random() * 10), detail: 'Within normal range' },
          duplicateCheck: { score: 0, detail: 'No duplicates found' },
          patternCheck: { score: 0, detail: 'Normal behavioral pattern' },
          totalScore: Math.floor(Math.random() * 15),
        },
        weatherData: { temp: 28 + Math.random() * 10, rain: 50 + Math.random() * 30, wind: 15 + Math.random() * 20 },
        socialData: null,
        stateHistory: [
          { state: 'submitted', timestamp: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000).toISOString(), detail: 'Claim submitted via app' },
          { state: 'evaluating', timestamp: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000 + 1000).toISOString(), detail: 'Weather oracle queried' },
          { state: 'fraud_check', timestamp: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000 + 2000).toISOString(), detail: 'Fraud engine processing' },
          { state: 'approved', timestamp: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000 + 3000).toISOString(), detail: `Payout of ₹${Math.round((u.weeklyIncome! / u.weeklyHours!) * (3 + c) * policy.planFactor)} approved` },
          { state: 'paid', timestamp: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000 + 5000).toISOString(), detail: 'Funds transferred via UPI' },
        ],
        createdAt: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000).toISOString(),
        resolvedAt: new Date(Date.now() - (7 - c) * 24 * 60 * 60 * 1000 + 5000).toISOString(),
      };
      Claims.set(claimId, claim);

      // Create payout
      const payoutId = generateId('pay');
      const payout: Payout = {
        payoutId,
        transactionId: `txn_${generateId()}`,
        claimId,
        userId,
        amount: claim.payoutAmount,
        method: 'upi',
        status: 'completed',
        razorpayId: `pout_${generateId()}`,
        idempotencyKey: generateId('idem'),
        createdAt: claim.createdAt,
        completedAt: claim.resolvedAt,
      };
      Payouts.set(payoutId, payout);
    }
  });

  console.log('✅ ZyroSafe demo data seeded successfully');
}
