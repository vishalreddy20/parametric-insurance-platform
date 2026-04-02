/**
 * ZyroSafe AI Premium Engine
 * Dynamic weekly premium calculation using multi-factor risk modeling
 * Blueprint: "Actuarial Engineering and Dynamic Income-Based Payout Models"
 */

import type { UserProfile, PremiumBreakdown } from './mock-db';

// ============= City Risk Zones =============
const CITY_RISK_SCORES: Record<string, number> = {
  'mumbai': 1.35,      // Highest: monsoon flooding, extreme rain
  'chennai': 1.30,     // Cyclone-prone, coastal flooding
  'kolkata': 1.28,     // Monsoon + social disruptions
  'delhi': 1.25,       // Extreme heat + pollution + political
  'hyderabad': 1.20,   // Moderate rain risk, growing city
  'bangalore': 1.10,   // Relatively mild weather
  'pune': 1.15,        // Moderate rain risk
  'ahmedabad': 1.22,   // Extreme heat corridor
  'jaipur': 1.18,      // Heat + dust storms
  'lucknow': 1.16,     // Moderate risk
};

// ============= Seasonal Multipliers =============
function getSeasonalMultiplier(): number {
  const month = new Date().getMonth(); // 0-11
  // Monsoon season (June-September) has highest risk
  if (month >= 5 && month <= 8) return 1.35;  // Peak monsoon
  if (month === 4 || month === 9) return 1.20; // Pre/post monsoon
  if (month >= 2 && month <= 4) return 1.15;   // Summer heat wave season
  return 1.0; // Winter - lowest risk
}

// ============= Platform Risk Profiles =============
const PLATFORM_RISK: Record<string, number> = {
  'zomato': 1.05,   // Peak hours during rain = higher exposure
  'swiggy': 1.05,   // Similar to Zomato
  'zepto': 1.10,    // Q-commerce = more frequent short trips = higher exposure
  'amazon': 0.95,   // Larger deliveries, can pause easier
  'dunzo': 1.08,    // Mixed delivery types
  'other': 1.00,
};

// ============= Tier Configurations =============
export const TIER_CONFIG = {
  basic: {
    premiumRate: 0.05,
    planFactor: 0.8,
    weeklyCap: 1000,
    label: 'Basic',
    description: 'Essential safety net coverage',
    color: '#94a3b8',
    features: ['80% income replacement', 'Weather disruption coverage', 'Basic fraud protection', 'Weekly payout cap ₹1,000'],
  },
  standard: {
    premiumRate: 0.07,
    planFactor: 1.0,
    weeklyCap: 1000,
    label: 'Standard',
    description: 'Full proportional income replacement',
    color: '#6366f1',
    features: ['100% income replacement', 'Weather + Social coverage', 'Advanced fraud protection', 'Weekly payout cap ₹1,000', 'Priority claim processing'],
  },
  premium: {
    premiumRate: 0.10,
    planFactor: 1.2,
    weeklyCap: 1500,
    label: 'Premium',
    description: 'Augmented compensation buffer',
    color: '#a855f7',
    features: ['120% income replacement', 'All disruption types covered', 'AI-powered fraud shield', 'Weekly payout cap ₹1,500', 'Instant UPI payout', 'Predictive alerts'],
  },
};

// ============= Core Premium Calculation =============

