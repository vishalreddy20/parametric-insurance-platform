/**
 * ZyroSafe Analytics Engine
 * System metrics, loss ratios, predictive analytics
 */

import { Users, Claims, Payouts, Policies, Flagged } from './mock-db';
import type { UserProfile, Claim } from './mock-db';
import { getForecast } from './weather-oracle';

// ============= System-Level KPIs =============

export interface SystemMetrics {
  totalUsers: number;
  activeSubscriptions: number;
  totalClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  flaggedClaims: number;
  totalPayouts: number;
  totalPremiumCollected: number;
  lossRatio: number;
  avgRiskScore: number;
  avgPayoutAmount: number;
  fraudDetectionRate: number;
  poolBalance: number;
  claimsByType: Record<string, number>;
  claimsByCity: Record<string, number>;
  weeklyRevenue: WeeklyDataPoint[];
  weeklyPayouts: WeeklyDataPoint[];
  tierDistribution: { name: string; value: number; color: string }[];
  riskDistribution: { name: string; value: number; color: string }[];
}

export interface WeeklyDataPoint {
  week: string;
  amount: number;
}

export function getSystemMetrics(): SystemMetrics {
  const allUsers = Users.getAll();
  const allClaims = Claims.getAll();
  const allPayouts = Payouts.getAll();
  const allPolicies = Policies.getAll();
  const allFlagged = Flagged.getAll();

  const activeUsers = allUsers.filter(u => u.subscriptionStatus === 'active');
  const approvedClaims = allClaims.filter(c => c.status === 'approved' || c.status === 'paid');
  const rejectedClaims = allClaims.filter(c => c.status === 'rejected');
  const flaggedCount = allFlagged.filter(f => f.reviewStatus === 'pending').length;

  const totalPayoutAmount = allPayouts.reduce((s, p) => s + p.amount, 0);
  const totalPremium = activeUsers.reduce((s, u) => {
    const weeks = Math.max(1, Math.floor((Date.now() - new Date(u.subscriptionStartDate || u.createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000)));
    return s + (u.weeklyPremium * weeks);
  }, 0);

  const lossRatio = totalPremium > 0 ? Math.round((totalPayoutAmount / totalPremium) * 100) / 100 : 0;

  // Claims by type
  const claimsByType: Record<string, number> = {};
  allClaims.forEach(c => {
    if (c.disruptionType && c.disruptionType !== 'none') {
      claimsByType[c.disruptionType] = (claimsByType[c.disruptionType] || 0) + 1;
    }
  });

  // Claims by city
  const claimsByCity: Record<string, number> = {};
  allClaims.forEach(c => {
    const user = Users.get(c.userId);
    if (user) {
      claimsByCity[user.city] = (claimsByCity[user.city] || 0) + 1;
    }
  });

  // Weekly data (last 8 weeks simulated)
  const weeklyRevenue: WeeklyDataPoint[] = [];
  const weeklyPayouts: WeeklyDataPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - i * 7);
    const weekLabel = `W${8 - i}`;
    const baseRevenue = activeUsers.reduce((s, u) => s + u.weeklyPremium, 0);
    const basePayout = Math.round(baseRevenue * (0.3 + Math.random() * 0.4));
    weeklyRevenue.push({ week: weekLabel, amount: baseRevenue + Math.round(Math.random() * 500) });
    weeklyPayouts.push({ week: weekLabel, amount: basePayout + Math.round(Math.random() * 300) });
  }

  // Tier distribution
  const tierCounts = { basic: 0, standard: 0, premium: 0 };
  activeUsers.forEach(u => {
    if (u.subscriptionTier in tierCounts) {
      tierCounts[u.subscriptionTier as keyof typeof tierCounts]++;
    }
  });

  // Risk distribution
  const riskBuckets = { low: 0, medium: 0, high: 0 };
  allUsers.forEach(u => {
    if (u.riskScore <= 30) riskBuckets.low++;
    else if (u.riskScore <= 70) riskBuckets.medium++;
    else riskBuckets.high++;
  });

  return {
    totalUsers: allUsers.length,
    activeSubscriptions: activeUsers.length,
    totalClaims: allClaims.length,
    approvedClaims: approvedClaims.length,
    rejectedClaims: rejectedClaims.length,
    flaggedClaims: flaggedCount,
    totalPayouts: totalPayoutAmount,
    totalPremiumCollected: totalPremium,
    lossRatio,
    avgRiskScore: allUsers.length > 0 ? Math.round(allUsers.reduce((s, u) => s + u.riskScore, 0) / allUsers.length) : 0,
    avgPayoutAmount: approvedClaims.length > 0 ? Math.round(totalPayoutAmount / approvedClaims.length) : 0,
    fraudDetectionRate: allClaims.length > 0 ? Math.round(((rejectedClaims.length + flaggedCount) / allClaims.length) * 100) : 0,
    poolBalance: Math.max(0, totalPremium - totalPayoutAmount),
    claimsByType,
    claimsByCity,
    weeklyRevenue,
    weeklyPayouts,
    tierDistribution: [
      { name: 'Basic', value: tierCounts.basic, color: '#94a3b8' },
      { name: 'Standard', value: tierCounts.standard, color: '#6366f1' },
      { name: 'Premium', value: tierCounts.premium, color: '#a855f7' },
    ],
    riskDistribution: [
      { name: 'Low Risk (0-30)', value: riskBuckets.low, color: '#10b981' },
      { name: 'Medium Risk (31-70)', value: riskBuckets.medium, color: '#f59e0b' },
      { name: 'High Risk (71-100)', value: riskBuckets.high, color: '#ef4444' },
    ],
  };
}

