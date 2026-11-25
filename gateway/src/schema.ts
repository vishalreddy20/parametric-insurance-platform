import { z } from 'zod';

export const zones = ['mumbai', 'chennai', 'kolkata', 'delhi', 'hyderabad', 'bangalore', 'pune', 'ahmedabad', 'jaipur', 'lucknow'] as const;
export const zone = z.enum(zones);
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const epoch = z.number().int().positive().max(253402300799);
const amount = z.number().int().positive().max(100000000);
export const roles = ['worker', 'platform', 'insurer', 'bank', 'oracle', 'regulator'] as const;
export type Role = typeof roles[number];

export const eventKey = z.string().regex(/^[a-z]+\|[a-z_]+\|[1-9][0-9]{1,11}$/);
export const payoutID = z.string().regex(/^[0-9a-f]{64}$/);
export const policyStatus = z.enum(['PENDING_PREMIUM', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED']);
export const page = z.strictObject({
  size: z.coerce.number().int().min(1).max(100).default(25),
  bookmark: z.string().max(4096).default(''),
});
export const policyList = page.extend({ status: policyStatus.default('ACTIVE') });
export const login = z.strictObject({ username: id, accessCode: z.string().min(16).max(256) });
export const enroll = z.strictObject({
  policyId: id,
  workerId: id,
  zone,
  tier: z.enum(['basic', 'standard', 'premium']),
  weeklyIncomePaise: amount,
  weeklyMinutes: z.number().int().positive().max(10080),
  premiumPaise: amount,
  worker: z.strictObject({
    identity: z.string().trim().min(1).max(256),
    phone: z.string().trim().min(1).max(64),
    bank: z.string().trim().min(1).max(256),
  }),
});
export const premium = z.strictObject({
  policyId: id, term: z.number().int().positive(), amountPaise: amount, reference: id, requestId: id,
});
export const activity = z.strictObject({
  workerId: id, platformId: z.enum(['zomato', 'swiggy']), windowStart: epoch, windowEnd: epoch, requestId: id,
}).refine(({ windowStart, windowEnd }) => windowEnd > windowStart, 'Invalid activity window.');
export const observation = z.strictObject({
  zone,
  triggerType: z.enum([
    'moderate_rainfall', 'heavy_rainfall', 'extreme_heat', 'severe_storm', 'hazardous_pollution',
    'moderate_traffic_disruption', 'severe_traffic_gridlock', 'event_route_closure', 'dispatch_degradation',
    'platform_outage', 'strike', 'shutdown', 'curfew', 'protest',
  ]),
  windowStart: epoch.refine((value) => value % 3600 === 0),
  value: z.number().int().min(-60).max(2000),
  unit: z.enum(['mm/day', 'celsius', 'km/h', 'aqi', 'score', 'confidence']),
  observedAt: epoch,
}).refine(({ windowStart, observedAt }) => observedAt >= windowStart && observedAt < windowStart + 3600);
export const settlement = z.strictObject({
  payoutId: payoutID, status: z.enum(['SETTLED', 'FAILED']), reference: id, requestId: id,
});

const configTier = z.strictObject({
  cap: amount, factor: z.number().int().positive().max(200),
});
export const configUpdate = z.strictObject({
  requestId: id,
  config: z.strictObject({
    version: z.number().int().nonnegative(),
    quorum: z.number().int().min(1).max(9),
    freshness: z.number().int().min(1).max(3600),
    waiting: z.number().int().min(0).max(604800),
    oracles: z.array(id).min(1).max(9),
    basic: configTier, standard: configTier, premium: configTier,
    triggers: z.array(z.strictObject({
      code: id, unit: z.string().min(1).max(12), threshold: z.number().int(),
      min: z.number().int(), max: z.number().int(), lostHours: z.number().int().min(1).max(24),
    })).length(14),
  }),
});
export const reconciliation = page.extend({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const simulation = z.strictObject({
  zone,
  scenario: z.enum(['storm', 'rainfall', 'heat', 'pollution', 'strike', 'curfew', 'protest', 'gridlock', 'outage', 'dispatch_freeze']).default('storm'),
  mode: z.enum(['normal', 'disagree', 'offline']).default('normal'),
});
