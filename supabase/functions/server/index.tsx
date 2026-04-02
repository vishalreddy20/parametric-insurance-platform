import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENWEATHER_API_KEY',
  'NEWS_API_KEY',
  'ADMIN_API_KEY',
  'RAZORPAY_WEBHOOK_SECRET',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !Deno.env.get(name));
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required server env vars: ${missingEnvVars.join(', ')}`);
}

function normalizeClientIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const first = raw.split(',')[0]?.trim() || 'unknown';
  if (first.length > 64) return 'unknown';
  return /^[a-fA-F0-9:.]+$/.test(first) ? first : 'unknown';
}

function secureStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyRazorpaySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const digest = hexFromBuffer(signed);
  return secureStringEqual(digest, signature);
}

function parseNumericCoordinate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWebhookTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  // Accept both epoch seconds and epoch milliseconds.
  return raw < 1e12 ? raw * 1000 : raw;
}

function parseEventTimestampMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return parseWebhookTimestampMs(value);
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function extractAccessToken(c: any): string | null {
  const auth = c.req.header('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

function getDeviceFingerprint(c: any): string {
  const ua = c.req.header('user-agent') || 'unknown-ua';
  const lang = c.req.header('accept-language') || 'unknown-lang';
  const ip = normalizeClientIp(c.req.header('x-forwarded-for') || c.req.header('x-real-ip'));
  return `${ua}|${lang}|${ip}`;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const processedWebhookEvents = new Map<string, number>();
const WEBHOOK_REPLAY_WINDOW_MS = 10 * 60 * 1000;

function purgeRateLimitStore(now: number): void {
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function purgeProcessedWebhookEvents(now: number): void {
  for (const [key, seenAt] of processedWebhookEvents.entries()) {
    if (now - seenAt > WEBHOOK_REPLAY_WINDOW_MS) {
      processedWebhookEvents.delete(key);
    }
  }
}

function enforceRateLimit(c: any, scope: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  purgeRateLimitStore(now);
  const ip = normalizeClientIp(c.req.header('x-forwarded-for') || c.req.header('x-real-ip'));
  const key = `${scope}:${ip}`;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    c.header('Retry-After', String(retryAfterSec));
    return c.json({ error: 'Too many requests', retryAfterSec }, 429);
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return null;
}

function validateSignupBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Invalid request body';

  const { email, password, name, weeklyIncome, weeklyHours } = body;

  if (!email || !password || !name || !weeklyIncome || !weeklyHours) {
    return 'Missing required fields';
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return 'Invalid email format';
  }

  if (typeof password !== 'string' || password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  if (!Number.isFinite(Number(weeklyIncome)) || Number(weeklyIncome) <= 0) {
    return 'Invalid weeklyIncome value';
  }

  if (!Number.isFinite(Number(weeklyHours)) || Number(weeklyHours) <= 0) {
    return 'Invalid weeklyHours value';
  }

  return null;
}

function validateSubscribeBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Invalid request body';
  const tier = body.tier;
  if (typeof tier !== 'string' || !['basic', 'standard', 'premium'].includes(tier)) {
    return 'Invalid subscription tier';
  }
  return null;
}

function validateCheckDisruptionBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Invalid request body';
  const lat = parseNumericCoordinate(body.latitude);
  const lon = parseNumericCoordinate(body.longitude);

  if (lat === null || lon === null) return 'Missing location data';
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'Invalid coordinate range';

  if (body.timestamp !== undefined) {
    const ts = parseEventTimestampMs(body.timestamp);
    if (!ts || Math.abs(Date.now() - ts) > 7 * 24 * 60 * 60 * 1000) {
      return 'Invalid timestamp';
    }
  }

  return null;
}

function validateWebhookBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Invalid request body';
  if (typeof body.event !== 'string' || body.event.length === 0) {
    return 'Invalid webhook event';
  }
  return null;
}

function requireAdminAuth(c: any) {
  const expectedToken = Deno.env.get('ADMIN_API_KEY');
  const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const headerToken = c.req.header('x-admin-token');
  const providedToken = headerToken || bearer;

  if (!expectedToken || !providedToken || !secureStringEqual(providedToken, expectedToken)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return null;
}

app.use('/make-server-0a99cdba/signup', async (c, next) => {
  const limited = enforceRateLimit(c, 'signup', 10, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use('/make-server-0a99cdba/subscribe', async (c, next) => {
  const limited = enforceRateLimit(c, 'subscribe', 20, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use('/make-server-0a99cdba/check-disruption', async (c, next) => {
  const limited = enforceRateLimit(c, 'check-disruption', 30, 60 * 1000);
  if (limited) return limited;
  await next();
});

app.use('/make-server-0a99cdba/webhook/razorpay', async (c, next) => {
  const limited = enforceRateLimit(c, 'webhook-razorpay', 120, 60 * 1000);
  if (limited) return limited;
  await next();
});

// ==================== UTILITY FUNCTIONS ====================

// Calculate hourly income from weekly data
function calculateHourlyIncome(weeklyIncome: number, weeklyHours: number): number {
  return weeklyHours > 0 ? weeklyIncome / weeklyHours : 0;
}

// Calculate minimum payout floor
function calculateMinimumPayout(weeklyIncome: number): number {
  return Math.max(50, weeklyIncome * 0.01);
}

// Calculate payout amount
function calculatePayout(
  hourlyIncome: number,
  lostHours: number,
  planFactor: number,
  minimumPayout: number
): number {
  const calculatedPayout = hourlyIncome * lostHours * planFactor;
  return Math.max(minimumPayout, calculatedPayout);
}

// Fraud detection: IP geolocation validation
async function validateIPGeolocation(
  clientIP: string,
  reportedLat: number,
  reportedLon: number
): Promise<{ valid: boolean; distance: number }> {
  try {
    // Using ip-api.com for IP geolocation (free tier). Always use HTTPS.
    const response = await fetch(`https://ip-api.com/json/${clientIP}`);
    if (!response.ok) {
      return { valid: true, distance: 0 };
    }
    const ipData = await response.json();

    if (ipData.status !== 'success') {
      return { valid: false, distance: -1 };
    }

    // Calculate distance between IP location and reported GPS
    const distance = calculateDistance(
      ipData.lat,
      ipData.lon,
      reportedLat,
      reportedLon
    );

    // Flag if distance > 50km (suspicious VPN/spoofing)
    return { valid: distance <= 50, distance };
  } catch (error) {
    console.error('IP geolocation validation error:', error);
    return { valid: true, distance: 0 }; // Default to valid on error
  }
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate velocity between location updates
function calculateVelocity(
  lat1: number,
  lon1: number,
  timestamp1: number,
  lat2: number,
  lon2: number,
  timestamp2: number
): number {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  const timeDiff = Math.abs(timestamp2 - timestamp1) / 3600; // Convert to hours
  return timeDiff > 0 ? distance / timeDiff : 0;
}