export function calculateDynamicPremium(profile: Partial<UserProfile>, tier: 'basic' | 'standard' | 'premium'): PremiumBreakdown {
  const config = TIER_CONFIG[tier];
  const weeklyIncome = profile.weeklyIncome || 5000;
  
  // Base premium = tier rate × weekly income
  const basePremium = weeklyIncome * config.premiumRate;

  // City risk factor
  const cityKey = (profile.city || 'bangalore').toLowerCase();
  const cityRiskMultiplier = CITY_RISK_SCORES[cityKey] || 1.0;

  // Seasonal adjustment
  const seasonalMultiplier = getSeasonalMultiplier();

  // Platform risk
  const platformKey = profile.platform || 'other';
  const platformMultiplier = PLATFORM_RISK[platformKey] || 1.0;

  // Experience discount (more experienced = lower risk)
  const years = profile.yearsExperience || 1;
  const experienceDiscount = Math.max(0.85, 1 - (years * 0.03)); // 3% discount per year, max 15%

  // Hours multiplier (more hours = more exposure)
  const hours = profile.weeklyHours || 40;
  const hoursMultiplier = hours > 50 ? 1.10 : hours > 40 ? 1.05 : 1.0;

  // Claim history (more claims = higher premium)
  const claims = profile.claimCount || 0;
  const claimHistoryMultiplier = claims > 5 ? 1.20 : claims > 3 ? 1.10 : claims > 1 ? 1.05 : 1.0;

  // Calculate final premium
  const adjustedPremium = basePremium 
    * cityRiskMultiplier 
    * seasonalMultiplier 
    * platformMultiplier 
    * experienceDiscount 
    * hoursMultiplier 
    * claimHistoryMultiplier;

  const finalPremium = Math.round(Math.max(15, Math.min(adjustedPremium, weeklyIncome * 0.15))); // Floor ₹15, cap at 15% of income

  return {
    basePremium: Math.round(basePremium),
    cityRiskMultiplier,
    seasonalMultiplier,
    platformMultiplier,
    experienceDiscount,
    hoursMultiplier,
    claimHistoryMultiplier,
    finalPremium,
  };
}

// ============= Payout Calculation =============

export function calculatePayout(
  weeklyIncome: number,
  weeklyHours: number,
  lostHours: number,
  tier: 'basic' | 'standard' | 'premium'
): { payout: number; hourlyIncome: number; minimumPayout: number; cappedPayout: number; formula: string } {
  const config = TIER_CONFIG[tier];
  const hourlyIncome = weeklyHours > 0 ? weeklyIncome / weeklyHours : 0;
  const minimumPayout = Math.max(50, weeklyIncome * 0.01);
  const rawPayout = Math.max(minimumPayout, hourlyIncome * lostHours * config.planFactor);
  const cappedPayout = Math.min(rawPayout, config.weeklyCap);
  const payout = Math.round(cappedPayout * 100) / 100;

  return {
    payout,
    hourlyIncome: Math.round(hourlyIncome * 100) / 100,
    minimumPayout: Math.round(minimumPayout),
    cappedPayout: payout,
    formula: `max(₹${Math.round(minimumPayout)}, ₹${Math.round(hourlyIncome)} × ${lostHours}h × ${config.planFactor}) = ₹${payout}`,
  };
}

// ============= Premium Comparison =============

export function compareTiers(profile: Partial<UserProfile>): Record<string, PremiumBreakdown & { tier: string }> {
  return {
    basic: { ...calculateDynamicPremium(profile, 'basic'), tier: 'basic' },
    standard: { ...calculateDynamicPremium(profile, 'standard'), tier: 'standard' },
    premium: { ...calculateDynamicPremium(profile, 'premium'), tier: 'premium' },
  };
}

// ============= Risk Zone Assessment =============

export function assessCityRisk(city: string): { level: 'low' | 'moderate' | 'high' | 'critical'; score: number; factors: string[] } {
  const key = city.toLowerCase();
  const score = CITY_RISK_SCORES[key] || 1.0;
  const factors: string[] = [];
  
  if (key === 'mumbai') factors.push('Extreme monsoon flooding', 'High urban density', 'Coastal storm exposure');
  else if (key === 'chennai') factors.push('Cyclone-prone coast', 'Heavy monsoon rain', 'Urban waterlogging');
  else if (key === 'delhi') factors.push('Extreme heat corridor', 'Severe air pollution', 'Political disruptions');
  else if (key === 'hyderabad') factors.push('Moderate monsoon exposure', 'Urban flooding in low zones', 'Growing traffic density');
  else if (key === 'bangalore') factors.push('Mild weather profile', 'Occasional heavy rain', 'Traffic congestion');
  else factors.push('Standard risk assessment', 'Limited historical data');

  const level = score >= 1.30 ? 'critical' : score >= 1.20 ? 'high' : score >= 1.10 ? 'moderate' : 'low';
  return { level, score, factors };
}
