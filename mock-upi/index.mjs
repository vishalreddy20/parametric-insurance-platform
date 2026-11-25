import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { gatewayCallback, mockUPI } from './service.mjs';

const schema = z.object({
  PARASHIELD_GATEWAY_URL: z.url(),
  PARASHIELD_BANK_ACCESS_CODE: z.string().min(16),
  PARASHIELD_UPI_AUTHORIZATION: z.string().min(24),
  PARASHIELD_UPI_STATE_DIR: z.string().min(1),
  PARASHIELD_UPI_PORT: z.coerce.number().int().min(1).max(65535).default(8082),
  PARASHIELD_UPI_LATENCY_MS: z.coerce.number().int().min(0).max(30000).default(100),
  PARASHIELD_UPI_FAILURE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
});
const env = schema.safeParse(process.env);
if (!env.success) {
  console.error(JSON.stringify({ code: 'ERR_MOCK_UPI_ENV', fields: env.error.issues.map((issue) => issue.path.join('.')), simulated: true }));
  process.exit(1);
}

try {
  const settings = env.data;
  const log = (entry) => console.log(JSON.stringify(entry));
  const { app, retryPending } = await mockUPI({
    directory: settings.PARASHIELD_UPI_STATE_DIR, authorization: settings.PARASHIELD_UPI_AUTHORIZATION,
    callback: gatewayCallback(settings.PARASHIELD_GATEWAY_URL, settings.PARASHIELD_BANK_ACCESS_CODE),
    latencyMs: settings.PARASHIELD_UPI_LATENCY_MS, failureBps: settings.PARASHIELD_UPI_FAILURE_BPS, profile: process.env.PARASHIELD_PROFILE === '1', log,
  });
  const server = app.listen(settings.PARASHIELD_UPI_PORT, '127.0.0.1');
  const abort = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { abort.abort(); server.close(); });
  while (!abort.signal.aborted) {
    await retryPending().catch(() => log({ code: 'ERR_MOCK_UPI_RETRY', simulated: true }));
    await delay(1500, undefined, { signal: abort.signal }).catch(() => {});
  }
} catch {
  console.error(JSON.stringify({ code: 'ERR_MOCK_UPI_START', simulated: true }));
  process.exitCode = 1;
}
