import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { simulateDisruption } from '../../src/app/services/weather-oracle';
import { simulateSocialDisruption } from '../../src/app/services/social-oracle';
import { simulateTrafficDisruption } from '../../src/app/services/traffic-oracle';
import { simulatePlatformDisruption } from '../../src/app/services/platform-oracle';

const environment = z.object({
  PARASHIELD_GATEWAY_URL: z.url(),
  PARASHIELD_ORACLE_1_ACCESS_CODE: z.string().min(16),
  PARASHIELD_ORACLE_2_ACCESS_CODE: z.string().min(16),
  PARASHIELD_ORACLE_3_ACCESS_CODE: z.string().min(16),
  PARASHIELD_ORACLE_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
}).safeParse(process.env);

if (!environment.success) {
  console.error(JSON.stringify({ code: 'ERR_ORACLE_ENV', fields: environment.error.issues.map((issue) => issue.path.join('.')) }));
  process.exit(1);
}
const settings = environment.data;
const codes = [settings.PARASHIELD_ORACLE_1_ACCESS_CODE, settings.PARASHIELD_ORACLE_2_ACCESS_CODE, settings.PARASHIELD_ORACLE_3_ACCESS_CODE];
const scenario = z.strictObject({
  zone: z.enum(['mumbai', 'chennai', 'kolkata', 'delhi', 'hyderabad', 'bangalore', 'pune', 'ahmedabad', 'jaipur', 'lucknow']),
  scenario: z.enum(['storm', 'rainfall', 'heat', 'pollution', 'strike', 'curfew', 'protest', 'gridlock', 'outage', 'dispatch_freeze']).default('storm'),
  mode: z.enum(['normal', 'disagree', 'offline']).default('normal'),
});
type Scenario = z.infer<typeof scenario>;

function baseline({ scenario, zone }: Scenario) {
  switch (scenario) {
    case 'storm': return { triggerType: 'severe_storm', unit: 'km/h', value: simulateDisruption(scenario, zone).weatherData.windSpeed, threshold: 60 };
    case 'rainfall': return { triggerType: 'heavy_rainfall', unit: 'mm/day', value: simulateDisruption(scenario, zone).weatherData.rainAccumulation24h, threshold: 60 };
    case 'heat': return { triggerType: 'extreme_heat', unit: 'celsius', value: simulateDisruption(scenario, zone).weatherData.temperature, threshold: 45 };
    case 'pollution': return { triggerType: 'hazardous_pollution', unit: 'aqi', value: simulateDisruption(scenario, zone).weatherData.aqi, threshold: 300 };
    case 'strike': case 'curfew': case 'protest':
      return { triggerType: scenario, unit: 'confidence', value: simulateSocialDisruption(scenario, zone).confidence, threshold: 50 };
    case 'gridlock': return { triggerType: 'severe_traffic_gridlock', unit: 'score',
      value: simulateTrafficDisruption('gridlock', zone).congestionIndex, threshold: 85 };
    case 'outage': return { triggerType: 'platform_outage', unit: 'score',
      value: simulatePlatformDisruption(scenario, 'Zomato', zone).confidence, threshold: 96 };
    case 'dispatch_freeze': return { triggerType: 'dispatch_degradation', unit: 'score',
      value: simulatePlatformDisruption(scenario, 'Swiggy', zone).confidence, threshold: 90 };
  }
}

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function gateway(path: string, authorization?: string, body?: unknown) {
  const response = await fetch(new URL(path, settings.PARASHIELD_GATEWAY_URL), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(authorization && { Authorization: authorization }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(response.status, 'ERR_GATEWAY_REJECTED');
  }
  return await response.json();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.get('/health', (_request, response) => { response.json({ status: 'ok', simulated: true }); });
app.post('/v1/simulations', async (request, response) => {
  const authorization = request.get('authorization');
  if (!authorization) throw new HttpError(401, 'ERR_AUTHENTICATION');
  const session = await gateway('/v1/session', authorization);
  if (session.role !== 'insurer') throw new HttpError(403, 'ERR_UNAUTHORIZED');
  const parsed = scenario.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'ERR_VALIDATION');

  const input = parsed.data;
  const given = baseline(input);
  const observedAt = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(observedAt / 3600) * 3600;
  const sequence = input.mode === 'disagree' ? [2, 0, 1] : input.mode === 'offline' ? [0, 1] : [0, 1, 2];
  const results = [];
  for (const index of sequence) {
    const username = 'oracle-' + (index + 1);
    const source = await gateway('/v1/login', undefined, { username, accessCode: codes[index] });
    const seed = createHash('sha256').update([username, input.zone, windowStart, given.triggerType].join('|')).digest();
    const noise = seed[0] % 3;
    const value = input.mode === 'disagree' && index === 2
      ? given.threshold - 1 - noise : Math.round(given.value) + noise;
    const transaction = await gateway('/v1/readings', 'Bearer ' + source.token, {
      zone: input.zone, triggerType: given.triggerType, unit: given.unit, value, windowStart, observedAt,
    });
    results.push({ oracleId: username, submittedValue: value, txId: transaction.txId, blockNumber: transaction.blockNumber,
      event: transaction.result, simulated: true });
  }
  const event = results.find(({ event }) => event.status === 'DECLARED')?.event ?? results.at(-1)?.event;
  response.json({ simulated: true, mode: input.mode, offlineOracle: input.mode === 'offline' ? 'oracle-3' : null, event, readings: results });
});
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const code = error instanceof HttpError ? error.code : 'ERR_SIMULATION';
  const status = error instanceof HttpError ? error.status : 503;
  response.status(status).json({ code, message: 'The simulated reading request could not be completed.', requestId: randomUUID(), simulated: true });
});
const server = app.listen(settings.PARASHIELD_ORACLE_PORT, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
