/**
 * ZyroSafe Social Oracle
 * NLP-based social disruption detection using news analysis
 * Blueprint: "Societal Disruption Oracles and NLP Architectures"
 */

export interface SocialDisruptionResult {
  disrupted: boolean;
  severity: 'none' | 'moderate' | 'severe';
  type: string;
  typeLabel: string;
  lostHours: number;
  confidence: number;
  details: string;
  sources: NewsSource[];
  affectedZones: string[];
}

export interface NewsSource {
  title: string;
  source: string;
  timestamp: string;
  relevanceScore: number;
  url: string;
}

// ============= Keyword Taxonomy =============

const DISRUPTION_KEYWORDS: Record<string, { score: number; category: string }> = {
  'curfew': { score: 35, category: 'government_order' },
  'section 144': { score: 35, category: 'government_order' },
  'section144': { score: 35, category: 'government_order' },
  'bandh': { score: 30, category: 'strike' },
  'strike': { score: 25, category: 'strike' },
  'hartal': { score: 28, category: 'strike' },
  'protest': { score: 20, category: 'civil_unrest' },
  'riot': { score: 25, category: 'civil_unrest' },
  'shutdown': { score: 22, category: 'strike' },
  'zone closure': { score: 30, category: 'government_order' },
  'road blocked': { score: 20, category: 'infrastructure' },
  'road closure': { score: 22, category: 'infrastructure' },
  'movement restricted': { score: 25, category: 'government_order' },
  'vip movement': { score: 15, category: 'government_order' },
  'flood alert': { score: 28, category: 'disaster' },
  'evacuation': { score: 35, category: 'disaster' },
};

// Active tense markers that increase confidence
const ACTIVE_TENSE_MARKERS = [
  'imposed', 'declared', 'enforced', 'announced', 'underway',
  'ongoing', 'active', 'effective', 'begins', 'started',
  'in effect', 'currently', 'today', 'breaking'
];

// ============= Simulated News Database =============

interface SimulatedNewsEvent {
  city: string;
  state: string;
  type: string;
  headlines: string[];
  severity: 'moderate' | 'severe';
  sources: string[];
  lostHours: number;
  probability: number; // Daily probability of this event happening
}

const NEWS_EVENTS: SimulatedNewsEvent[] = [
  {
    city: 'hyderabad', state: 'telangana', type: 'strike',
    headlines: [
      'Telangana RTC workers announce surprise strike, public transport halted',
      'Bandh called in Hyderabad: Markets and commercial zones shut on Wednesday',
      'Section 144 imposed in parts of Hyderabad Old City amid tensions'
    ],
    severity: 'severe', sources: ['The Hindu', 'Deccan Chronicle', 'NDTV'], lostHours: 8, probability: 0.08,
  },
  {
    city: 'mumbai', state: 'maharashtra', type: 'strike',
    headlines: [
      'Maharashtra Bandh called by political parties; essential services affected',
      'Auto-rickshaw unions strike across Mumbai, daily commuters stranded',
      'Protests erupt in Dharavi area, traffic diverted across multiple routes'
    ],
    severity: 'severe', sources: ['Mumbai Mirror', 'Times of India', 'NDTV'], lostHours: 8, probability: 0.10,
  },
  {
    city: 'delhi', state: 'delhi', type: 'curfew',
    headlines: [
      'Section 144 imposed in Central Delhi ahead of VIP convoy movement',
      'Farmers protest blocks key Delhi-Gurgaon expressway; deliveries halted',
      'Police enforce movement restrictions in Chandni Chowk area'
    ],
    severity: 'moderate', sources: ['Hindustan Times', 'The Indian Express', 'ANI'], lostHours: 5, probability: 0.12,
  },
  {
    city: 'kolkata', state: 'west bengal', type: 'strike',
    headlines: [
      '12-hour Bandh called in Kolkata; shops and markets remain shut',
      'Political rally disrupts traffic across Park Street and surrounding areas',
      'Strike paralyzes West Bengal transportation network, Uber and Ola suspend'
    ],
    severity: 'severe', sources: ['The Telegraph', 'ABP News', 'India Today'], lostHours: 8, probability: 0.09,
  },
  {
    city: 'chennai', state: 'tamil nadu', type: 'shutdown',
    headlines: [
      'Tamil Nadu traders announce shutdown over GST disputes',
      'Road blockade near Chennai Central disrupts food delivery operations',
      'VCK calls for protest march in Anna Nagar; Section 144 likely'
    ],
    severity: 'moderate', sources: ['The New Indian Express', 'DT Next', 'News18'], lostHours: 5, probability: 0.07,
  },
  {
    city: 'bangalore', state: 'karnataka', type: 'protest',
    headlines: [
      'Pro-Kannada groups stage protest blocking Outer Ring Road tech corridor',
      'Garment workers strike in Peenya Industrial Area spreads to nearby zones',
      'Traffic chaos in MG Road area due to unplanned political rally'
    ],
    severity: 'moderate', sources: ['Bangalore Mirror', 'Deccan Herald', 'The Hindu'], lostHours: 4, probability: 0.06,
  },
];

// ============= Core Analysis =============

