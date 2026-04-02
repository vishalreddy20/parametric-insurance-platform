export interface TrafficDisruptionResult {
  disrupted: boolean;
  severity: 'none' | 'moderate' | 'severe';
  type: string;
  typeLabel: string;
  lostHours: number;
  confidence: number;
  details: string;
  congestionIndex: number;
  timestamp: string;
}

function getDeterministicScore(input: string): number {
  const hash = Array.from(input).reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) % 10007, 11);
  return hash % 100;
}

export function checkTrafficDisruption(city: string, zone: string = 'default'): TrafficDisruptionResult {
  const day = new Date().toISOString().slice(0, 10);
  const score = getDeterministicScore(`${day}:${city.toLowerCase()}:${zone.toLowerCase()}`);

  if (score >= 85) {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'severe_traffic_gridlock',
      typeLabel: 'Severe Traffic Gridlock',
      lostHours: 4,
      confidence: 87,
      details: `Traffic congestion index ${score}/100 exceeds severe threshold. Delivery routes are heavily blocked.`,
      congestionIndex: score,
      timestamp: new Date().toISOString(),
    };
  }

  if (score >= 70) {
    return {
      disrupted: true,
      severity: 'moderate',
      type: 'moderate_traffic_disruption',
      typeLabel: 'Moderate Traffic Disruption',
      lostHours: 2,
      confidence: 78,
      details: `Traffic congestion index ${score}/100 indicates prolonged route delays and reduced trip volume.`,
      congestionIndex: score,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    disrupted: false,
    severity: 'none',
    type: 'none',
    typeLabel: 'No Traffic Disruption',
    lostHours: 0,
    confidence: 0,
    details: `Traffic congestion index ${score}/100 is below disruption thresholds.`,
    congestionIndex: score,
    timestamp: new Date().toISOString(),
  };
}

export function simulateTrafficDisruption(type: 'gridlock' | 'event_closure', city: string): TrafficDisruptionResult {
  if (type === 'gridlock') {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'severe_traffic_gridlock',
      typeLabel: 'Severe Traffic Gridlock',
      lostHours: 4,
      confidence: 95,
      details: `SIMULATED: Citywide gridlock in ${city} due to multi-corridor choke points.`,
      congestionIndex: 92,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    disrupted: true,
    severity: 'moderate',
    type: 'event_route_closure',
    typeLabel: 'Event Route Closure',
    lostHours: 3,
    confidence: 90,
    details: `SIMULATED: Temporary route closures in ${city} due to major public event.`,
    congestionIndex: 84,
    timestamp: new Date().toISOString(),
  };
}
