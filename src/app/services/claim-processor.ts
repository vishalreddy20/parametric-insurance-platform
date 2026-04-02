/**
 * ZyroSafe Claim Processor
 * Automated parametric claim pipeline with state machine
 * Blueprint: "System Workflow and State Machine Orchestration"
 */

import { generateId, Users, Policies, Claims, Payouts, Flagged, ClaimLocks } from './mock-db';
import type { Claim, ClaimStateEntry, Payout, FlaggedClaim, UserProfile, Policy, ClaimLock } from './mock-db';
import { checkWeatherDisruption, simulateDisruption, type DisruptionResult } from './weather-oracle';
import { checkSocialDisruption, simulateSocialDisruption, type SocialDisruptionResult } from './social-oracle';
import { checkTrafficDisruption, simulateTrafficDisruption, type TrafficDisruptionResult } from './traffic-oracle';
import { checkPlatformDisruption, simulatePlatformDisruption, type PlatformDisruptionResult } from './platform-oracle';
import { evaluateFraud, type FraudEvaluationResult } from './fraud-engine';
import { calculatePayout } from './ai-premium-engine';
import { executeInstantPayout } from './mock-payment';

// ============= Types =============

export interface ClaimProcessResult {
  success: boolean;
  claimId: string;
  status: Claim['status'];
  payout?: number;
  message: string;
  claim: Claim;
  fraudResult?: FraudEvaluationResult;
  weatherResult?: DisruptionResult;
  socialResult?: SocialDisruptionResult;
  trafficResult?: TrafficDisruptionResult;
  platformResult?: PlatformDisruptionResult;
  payoutResult?: Payout;
  stateHistory: ClaimStateEntry[];
}

// ============= State Machine Helpers =============

function addState(history: ClaimStateEntry[], state: string, detail: string): ClaimStateEntry[] {
  return [...history, { state, timestamp: new Date().toISOString(), detail }];
}

function getDisruptionWindowStartIso(windowMinutes: number = 120): string {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  return new Date(start).toISOString();
}

function buildClaimLockKey(userId: string, disruptionType: string, latitude: number, longitude: number, windowStartIso: string): string {
  const latBucket = latitude.toFixed(2);
  const lonBucket = longitude.toFixed(2);
  return `${userId}:${disruptionType}:${latBucket}:${lonBucket}:${windowStartIso}`;
}

// ============= Main Claim Pipeline =============