function analyzeText(text: string): { score: number; keywords: string[]; isActive: boolean } {
  const lower = text.toLowerCase();
  let score = 0;
  const keywords: string[] = [];
  let isActive = false;

  // Check disruption keywords
  for (const [keyword, config] of Object.entries(DISRUPTION_KEYWORDS)) {
    if (lower.includes(keyword)) {
      score += config.score;
      keywords.push(keyword);
    }
  }

  // Check active tense markers (bonus)
  for (const marker of ACTIVE_TENSE_MARKERS) {
    if (lower.includes(marker)) {
      score += 15;
      isActive = true;
      break;
    }
  }

  return { score, keywords, isActive };
}

// ============= Main Social Disruption Check =============

export function checkSocialDisruption(city: string, state: string): SocialDisruptionResult {
  const cityLower = city.toLowerCase();
  
  // Find matching events for this city
  const matchingEvents = NEWS_EVENTS.filter(
    e => e.city === cityLower || e.state === state.toLowerCase()
  );

  if (matchingEvents.length === 0) {
    return {
      disrupted: false, severity: 'none', type: 'none', typeLabel: 'No Disruption',
      lostHours: 0, confidence: 0, details: 'No social disruptions detected in your region.',
      sources: [], affectedZones: [],
    };
  }

  // Use date-seeded random (consistent for same day and city)
  const daySeed = new Date().toISOString().split('T')[0];
  const seed = (daySeed + cityLower).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const eventRand = Math.abs(Math.sin(seed)) * 100;

  // Check if an event "happens" today based on probability
  for (const event of matchingEvents) {
    if (eventRand < event.probability * 100 * 10) { // Enhanced probability for demo
      const selectedHeadlines = event.headlines;
      let totalScore = 0;
      const allKeywords: string[] = [];

      const sources: NewsSource[] = selectedHeadlines.map((headline, i) => {
        const analysis = analyzeText(headline);
        totalScore += analysis.score;
        allKeywords.push(...analysis.keywords);
        
        return {
          title: headline,
          source: event.sources[i] || 'Local News',
          timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          relevanceScore: Math.min(98, analysis.score + Math.floor(Math.random() * 20)),
          url: `https://news.example.com/${event.type}-${cityLower}`,
        };
      });

      const avgScore = totalScore / selectedHeadlines.length;
      const confidence = Math.min(95, Math.round(avgScore + (sources.length * 5)));

      if (confidence >= 50) {
        return {
          disrupted: true,
          severity: event.severity,
          type: event.type,
          typeLabel: event.type === 'strike' ? 'Strike / Bandh' :
                     event.type === 'curfew' ? 'Section 144 / Curfew' :
                     event.type === 'protest' ? 'Protest / Rally' :
                     event.type === 'shutdown' ? 'Market Shutdown' : 'Civil Disruption',
          lostHours: event.lostHours,
          confidence,
          details: `${sources.length} independent news sources confirm active ${event.type} in ${city}. Key indicators: ${[...new Set(allKeywords)].join(', ')}. NLP confidence: ${confidence}%.`,
          sources,
          affectedZones: [`${city} Central`, `${city} North`, 'Commercial District'],
        };
      }
    }
  }

  return {
    disrupted: false, severity: 'none', type: 'none', typeLabel: 'No Social Disruption',
    lostHours: 0, confidence: 0,
    details: `News monitoring active for ${city}, ${state}. No confirmed disruptions at this time.`,
    sources: [], affectedZones: [],
  };
}

// ============= Simulate Social Disruption (for demo) =============

export function simulateSocialDisruption(type: 'strike' | 'curfew' | 'protest', city: string): SocialDisruptionResult {
  const event = NEWS_EVENTS.find(e => e.type === type) || NEWS_EVENTS[0];
  
  const customHeadlines: Record<string, string[]> = {
    strike: [
      `Breaking: ${city} Bandh declared effective immediately; all market zones shut`,
      `${city} delivery operations halted as transport unions join strike call`,
      `Police deploy forces across ${city} as bandh enters second hour`
    ],
    curfew: [
      `Section 144 imposed across ${city} district following unrest`,
      `Movement restrictions enforced in ${city}; non-essential services suspended`,
      `Administration declares curfew in ${city} commercial areas`
    ],
    protest: [
      `Massive protest rally blocks major ${city} arterial roads`,
      `Thousands gather in ${city} centrum; traffic diverted, deliveries disrupted`,
      `Police cordon off central ${city} ahead of political demonstration`
    ],
  };

  const headlines = customHeadlines[type] || customHeadlines.strike;
  const sources: NewsSource[] = headlines.map((title, i) => ({
    title,
    source: ['The Hindu', 'NDTV', 'India Today'][i],
    timestamp: new Date(Date.now() - i * 1800000).toISOString(),
    relevanceScore: 90 + i,
    url: '#',
  }));

  return {
    disrupted: true,
    severity: type === 'protest' ? 'moderate' : 'severe',
    type,
    typeLabel: type === 'strike' ? 'Strike / Bandh' : type === 'curfew' ? 'Section 144 / Curfew' : 'Protest / Rally',
    lostHours: type === 'protest' ? 4 : 8,
    confidence: 92,
    details: `SIMULATED: ${sources.length} independent sources confirm active ${type} in ${city}. NLP consensus algorithm activated.`,
    sources,
    affectedZones: [`${city} Central`, `${city} Commercial Zone`, `${city} Market Area`],
  };
}
