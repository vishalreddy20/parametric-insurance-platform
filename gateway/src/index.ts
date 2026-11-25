import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createApp } from './app.js';
import { ApiError } from './errors.js';
import { DemoAuth, principalSchema } from './auth.js';
import { FabricLedger } from './ledger.js';
import { callMockUPI, Checkpoints, consumeEvents, Fanout, mockSettlement } from './worker.js';
import { id } from './schema.js';

const configSchema = z.strictObject({
  identities: z.record(id, z.strictObject({
    mspId: id, certificate: z.string().min(1), privateKey: z.string().min(1),
    tlsCertificate: z.string().min(1), endpoint: z.string().min(1), tlsHost: z.string().min(1),
  })),
  principals: z.array(principalSchema).min(1),
  insurer: id,
  eventActor: id,
});
const envSchema = z.object({
  PARASHIELD_GATEWAY_CONFIG: z.string().min(1),
  PARASHIELD_GATEWAY_STATE_DIR: z.string().min(1),
  PARASHIELD_JWT_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  PARASHIELD_PII_SALT_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  PARASHIELD_EVALUATE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(6000),
  PARASHIELD_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  PARASHIELD_FANOUT_CONCURRENCY: z.coerce.number().int().min(1).max(48).default(5),
  PARASHIELD_SETTLEMENT_CONCURRENCY: z.coerce.number().int().min(1).max(48).default(5),
  PARASHIELD_WORKER_POLL_MS: z.coerce.number().int().min(50).max(5000).default(1000),
  PARASHIELD_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PARASHIELD_GATEWAY_HOST: z.string().default('127.0.0.1'),
  PARASHIELD_ORIGIN: z.url().optional(),
  PARASHIELD_ORACLE_URL: z.url().optional(),
  PARASHIELD_BENCHMARK_REPORT: z.string().min(1).optional(),
  PARASHIELD_UPI_URL: z.url().optional(),
  PARASHIELD_UPI_AUTHORIZATION: z.string().min(16).optional(),
});

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), ...fields }));

async function main() {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    log({ action: 'startup_failed', code: 'ERR_GATEWAY_ENV', fields: env.error.issues.map((issue) => issue.path.join('.')) });
    return 1;
  }
  const settings = env.data;
  const config = configSchema.parse(JSON.parse(await readFile(settings.PARASHIELD_GATEWAY_CONFIG, 'utf8')));
  const auth = new DemoAuth(config.principals, Buffer.from(settings.PARASHIELD_JWT_KEY, 'hex'));
  if (!Object.hasOwn(config.identities, config.insurer) || !Object.hasOwn(config.identities, config.eventActor) || config.principals.some(({ actor }) => !Object.hasOwn(config.identities, actor))) {
    throw new Error('Missing role identity.');
  }
  const upiURL = settings.PARASHIELD_UPI_URL;
  const upiAuth = settings.PARASHIELD_UPI_AUTHORIZATION;
  if (Boolean(upiURL) !== Boolean(upiAuth)) throw new Error('Incomplete mock UPI configuration.');
  const state = await Checkpoints.open(settings.PARASHIELD_GATEWAY_STATE_DIR);
  const ledger = await FabricLedger.open(config.identities, 'parashield', 'parashield', settings.PARASHIELD_EVALUATE_TIMEOUT_MS);
  const settlement = upiURL && upiAuth ? mockSettlement(upiURL, upiAuth) : undefined;
  const app = createApp({ ledger, auth, saltKey: Buffer.from(settings.PARASHIELD_PII_SALT_KEY, 'hex'),
    readinessActor: config.insurer, settlementEnabled: Boolean(settlement),
    simulatePremium: upiURL && upiAuth ? (payment) => callMockUPI(upiURL, upiAuth, '/v1/premiums', payment) : undefined,
    corsOrigin: settings.PARASHIELD_ORIGIN,
    deploymentMetrics: () => ledger.metrics(),
    findProof: (id) => state.findProof(id),
    loadBenchmark: async () => {
      if (!settings.PARASHIELD_BENCHMARK_REPORT) return null;
      try {
        return JSON.parse(await readFile(settings.PARASHIELD_BENCHMARK_REPORT, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    runSimulation: settings.PARASHIELD_ORACLE_URL ? async (authorization, body) => {
      try {
        const service = await fetch(new URL('/v1/simulations', settings.PARASHIELD_ORACLE_URL), {
          method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
        });
        if (service.ok) return await service.json();
        await service.body?.cancel();
      } catch {
        // The same zone, hour and scenario are naturally idempotent on the ledger.
      }
      throw new ApiError('ERR_ORACLE_UNAVAILABLE', 503, 'The simulated oracle operation could not be completed.');
    } : undefined,
    log });
  const abort = new AbortController();
  const server = app.listen(settings.PARASHIELD_GATEWAY_PORT, settings.PARASHIELD_GATEWAY_HOST);
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  } catch (error) {
    ledger.close();
    throw error;
  }
  log({ action: 'listening', port: settings.PARASHIELD_GATEWAY_PORT, simulatedIdentities: true });
  const background = Promise.all([
    new Fanout(ledger, config.insurer, state, settlement, log, {
      pageSize: settings.PARASHIELD_PAGE_SIZE, fanout: settings.PARASHIELD_FANOUT_CONCURRENCY,
      settlement: settings.PARASHIELD_SETTLEMENT_CONCURRENCY, pollMs: settings.PARASHIELD_WORKER_POLL_MS,
    }).run(abort.signal),
    consumeEvents(ledger, config.eventActor, state, abort.signal, log),
  ]);
  const shutdown = () => {
    if (abort.signal.aborted) return;
    abort.abort();
    const drained = new Promise<void>((resolve) => { server.close(() => resolve()); });
    const force = setTimeout(() => { server.closeAllConnections(); ledger.close(); }, 20_000);
    force.unref();
    void Promise.allSettled([background, drained]).finally(() => { ledger.close(); clearTimeout(force); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return 0;
}

try {
  process.exitCode = await main();
} catch {
  log({ action: 'startup_failed', code: 'ERR_GATEWAY_START' });
  process.exitCode = 1;
}
