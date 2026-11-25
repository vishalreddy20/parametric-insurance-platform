export const zones = ['mumbai', 'chennai', 'kolkata', 'delhi', 'hyderabad', 'bangalore', 'pune', 'ahmedabad', 'jaipur', 'lucknow'] as const;
export type Zone = typeof zones[number];
export type Tier = 'basic' | 'standard' | 'premium';
export type PolicyStatus = 'PENDING_PREMIUM' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
export type PayoutStatus = 'RESERVED' | 'SETTLED' | 'FAILED';
export type SimulationMode = 'normal' | 'offline' | 'disagree';

export interface Session {
  username: string;
  role: 'worker' | 'platform' | 'insurer' | 'admin' | 'regulator';
  policyId?: string;
  workerId?: string;
  platformId?: 'zomato' | 'swiggy';
}

export interface Policy {
  id: string;
  status: PolicyStatus;
  terms: {
    workerId: string;
    zone: Zone;
    platform: string;
    tier: Tier;
    weeklyIncomePaise: number;
    weeklyMinutes: number;
    premiumPaise: number;
  };
  term: number;
  startsAt?: number;
  endsAt?: number;
  waitingUntil?: number;
}

export interface Reading {
  oracleId: string;
  value: number;
  observedAt: number;
  breach: boolean;
}

export interface DisruptionEvent {
  eventKey: string;
  triggerType: string;
  windowStart: number;
  windowEnd: number;
  unit: string;
  quorum: number;
  status: 'PENDING' | 'DECLARED';
  readings: Reading[];
  txId: string;
}

export interface Payout {
  id: string;
  eventKey: string;
  status: PayoutStatus;
  amountPaise: number;
  reservedAt: number;
  finalizedAt?: number;
  reference?: string;
  txId?: string;
}

export interface Enroll {
  zone: Zone;
  tier: Tier;
  weeklyIncomePaise: number;
  weeklyMinutes: number;
  premiumPaise: number;
  worker: { identity: string; phone: string; bank: string };
}

export interface LedgerProof { blockNumber: string; transactionId: string }
export interface Benchmark {
  completedAt: string;
  passed: boolean;
  environment: { network: string };
  metrics: { tps?: number; p50Ms?: number | null; p95Ms?: number | null; failures?: number; mvccRetries?: number };
}
export interface Reconciliation {
  reservedCount: number; settledCount: number; failedCount: number;
  reservedPaise: number; settledPaise: number; failedPaise: number;
}

export type SignInResult =
  | { status: 'enrol'; setupKey: string }
  | { status: 'challenge' }
  | { status: 'signed-in'; session: Session; recoveryCodes: string[] };

export interface AccountSecurity {
  authenticatorEnrolled: boolean;
  sessions: { id: string; current: boolean; idleExpiresAt: number; absoluteExpiresAt: number }[];
}

export interface DataProvider {
  signIn(username: string, password: string, mfa?: { code: string; recovery: boolean }): Promise<SignInResult>;
  currentSession(): Promise<Session>;
  signOut(session: Session, everywhere?: boolean): Promise<void>;
  security(session: Session): Promise<AccountSecurity>;
  revokeSession(session: Session, sessionId: string): Promise<void>;
  register(username: string, password: string, platformId: 'zomato' | 'swiggy', idempotencyKey: string): Promise<void>;
  policy(session: Session): Promise<Policy | null>;
  enroll(session: Session, terms: Enroll): Promise<Policy>;
  payPremium(session: Session): Promise<{ status: 'PAID' | 'FAILED'; callbackStatus: string }>;
  events(session: Session, zone: Zone): Promise<DisruptionEvent[]>;
  payouts(session: Session): Promise<Payout[]>;
  event(session: Session, key: string): Promise<DisruptionEvent | null>;
  proof(session: Session, txId: string, payoutId: string): Promise<LedgerProof | null>;
  policies(session: Session, zone: Zone, status: PolicyStatus): Promise<Policy[]>;
  benchmark(session: Session): Promise<Benchmark | null>;
  reconciliation(session: Session, zone: Zone, week: string): Promise<Reconciliation | null>;
  simulate(session: Session, zone: Zone, mode: SimulationMode): Promise<{ event: DisruptionEvent }>;
}

export class DataError extends Error {
  constructor(public code: string, message: string, public status?: number, public requestId?: string, public retryAfter?: number) {
    super(message);
  }
}