// Risk scoring algorithm
function calculateRiskScore(factors: {
  ipValid: boolean;
  ipDistance: number;
  velocity: number;
  claimFrequency: number;
  deviceFingerprintChanged: boolean;
}): number {
  let score = 0;

  // IP validation (0-30 points)
  if (!factors.ipValid) score += 30;
  else if (factors.ipDistance > 20) score += 15;

  // Impossible velocity (0-25 points)
  if (factors.velocity > 100) score += 25; // >100 km/h suspicious
  else if (factors.velocity > 60) score += 15;

  // Claim frequency (0-20 points)
  if (factors.claimFrequency > 5) score += 20; // >5 claims per week
  else if (factors.claimFrequency > 3) score += 10;

  // Device fingerprint anomalies (0-25 points)
  if (factors.deviceFingerprintChanged) score += 25;

  return Math.min(score, 100);
}

// ==================== WEATHER ORACLE FUNCTIONS ====================

async function checkWeatherDisruption(lat: number, lon: number): Promise<{
  disrupted: boolean;
  severity: 'none' | 'moderate' | 'severe';
  type: string;
  lostHours: number;
}> {
  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    console.error('OPENWEATHER_API_KEY not configured');
    return { disrupted: false, severity: 'none', type: '', lostHours: 0 };
  }

  try {
    // Get current weather
    const weatherResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );
    const weatherData = await weatherResponse.json();

    // Check extreme heat (>45°C)
    if (weatherData.main && weatherData.main.temp > 45) {
      return {
        disrupted: true,
        severity: 'severe',
        type: 'extreme_heat',
        lostHours: 4 // Estimated 4 hours lost during peak heat
      };
    }

    // Check for rainfall in last 24h using OneCall API
    const oneCallResponse = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );

    if (oneCallResponse.ok) {
      const oneCallData = await oneCallResponse.json();

      // Check for heavy rain alerts
      if (oneCallData.alerts && oneCallData.alerts.length > 0) {
        for (const alert of oneCallData.alerts) {
          if (alert.event.toLowerCase().includes('rain') ||
              alert.event.toLowerCase().includes('storm') ||
              alert.event.toLowerCase().includes('cyclone')) {
            return {
              disrupted: true,
              severity: 'severe',
              type: 'severe_weather',
              lostHours: 6
            };
          }
        }
      }

      // Check hourly rainfall accumulation
      if (oneCallData.hourly) {
        let totalRain = 0;
        for (let i = 0; i < Math.min(24, oneCallData.hourly.length); i++) {
          if (oneCallData.hourly[i].rain && oneCallData.hourly[i].rain['1h']) {
            totalRain += oneCallData.hourly[i].rain['1h'];
          }
        }

        // Severe disruption: >60mm/day
        if (totalRain > 60) {
          return {
            disrupted: true,
            severity: 'severe',
            type: 'heavy_rainfall',
            lostHours: 5
          };
        }

        // Moderate disruption: 45-60mm/day
        if (totalRain > 45) {
          return {
            disrupted: true,
            severity: 'moderate',
            type: 'moderate_rainfall',
            lostHours: 3
          };
        }
      }
    }

    return { disrupted: false, severity: 'none', type: '', lostHours: 0 };

  } catch (error) {
    console.error('Weather API error:', error);
    return { disrupted: false, severity: 'none', type: '', lostHours: 0 };
  }
}

