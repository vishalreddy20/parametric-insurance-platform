export interface PlatformDisruptionResult {
  disrupted: boolean;
  severity: 'none' | 'moderate' | 'severe';
  type: string;
  typeLabel: string;
  lostHours: number;
  confidence: number;
  details: string;
  timestamp: string;
}

function getDeterministicScore(input: string): number {
  const hash = Array.from(input).reduce((acc, ch) => (acc * 37 + ch.charCodeAt(0)) % 10009, 17);
  return hash % 100;
}

export function checkPlatformDisruption(platform: string, city: string): PlatformDisruptionResult {
  const hourBucket = new Date().toISOString().slice(0, 13);
  const score = getDeterministicScore(`${hourBucket}:${platform.toLowerCase()}:${city.toLowerCase()}`);

  if (score >= 96) {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'platform_outage',
      typeLabel: 'Platform Outage',
      lostHours: 5,
      confidence: 93,
      details: `${platform} service disruption detected in ${city}. Order assignment unavailable.`,
      timestamp: new Date().toISOString(),
    };
  }

  if (score >= 90) {
    return {
      disrupted: true,
      severity: 'moderate',
      type: 'dispatch_degradation',
      typeLabel: 'Dispatch Degradation',
      lostHours: 2,
      confidence: 82,
      details: `${platform} dispatch queue lag detected in ${city}. Reduced order throughput observed.`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    disrupted: false,
    severity: 'none',
    type: 'none',
    typeLabel: 'No Platform Disruption',
    lostHours: 0,
    confidence: 0,
    details: `${platform} platform operations normal in ${city}.`,
    timestamp: new Date().toISOString(),
  };
}

export function simulatePlatformDisruption(type: 'outage' | 'dispatch_freeze', platform: string, city: string): PlatformDisruptionResult {
  if (type === 'outage') {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'platform_outage',
      typeLabel: 'Platform Outage',
      lostHours: 5,
      confidence: 98,
      details: `SIMULATED: ${platform} is unavailable in ${city}. New job assignments halted.`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    disrupted: true,
    severity: 'moderate',
    type: 'dispatch_degradation',
    typeLabel: 'Dispatch Degradation',
    lostHours: 3,
    confidence: 91,
    details: `SIMULATED: ${platform} dispatch freeze in ${city}. Delivery slots heavily throttled.`,
    timestamp: new Date().toISOString(),
  };
}
