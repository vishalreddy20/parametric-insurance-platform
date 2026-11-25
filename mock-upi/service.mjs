import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const amount = z.number().int().positive().max(100000000);
const payment = z.strictObject({ reference: id, policyId: id, term: z.number().int().positive(), amountPaise: amount });
const payout = z.strictObject({ reference: id, payoutId: z.string().regex(/^[a-f0-9]{64}$/), amountPaise: amount });
const digest = (value) => createHash('sha256').update(value).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

class ServiceError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function mockUPI({ directory, authorization, callback, latencyMs, failureBps, log = () => {} }) {
  const records = join(directory, 'records');
  const callbacks = join(directory, 'pending');
  await Promise.all([records, callbacks].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  const inFlight = new Map();

  async function atomic(destination, record) {
    const temp = destination + '.' + randomUUID() + '.tmp';
    try {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
      await rename(temp, destination);
      const folder = await open(dirname(destination), 'r');
      try { await folder.sync(); } finally { await folder.close(); }
    } finally {
      await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  async function get(path) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  async function exclusive(filename, work) {
    const previous = inFlight.get(filename);
    const current = (previous ?? Promise.resolve()).catch(() => {}).then(work);
    inFlight.set(filename, current);
    try { return await current; }
    finally { if (inFlight.get(filename) === current) inFlight.delete(filename); }
  }

  async function deliver(record, path, pendingPath) {
    if (record.callbackStatus !== 'PENDING') return record;
    await callback(record);
    const result = { ...record, callbackStatus: 'DELIVERED' };
    await atomic(path, result);
    await unlink(pendingPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    return result;
  }

  async function transact(kind, input) {
    const filename = digest(input.reference).toString('hex') + '.json';
    const path = join(records, filename);
    const pendingPath = join(callbacks, filename);
    const fingerprint = digest(kind + '\0' + JSON.stringify(input)).toString('hex');
    return exclusive(filename, async () => {
      let record = await get(path);
      if (record && record.fingerprint !== fingerprint) throw new ServiceError(409, 'ERR_CONFLICT');
      if (!record) {
        await delay(latencyMs);
        const sample = digest('SIMULATED-UPI:' + input.reference).readUInt32BE(0) % 10000;
        const status = sample < failureBps ? 'FAILED' : kind === 'premium' ? 'PAID' : 'SETTLED';
        record = { ...input, kind, status, simulated: true, fingerprint,
          callbackStatus: kind === 'premium' && status === 'FAILED' ? 'SKIPPED' : 'PENDING' };
        if (record.callbackStatus === 'PENDING') await atomic(pendingPath, true);
        await atomic(path, record);
      }
      try {
        record = await deliver(record, path, pendingPath);
      } catch {
        log({ code: 'ERR_CALLBACK_PENDING', simulated: true });
      }
      const { fingerprint: _fingerprint, ...result } = record;
      return result;
    });
  }

  async function retryPending() {
    for (const filename of (await readdir(callbacks)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
      await exclusive(filename, async () => {
        const path = join(records, filename);
        const pendingPath = join(callbacks, filename);
        const record = await get(path);
        if (record?.callbackStatus === 'PENDING') await deliver(record, path, pendingPath);
        else await unlink(pendingPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }).catch(() => log({ code: 'ERR_CALLBACK_PENDING', simulated: true }));
    }
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.get('/health', (_request, response) => { response.json({ status: 'ok', simulated: true }); });

  for (const [url, kind, schema] of [['/v1/premiums', 'premium', payment], ['/v1/payouts', 'payout', payout]]) {
    app.post(url, async (request, response) => {
      if (!same(request.get('authorization') ?? '', authorization)) throw new ServiceError(401, 'ERR_AUTHENTICATION');
      const { data, success } = schema.safeParse(request.body);
      if (!success) throw new ServiceError(400, 'ERR_VALIDATION');
      const result = await transact(kind, data);
      response.status(result.callbackStatus === 'PENDING' ? 202 : 200).json(result);
    });
  }

  app.use((error, _request, response, _next) => {
    const status = error?.status === 413 || error?.status === 400 ? error.status : error instanceof ServiceError ? error.status : 503;
    const code = error instanceof ServiceError ? error.code : status === 400 || status === 413 ? 'ERR_VALIDATION' : 'ERR_SIMULATED_UPI';
    response.status(status).json({ code, message: 'The simulated payment request could not be completed.', requestId: randomUUID(), simulated: true });
  });

  return { app, retryPending };
}

export function gatewayCallback(url, accessCode) {
  return async (event) => {
    const send = async (path, body, token) => {
      const response = await fetch(new URL(path, url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('The ledger callback was not confirmed.');
      }
      return response.json();
    };
    const { token } = await send('/v1/login', { username: 'bank', accessCode });
    const base = { reference: event.reference, requestId: event.reference };
    if (event.kind === 'premium') {
      await send('/v1/callbacks/premium', { ...base, policyId: event.policyId, amountPaise: event.amountPaise, term: event.term }, token);
    } else {
      await send('/v1/callbacks/settlement', { ...base, payoutId: event.payoutId, status: event.status }, token);
    }
  };
}