// ============= Predictive Analytics =============

export interface PredictiveInsight {
  city: string;
  nextWeekRisk: 'low' | 'moderate' | 'high' | 'critical';
  predictedClaims: number;
  predictedPayouts: number;
  riskFactors: string[];
  forecast: any[];
}

export function getPredictiveAnalytics(): PredictiveInsight[] {
  const cities = ['Mumbai', 'Delhi', 'Hyderabad', 'Bangalore', 'Chennai', 'Kolkata'];
  const insights: PredictiveInsight[] = [];

  for (const city of cities) {
    const forecast = getForecast(city);
    const dangerDays = forecast.filter(f => f.riskLevel === 'danger').length;
    const warningDays = forecast.filter(f => f.riskLevel === 'warning').length;
    const totalPredictedClaims = forecast.reduce((s, f) => s + f.predictedClaims, 0);

    const cityUsers = Users.getAll().filter(u => u.city.toLowerCase() === city.toLowerCase());
    const avgPayout = cityUsers.length > 0 ? 
      cityUsers.reduce((s, u) => s + (u.weeklyIncome / u.weeklyHours) * 3, 0) / cityUsers.length : 300;

    let nextWeekRisk: PredictiveInsight['nextWeekRisk'] = 'low';
    const riskFactors: string[] = [];

    if (dangerDays >= 3) {
      nextWeekRisk = 'critical';
      riskFactors.push(`${dangerDays} severe weather days predicted`);
    } else if (dangerDays >= 1 || warningDays >= 3) {
      nextWeekRisk = 'high';
      riskFactors.push(`${dangerDays} danger + ${warningDays} warning days`);
    } else if (warningDays >= 1) {
      nextWeekRisk = 'moderate';
      riskFactors.push(`${warningDays} caution days predicted`);
    }

    // Check seasonal risk
    const month = new Date().getMonth();
    if (month >= 5 && month <= 8) riskFactors.push('Active monsoon season');
    if (month >= 3 && month <= 5) riskFactors.push('Heat wave season');
    if (city === 'Delhi' && month >= 10 && month <= 1) riskFactors.push('Winter pollution peak');

    if (riskFactors.length === 0) riskFactors.push('No significant risk factors');

    insights.push({
      city,
      nextWeekRisk,
      predictedClaims: totalPredictedClaims,
      predictedPayouts: Math.round(totalPredictedClaims * avgPayout),
      riskFactors,
      forecast: forecast.slice(0, 5),
    });
  }

  return insights.sort((a, b) => {
    const order = { critical: 0, high: 1, moderate: 2, low: 3 };
    return order[a.nextWeekRisk] - order[b.nextWeekRisk];
  });
}

// ============= User Risk Profile =============

export function getUserAnalytics(userId: string) {
  const user = Users.get(userId);
  if (!user) return null;

  const claims = Claims.getByUser(userId);
  const payouts = Payouts.getByUser(userId);
  const policy = Policies.getByUser(userId).find(p => p.status === 'active');

  const weeklyIncome = user.weeklyIncome;
  const totalProtected = payouts.reduce((s, p) => s + p.amount, 0);
  const weeksPaid = policy ? Math.max(1, Math.floor((Date.now() - new Date(policy.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000))) : 0;
  const totalPremiumPaid = weeksPaid * (user.weeklyPremium || 0);
  const roi = totalPremiumPaid > 0 ? Math.round((totalProtected / totalPremiumPaid) * 100) : 0;

  return {
    user,
    policy,
    claims,
    payouts,
    totalProtected,
    totalPremiumPaid,
    roi,
    weeksPaid,
    claimSuccessRate: claims.length > 0 ? Math.round((claims.filter(c => c.status === 'paid').length / claims.length) * 100) : 0,
    avgPayoutTime: '3 seconds',
    earningsProtectedPercent: weeklyIncome > 0 ? Math.round((totalProtected / (weeklyIncome * weeksPaid)) * 100) : 0,
  };
}