// ==================== SOCIAL DISRUPTION ORACLE ====================

async function checkSocialDisruption(city: string, state: string): Promise<{
  disrupted: boolean;
  type: string;
  lostHours: number;
  confidence: number;
}> {
  const apiKey = Deno.env.get('NEWS_API_KEY');
  if (!apiKey) {
    console.error('NEWS_API_KEY not configured');
    return { disrupted: false, type: '', lostHours: 0, confidence: 0 };
  }

  try {
    // Search for disruption keywords in local news
    const keywords = ['curfew', 'strike', 'bandh', 'riot', 'section 144', 'zone closure', 'protest'];
    const query = `${city} OR ${state} AND (${keywords.join(' OR ')})`;

    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`
    );

    if (!response.ok) {
      console.error('News API error:', response.status);
      return { disrupted: false, type: '', lostHours: 0, confidence: 0 };
    }

    const newsData = await response.json();

    if (!newsData.articles || newsData.articles.length === 0) {
      return { disrupted: false, type: '', lostHours: 0, confidence: 0 };
    }

    // Score-based heuristic for confidence
    let confidenceScore = 0;
    let detectedType = '';

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    for (const article of newsData.articles) {
      const publishedAt = new Date(article.publishedAt).getTime();

      // Only consider articles from last 24 hours
      if (publishedAt < oneDayAgo) continue;

      const text = `${article.title} ${article.description || ''}`.toLowerCase();

      // Check for disruption keywords
      if (text.includes('curfew')) {
        confidenceScore += 30;
        detectedType = 'curfew';
      }
      if (text.includes('strike') || text.includes('bandh')) {
        confidenceScore += 25;
        if (!detectedType) detectedType = 'strike';
      }
      if (text.includes('section 144')) {
        confidenceScore += 35;
        detectedType = 'curfew';
      }
      if (text.includes('riot') || text.includes('protest')) {
        confidenceScore += 20;
        if (!detectedType) detectedType = 'civil_unrest';
      }

      // Check for present tense (active event)
      if (text.includes('imposed') || text.includes('declared') || text.includes('ongoing')) {
        confidenceScore += 15;
      }
    }

    // Threshold: 50+ confidence score = confirmed disruption
    if (confidenceScore >= 50) {
      return {
        disrupted: true,
        type: detectedType,
        lostHours: 8, // Full day disruption for social events
        confidence: Math.min(confidenceScore, 100)
      };
    }

    return { disrupted: false, type: '', lostHours: 0, confidence: confidenceScore };

  } catch (error) {
    console.error('Social disruption detection error:', error);
    return { disrupted: false, type: '', lostHours: 0, confidence: 0 };
  }
}

// ==================== API ROUTES ====================

// Health check
app.get('/make-server-0a99cdba/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// User signup
app.post('/make-server-0a99cdba/signup', async (c) => {
  try {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const validationError = validateSignupBody(body);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const { email, password, name, phone, weeklyIncome, weeklyHours, city, state } = body;

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, phone },
      // Automatically confirm email since email server not configured
      email_confirm: true
    });

    if (authError) {
      console.error('Auth signup error:', authError);
      return c.json({ error: authError.message }, 400);
    }

    // Store user profile in KV store
    const userId = authData.user.id;
    const userProfile = {
      userId,
      email,
      name,
      phone,
      weeklyIncome,
      weeklyHours,
      city,
      state,
      subscriptionTier: 'none',
      subscriptionStatus: 'inactive',
      createdAt: new Date().toISOString(),
      totalPayouts: 0,
      claimCount: 0,
      riskScore: 0
    };

    await kv.set(`user:${userId}`, userProfile);

    return c.json({
      success: true,
      userId,
      message: 'Account created successfully'
    });

  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

// Subscribe to a plan
app.post('/make-server-0a99cdba/subscribe', async (c) => {
  try {
    const accessToken = extractAccessToken(c);
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const validationError = validateSubscribeBody(body);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const { tier } = body; // 'basic', 'standard', 'premium'

    // Get user profile
    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Calculate premium
    const premiumRates = { basic: 0.05, standard: 0.07, premium: 0.10 };
    const weeklyPremium = userProfile.weeklyIncome * premiumRates[tier];

    // Update subscription status
    userProfile.subscriptionTier = tier;
    userProfile.subscriptionStatus = 'active';
    userProfile.weeklyPremium = weeklyPremium;
    userProfile.subscriptionStartDate = new Date().toISOString();

    await kv.set(`user:${user.id}`, userProfile);

    return c.json({
      success: true,
      tier,
      weeklyPremium: Math.round(weeklyPremium * 100) / 100,
      message: 'Subscription activated successfully'
    });

  } catch (error) {
    console.error('Subscription error:', error);
    return c.json({ error: 'Internal server error during subscription' }, 500);
  }
});

// Submit location for disruption check
app.post('/make-server-0a99cdba/check-disruption', async (c) => {
  try {
    const accessToken = extractAccessToken(c);
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const validationError = validateCheckDisruptionBody(body);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const { latitude, longitude, timestamp } = body;

    const lat = parseNumericCoordinate(latitude);
    const lon = parseNumericCoordinate(longitude);

    if (lat === null || lon === null) {
      return c.json({ error: 'Missing location data' }, 400);
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return c.json({ error: 'Invalid coordinate range' }, 400);
    }

    const clientTs = parseEventTimestampMs(timestamp) ?? Date.now();
    if (!Number.isFinite(clientTs) || Math.abs(Date.now() - clientTs) > 7 * 24 * 60 * 60 * 1000) {
      return c.json({ error: 'Invalid timestamp' }, 400);
    }

    const deviceFingerprint = getDeviceFingerprint(c);

    // Get user profile
    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile || userProfile.subscriptionStatus !== 'active') {
      return c.json({ error: 'No active subscription' }, 403);
    }

    // Check for disruptions
    const weatherDisruption = await checkWeatherDisruption(lat, lon);
    const socialDisruption = await checkSocialDisruption(userProfile.city, userProfile.state);

    const isDisrupted = weatherDisruption.disrupted || socialDisruption.disrupted;

    if (!isDisrupted) {
      return c.json({
        disrupted: false,
        message: 'No active disruptions in your area'
      });
    }

    // Fraud detection
    const clientIP = normalizeClientIp(c.req.header('x-forwarded-for') || c.req.header('x-real-ip'));
    const ipValidation = await validateIPGeolocation(clientIP, lat, lon);

    // Check velocity (get last location)
    const lastLocation = await kv.get(`location:${user.id}`);
    let velocity = 0;
    if (lastLocation) {
      velocity = calculateVelocity(
        lastLocation.latitude,
        lastLocation.longitude,
        lastLocation.timestamp,
        lat,
        lon,
        clientTs
      );
    }

    // Calculate risk score
    const riskScore = calculateRiskScore({
      ipValid: ipValidation.valid,
      ipDistance: ipValidation.distance,
      velocity,
      claimFrequency: userProfile.claimCount || 0,
      deviceFingerprintChanged: Boolean(
        userProfile.lastDeviceFingerprint && userProfile.lastDeviceFingerprint !== deviceFingerprint
      )
    });

    // Risk-based decision
    if (riskScore >= 70) {
      return c.json({
        error: 'Claim rejected due to high fraud risk',
        riskScore
      }, 403);
    }

    if (riskScore >= 30) {
      // Flag for manual review
      await kv.set(`flagged:${user.id}:${Date.now()}`, {
        userId: user.id,
        latitude: lat,
        longitude: lon,
        riskScore,
        weatherDisruption,
        socialDisruption,
        timestamp: new Date().toISOString()
      });

      return c.json({
        disrupted: true,
        status: 'under_review',
        riskScore,
        message: 'Your claim is under review'
      });
    }

    // Calculate payout
    const hourlyIncome = calculateHourlyIncome(userProfile.weeklyIncome, userProfile.weeklyHours);
    const lostHours = Math.max(weatherDisruption.lostHours, socialDisruption.lostHours);
    const planFactors = { basic: 0.8, standard: 1.0, premium: 1.2 };
    const planFactor = planFactors[userProfile.subscriptionTier];
    const minimumPayout = calculateMinimumPayout(userProfile.weeklyIncome);

    const payoutAmount = calculatePayout(hourlyIncome, lostHours, planFactor, minimumPayout);

    // Weekly cap check
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weeklyPayouts = await kv.getByPrefix(`payout:${user.id}:${weekStart.toISOString().split('T')[0]}`);
    const weeklyTotal = weeklyPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

    const weeklyCap = userProfile.subscriptionTier === 'premium' ? 1500 : 1000;
    if (weeklyTotal + payoutAmount > weeklyCap) {
      return c.json({
        error: 'Weekly payout cap reached',
        cap: weeklyCap,
        currentTotal: weeklyTotal
      }, 403);
    }

    // Store payout record
    const payoutId = `payout:${user.id}:${Date.now()}`;
    const payoutRecord = {
      userId: user.id,
      amount: Math.round(payoutAmount * 100) / 100,
      disruptionType: weatherDisruption.disrupted ? weatherDisruption.type : socialDisruption.type,
      severity: weatherDisruption.severity,
      lostHours,
      latitude: lat,
      longitude: lon,
      riskScore,
      status: 'approved',
      timestamp: new Date().toISOString()
    };

    await kv.set(payoutId, payoutRecord);

    // Update user stats
    userProfile.totalPayouts = (userProfile.totalPayouts || 0) + payoutRecord.amount;
    userProfile.claimCount = (userProfile.claimCount || 0) + 1;
    userProfile.lastClaimDate = new Date().toISOString();
    userProfile.lastDeviceFingerprint = deviceFingerprint;
    await kv.set(`user:${user.id}`, userProfile);

    // Store current location for velocity checks
    await kv.set(`location:${user.id}`, {
      latitude: lat,
      longitude: lon,
      timestamp: clientTs
    });

    return c.json({
      disrupted: true,
      status: 'approved',
      payout: payoutRecord.amount,
      disruptionType: payoutRecord.disruptionType,
      lostHours,
      message: `Payout of ₹${payoutRecord.amount} approved and will be processed shortly`
    });

  } catch (error) {
    console.error('Disruption check error:', error);
    return c.json({ error: 'Internal server error during disruption check' }, 500);
  }
});

// Get user profile
app.get('/make-server-0a99cdba/profile', async (c) => {
  try {
    const accessToken = extractAccessToken(c);
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    // Get recent payouts
    const payouts = await kv.getByPrefix(`payout:${user.id}:`);
    const recentPayouts = payouts.slice(-10).reverse();

    return c.json({
      profile: userProfile,
      recentPayouts
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Admin: Get all users
app.get('/make-server-0a99cdba/admin/users', async (c) => {
  try {
    const authError = requireAdminAuth(c);
    if (authError) return authError;

    const users = await kv.getByPrefix('user:');
    return c.json({ users, count: users.length });
  } catch (error) {
    console.error('Admin users fetch error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Admin: Get all flagged claims
app.get('/make-server-0a99cdba/admin/flagged', async (c) => {
  try {
    const authError = requireAdminAuth(c);
    if (authError) return authError;

    const flagged = await kv.getByPrefix('flagged:');
    return c.json({ flagged, count: flagged.length });
  } catch (error) {
    console.error('Admin flagged fetch error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Admin: Get system stats
app.get('/make-server-0a99cdba/admin/stats', async (c) => {
  try {
    const authError = requireAdminAuth(c);
    if (authError) return authError;

    const users = await kv.getByPrefix('user:');
    const payouts = await kv.getByPrefix('payout:');

    const activeUsers = users.filter(u => u.subscriptionStatus === 'active').length;
    const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPremiums = users.reduce((sum, u) => {
      if (u.subscriptionStatus === 'active') {
        return sum + (u.weeklyPremium || 0);
      }
      return sum;
    }, 0);

    return c.json({
      totalUsers: users.length,
      activeSubscriptions: activeUsers,
      totalPayoutsCount: payouts.length,
      totalPayoutsAmount: Math.round(totalPayouts * 100) / 100,
      weeklyPremiumRevenue: Math.round(totalPremiums * 100) / 100,
      poolBalance: Math.round((totalPremiums * 4 - totalPayouts) * 100) / 100 // Estimated 4-week pool
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Webhook: Razorpay payment events
app.post('/make-server-0a99cdba/webhook/razorpay', async (c) => {
  try {
    const rawBody = await c.req.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const validationError = validateWebhookBody(body);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const event = body.event;

    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    const signature = c.req.header('x-razorpay-signature');
    if (!signature || !webhookSecret) {
      return c.json({ error: 'Missing webhook authentication data' }, 401);
    }

    const isValid = await verifyRazorpaySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return c.json({ error: 'Invalid webhook signature' }, 401);
    }

    const eventIdHeader = c.req.header('x-razorpay-event-id');
    const eventTimestampHeader = c.req.header('x-razorpay-event-timestamp');
    const payload = isRecord(body.payload) ? body.payload : null;
    const paymentEntity = payload && isRecord(payload.payment) && isRecord(payload.payment.entity) ? payload.payment.entity : null;
    const payoutEntity = payload && isRecord(payload.payout) && isRecord(payload.payout.entity) ? payload.payout.entity : null;
    const subscriptionEntity = payload && isRecord(payload.subscription) && isRecord(payload.subscription.entity) ? payload.subscription.entity : null;

    const eventId =
      (typeof eventIdHeader === 'string' && eventIdHeader.length > 0 ? eventIdHeader : null) ||
      (paymentEntity && typeof paymentEntity.id === 'string' ? paymentEntity.id : null) ||
      (payoutEntity && typeof payoutEntity.id === 'string' ? payoutEntity.id : null) ||
      (subscriptionEntity && typeof subscriptionEntity.id === 'string' ? subscriptionEntity.id : null);

    if (!eventId) {
      return c.json({ error: 'Missing webhook event id' }, 400);
    }

    const timestampMs = parseEventTimestampMs(
      eventTimestampHeader ?? body.created_at ?? paymentEntity?.created_at ?? payoutEntity?.created_at ?? subscriptionEntity?.created_at
    );
    if (!timestampMs) {
      return c.json({ error: 'Missing webhook timestamp' }, 400);
    }

    const now = Date.now();
    if (Math.abs(now - timestampMs) > WEBHOOK_REPLAY_WINDOW_MS) {
      return c.json({ error: 'Stale webhook timestamp' }, 401);
    }

    purgeProcessedWebhookEvents(now);
    const replayKey = `${event}:${eventId}`;
    if (processedWebhookEvents.has(replayKey)) {
      return c.json({ error: 'Duplicate webhook event' }, 409);
    }

    processedWebhookEvents.set(replayKey, now);

    console.log('Razorpay webhook received:', event);

    // Handle different webhook events
    if (event === 'subscription.charged') {
      // Premium payment successful
      const subscriptionId = subscriptionEntity && typeof subscriptionEntity.id === 'string'
        ? subscriptionEntity.id
        : 'unknown';
      console.log('Subscription charged:', subscriptionId);
    } else if (event === 'payout.processed') {
      // Payout successful
      const payoutId = payoutEntity && typeof payoutEntity.id === 'string' ? payoutEntity.id : 'unknown';
      console.log('Payout processed:', payoutId);
    } else if (event === 'payout.downtime.started') {
      // Banking system down
      console.error('Payout system downtime detected');
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing error' }, 500);
  }
});

// Start server
Deno.serve(app.fetch);