export async function processClaim(
  userId: string,
  latitude: number,
  longitude: number,
  simulationType?: 'rainfall' | 'heat' | 'storm' | 'pollution' | 'cyclone' | 'strike' | 'curfew' | 'protest' | 'traffic' | 'outage',
  triggerSource: 'manual' | 'auto' = 'manual'
): Promise<ClaimProcessResult> {
  const claimId = generateId('ZS-CLM');
  let stateHistory: ClaimStateEntry[] = [];

  // ========== State 1: SUBMITTED ==========
  stateHistory = addState(stateHistory, 'submitted', `Claim ${claimId} submitted from GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

  // Validate user and policy
  const user = Users.get(userId);
  if (!user) {
    return { success: false, claimId, status: 'rejected', message: 'User not found', claim: {} as Claim, stateHistory };
  }

  const policies = Policies.getByUser(userId);
  const activePolicy = policies.find(p => p.status === 'active');
  if (!activePolicy) {
    stateHistory = addState(stateHistory, 'rejected', 'No active policy found');
    return { success: false, claimId, status: 'rejected', message: 'No active insurance policy. Please subscribe first.', claim: {} as Claim, stateHistory };
  }

  // ========== State 2: EVALUATING ==========
  stateHistory = addState(stateHistory, 'evaluating', 'Querying environmental and social data oracles...');

  // Check weather disruption
  let weatherResult: DisruptionResult;
  let socialResult: SocialDisruptionResult | undefined;
  let trafficResult: TrafficDisruptionResult | undefined;
  let platformResult: PlatformDisruptionResult | undefined;
  let disruptionType = '';
  let disruptionSeverity: 'moderate' | 'severe' = 'moderate';
  let lostHours = 0;

  if (simulationType) {
    // Demo simulation mode
    if (['rainfall', 'heat', 'storm', 'pollution', 'cyclone'].includes(simulationType)) {
      weatherResult = simulateDisruption(simulationType as any, user.city);
      trafficResult = checkTrafficDisruption(user.city, user.zone || 'default');
      platformResult = checkPlatformDisruption(user.platform, user.city);
    } else {
      weatherResult = checkWeatherDisruption(user.city);
      socialResult = ['strike', 'curfew', 'protest'].includes(simulationType)
        ? simulateSocialDisruption(simulationType as any, user.city)
        : checkSocialDisruption(user.city, user.state);
      trafficResult = simulationType === 'traffic'
        ? simulateTrafficDisruption('gridlock', user.city)
        : checkTrafficDisruption(user.city, user.zone || 'default');
      platformResult = simulationType === 'outage'
        ? simulatePlatformDisruption('outage', user.platform, user.city)
        : checkPlatformDisruption(user.platform, user.city);
    }
  } else {
    weatherResult = checkWeatherDisruption(user.city, latitude, longitude);
    socialResult = checkSocialDisruption(user.city, user.state);
    trafficResult = checkTrafficDisruption(user.city, user.zone || 'default');
    platformResult = checkPlatformDisruption(user.platform, user.city);
  }

  // Determine most impactful disruption across all supported channels.
  const candidates = [
    weatherResult.disrupted ? { source: 'weather', type: weatherResult.type, severity: weatherResult.severity, lostHours: weatherResult.lostHours, confidence: weatherResult.confidence, label: weatherResult.typeLabel } : null,
    socialResult?.disrupted ? { source: 'social', type: socialResult.type, severity: socialResult.severity, lostHours: socialResult.lostHours, confidence: socialResult.confidence, label: socialResult.typeLabel } : null,
    trafficResult?.disrupted ? { source: 'traffic', type: trafficResult.type, severity: trafficResult.severity, lostHours: trafficResult.lostHours, confidence: trafficResult.confidence, label: trafficResult.typeLabel } : null,
    platformResult?.disrupted ? { source: 'platform', type: platformResult.type, severity: platformResult.severity, lostHours: platformResult.lostHours, confidence: platformResult.confidence, label: platformResult.typeLabel } : null,
  ].filter(Boolean) as Array<{ source: string; type: string; severity: 'moderate' | 'severe'; lostHours: number; confidence: number; label: string }>;

  if (candidates.length > 0) {
    const selected = candidates.sort((a, b) => {
      if (b.lostHours !== a.lostHours) return b.lostHours - a.lostHours;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (a.severity === b.severity) return 0;
      return a.severity === 'severe' ? -1 : 1;
    })[0];

    disruptionType = selected.type;
    disruptionSeverity = selected.severity;
    lostHours = selected.lostHours;
    stateHistory = addState(
      stateHistory,
      'evaluating',
      `${selected.source} oracle selected: ${selected.label}. Severity: ${selected.severity}. Confidence: ${selected.confidence}%. Estimated ${selected.lostHours} lost hours.`
    );

    // Idempotency guard: prevent duplicate claim execution for same disruption window.
    ClaimLocks.purgeExpired();
    const windowStartIso = getDisruptionWindowStartIso(120);
    const lockKey = buildClaimLockKey(userId, disruptionType, latitude, longitude, windowStartIso);
    const existingLock = ClaimLocks.get(lockKey);
    if (existingLock && new Date(existingLock.expiresAt).getTime() > Date.now()) {
      stateHistory = addState(
        stateHistory,
        'rejected',
        `Idempotency lock active for this disruption window (${windowStartIso}). Duplicate payout prevented.`
      );
      return {
        success: false,
        claimId,
        status: 'rejected',
        message: 'A claim for this disruption window is already being processed or was already paid. Duplicate claim prevented.',
        claim: {} as Claim,
        weatherResult,
        socialResult,
        trafficResult,
        platformResult,
        stateHistory,
      };
    }

    const lock: ClaimLock = {
      lockKey,
      userId,
      disruptionType,
      windowStart: windowStartIso,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      source: triggerSource,
    };
    ClaimLocks.set(lock);
  } else {
    stateHistory = addState(stateHistory, 'rejected', 'No parametric triggers activated. Current conditions within safe parameters.');
    
    const rejectedClaim: Claim = {
      claimId, userId, policyId: activePolicy.policyId,
      status: 'rejected', disruptionType: 'none', disruptionSeverity: 'moderate',
      latitude, longitude, lostHours: 0, payoutAmount: 0,
      riskScore: 0,
      fraudFactors: { ipValidation: { score: 0, detail: '' }, velocityCheck: { score: 0, detail: '' }, frequencyCheck: { score: 0, detail: '' }, duplicateCheck: { score: 0, detail: '' }, patternCheck: { score: 0, detail: '' }, totalScore: 0 },
      weatherData: weatherResult.weatherData, socialData: socialResult || null,
      stateHistory, createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
    };
    Claims.set(claimId, rejectedClaim);
    
    return {
      success: false, claimId, status: 'rejected',
      message: 'No active disruption detected at your location. Conditions are safe for delivery operations.',
      claim: rejectedClaim, weatherResult, socialResult, trafficResult, platformResult, stateHistory,
    };
  }

  // ========== State 3: FRAUD CHECK (Auditing) ==========
  stateHistory = addState(stateHistory, 'fraud_check', 'Zero-trust fraud detection engine processing...');

  const fraudResult = evaluateFraud(userId, user, latitude, longitude, disruptionType);
  stateHistory = addState(stateHistory, 'fraud_check', `Fraud risk score: ${fraudResult.riskScore}/100 — Classification: ${fraudResult.classification}`);

  // Build base claim object
  const claim: Claim = {
    claimId, userId, policyId: activePolicy.policyId,
    status: 'calculating', disruptionType, disruptionSeverity,
    latitude, longitude, lostHours, payoutAmount: 0,
    riskScore: fraudResult.riskScore,
    fraudFactors: fraudResult.breakdown,
    weatherData: weatherResult.weatherData,
    socialData: socialResult || null,
    stateHistory, createdAt: new Date().toISOString(), resolvedAt: null,
  };

  // Handle fraud rejection or flagging
  if (fraudResult.action === 'rejected') {
    claim.status = 'rejected';
    stateHistory = addState(stateHistory, 'rejected', `Claim categorically denied. Risk score ${fraudResult.riskScore}/100 exceeds rejection threshold. ${fraudResult.recommendations.join(' ')}`);
    claim.stateHistory = stateHistory;
    claim.resolvedAt = new Date().toISOString();
    Claims.set(claimId, claim);

    // Update user risk score
    user.riskScore = Math.min(100, (user.riskScore || 0) + 20);
    Users.set(userId, user);

    return {
      success: false, claimId, status: 'rejected',
      message: `Claim rejected by fraud detection engine. Risk score: ${fraudResult.riskScore}/100. ${fraudResult.recommendations[0]}`,
      claim, fraudResult, weatherResult, socialResult, trafficResult, platformResult, stateHistory,
    };
  }

  if (fraudResult.action === 'flagged') {
    claim.status = 'flagged';
    stateHistory = addState(stateHistory, 'flagged', `Claim flagged for admin review. Risk score: ${fraudResult.riskScore}/100. Awaiting secondary verification.`);
    claim.stateHistory = stateHistory;
    Claims.set(claimId, claim);

    // Create flagged entry for admin
    const flaggedEntry: FlaggedClaim = {
      claimId, userId, riskScore: fraudResult.riskScore,
      fraudFactors: fraudResult.breakdown, claim,
      reviewStatus: 'pending', reviewedAt: null, reviewNote: null,
    };
    Flagged.set(claimId, flaggedEntry);

    return {
      success: false, claimId, status: 'flagged',
      message: `Claim under review. Medium risk detected (score: ${fraudResult.riskScore}/100). An admin will verify your claim shortly.`,
      claim, fraudResult, weatherResult, socialResult, trafficResult, platformResult, stateHistory,
    };
  }

  // ========== State 4: CALCULATING ==========
  stateHistory = addState(stateHistory, 'calculating', `Computing income-proportional payout: HourlyIncome × ${lostHours}h × ${activePolicy.planFactor} plan factor`);

  const payoutCalc = calculatePayout(
    user.weeklyIncome, user.weeklyHours, lostHours, activePolicy.tier
  );

  // Check weekly cap
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeekPayouts = Payouts.getByUser(userId).filter(
    p => new Date(p.createdAt) >= weekStart
  ).reduce((sum, p) => sum + p.amount, 0);

  let finalPayout = payoutCalc.payout;
  const remainingCap = activePolicy.weeklyCap - thisWeekPayouts;
  if (remainingCap <= 0) {
    claim.status = 'rejected';
    stateHistory = addState(stateHistory, 'rejected', `Weekly payout cap of ₹${activePolicy.weeklyCap} already reached. Current week total: ₹${thisWeekPayouts}`);
    claim.stateHistory = stateHistory;
    claim.resolvedAt = new Date().toISOString();
    Claims.set(claimId, claim);
    return {
      success: false, claimId, status: 'rejected',
      message: `Weekly payout cap (₹${activePolicy.weeklyCap}) reached. Try again next week.`,
      claim, fraudResult, weatherResult, socialResult, trafficResult, platformResult, stateHistory,
    };
  }

  if (finalPayout > remainingCap) {
    finalPayout = remainingCap;
    stateHistory = addState(stateHistory, 'calculating', `Payout reduced from ₹${payoutCalc.payout} to ₹${finalPayout} due to weekly cap (₹${activePolicy.weeklyCap})`);
  }

  stateHistory = addState(stateHistory, 'calculating', `Payout formula: ${payoutCalc.formula}. Final: ₹${finalPayout}`);

  claim.payoutAmount = finalPayout;
  claim.status = 'approved';
  stateHistory = addState(stateHistory, 'approved', `Claim approved. Payout of ₹${finalPayout} authorized.`);

  // ========== State 5: INITIATING PAYOUT ==========
  stateHistory = addState(stateHistory, 'initiating', 'Dispatching secure payout via RazorpayX API...');

  const payoutResult = executeInstantPayout(userId, finalPayout, claimId);

  // ========== State 6: SETTLED ==========
  stateHistory = addState(stateHistory, 'paid', `Funds transferred successfully. Transaction ID: ${payoutResult.transactionId}. Method: UPI Instant.`);
  claim.status = 'paid';
  claim.resolvedAt = new Date().toISOString();
  claim.stateHistory = stateHistory;
  Claims.set(claimId, claim);

  // Save payout record
  Payouts.set(payoutResult.payoutId, payoutResult);

  // Update user profile
  user.totalPayouts = (user.totalPayouts || 0) + finalPayout;
  user.claimCount = (user.claimCount || 0) + 1;
  user.weeklyClaimCount = (user.weeklyClaimCount || 0) + 1;
  user.lastClaimDate = new Date().toISOString();
  Users.set(userId, user);

  return {
    success: true, claimId, status: 'paid',
    payout: finalPayout,
    message: `✅ Payout of ₹${finalPayout} approved and transferred instantly via UPI.`,
    claim, fraudResult, weatherResult, socialResult, trafficResult, platformResult, payoutResult, stateHistory,
  };
}

// ============= Admin: Approve Flagged Claim =============

export function adminApproveClaim(claimId: string, note: string = ''): boolean {
  const flagged = Flagged.get(claimId);
  const claim = Claims.get(claimId);
  if (!flagged || !claim) return false;

  flagged.reviewStatus = 'approved';
  flagged.reviewedAt = new Date().toISOString();
  flagged.reviewNote = note || 'Manually approved by admin after review';
  Flagged.set(claimId, flagged);

  // Process the payout
  const user = Users.get(claim.userId);
  if (!user) return false;

  claim.status = 'approved';
  claim.stateHistory = addState(claim.stateHistory, 'approved', `Admin approved. Note: ${note || 'Verified legitimate'}`);

  const payoutResult = executeInstantPayout(claim.userId, claim.payoutAmount, claimId);
  claim.status = 'paid';
  claim.stateHistory = addState(claim.stateHistory, 'paid', `Admin-approved payout of ₹${claim.payoutAmount} transferred. TX: ${payoutResult.transactionId}`);
  claim.resolvedAt = new Date().toISOString();
  Claims.set(claimId, claim);
  Payouts.set(payoutResult.payoutId, payoutResult);

  user.totalPayouts = (user.totalPayouts || 0) + claim.payoutAmount;
  user.claimCount = (user.claimCount || 0) + 1;
  Users.set(claim.userId, user);

  return true;
}

// ============= Admin: Reject Flagged Claim =============

export function adminRejectClaim(claimId: string, note: string = ''): boolean {
  const flagged = Flagged.get(claimId);
  const claim = Claims.get(claimId);
  if (!flagged || !claim) return false;

  flagged.reviewStatus = 'rejected';
  flagged.reviewedAt = new Date().toISOString();
  flagged.reviewNote = note || 'Rejected by admin after fraud review';
  Flagged.set(claimId, flagged);

  claim.status = 'rejected';
  claim.stateHistory = addState(claim.stateHistory, 'rejected', `Admin rejected. Note: ${note || 'Confirmed fraudulent'}`);
  claim.resolvedAt = new Date().toISOString();
  Claims.set(claimId, claim);

  // Increase user risk score
  const user = Users.get(claim.userId);
  if (user) {
    user.riskScore = Math.min(100, (user.riskScore || 0) + 30);
    Users.set(claim.userId, user);
  }

  return true;
}
