import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CommitError, StatusCode } from '@hyperledger/fabric-gateway';
import { createApp } from '../src/app.js';
import type { Principal, ServiceAuthentication } from '../src/auth.js';
import { ApiError, ledgerFailure, retry } from '../src/errors.js';
import { retryableLedgerError, type Ledger, type Options } from '../src/ledger.js';
import { Checkpoints, Fanout } from '../src/worker.js';

test('retry is capped and delays use jitter, validation does not retry', async () => {
  let calls = 0;
  const waits: number[] = [];
  const value = await retry(async () => {
    if (++calls < 4) throw new Error('temporary');
    return 'done';
  }, () => true, () => {}, async (ms) => { waits.push(ms); }, () => 1);
  assert.equal(value, 'done');
  assert.deepEqual(waits, [150, 300, 600]);
  await assert.rejects(retry(async () => {
    throw new ApiError('ERR_VALIDATION', 400, 'invalid');
  }, retryableLedgerError, () => assert.fail('validation was retried')));
  const mvcc = new CommitError({ code: StatusCode.MVCC_READ_CONFLICT, transactionId: 'tx' });
  assert(retryableLedgerError(mvcc));
  assert.equal(ledgerFailure(new Error('ERR_VALIDATION: private input')).message, 'The ledger rejected the input.');
});

test('HTTP routes enforce worker ownership, schema validation and role scope', async (context) => {
  const calls: { actor: string; name: string }[] = [];
  const payoutId = 'a'.repeat(64);
  const foreignPayoutId = 'b'.repeat(64);
  const txId = 'c'.repeat(64);
  let configVersion = 4;
  const ledger: Ledger = {
    async evaluate<T>(actor: string, name: string, args?: string[]) {
      calls.push({ actor, name });
      const id = args?.[0];
      if (name === 'PayoutContract:GetPayout') {
        return { policyId: id === foreignPayoutId ? 'worker-b' : 'worker-a', txId } as T;
      }
      if (name === 'ConfigContract:GetConfig') return { version: configVersion, standard: { cap: 100000 } } as T;
      return { id, term: 1, status: 'PENDING_PREMIUM', configVersion: 4, terms: { tier: 'standard',
        workerId: id, platform: id === 'worker-b' ? 'swiggy' : 'zomato', premiumPaise: 18000,
      } } as T;
    },
    async submit<T>(actor: string, name: string, options?: Options) {
      calls.push({ actor, name });
      assert(!JSON.stringify(options?.arguments).includes('SYNTHETIC PHONE'));
      assert(Buffer.from(options?.transientData?.workerPII ?? []).toString().includes('SYNTHETIC PHONE'));
      return { result: { id: 'worker-a' } as T, txId: 'tx', blockNumber: '2' };
    },
  };
  const accessCode = 'test-only-access-code';
  const principals = new Map<string, Principal>([
    ['worker-a', { username: 'worker-a', role: 'worker', actor: 'platform-a', workerId: 'worker-a',
      policyId: 'worker-a', platformId: 'zomato' }],
    ['platform-a', { username: 'platform-a', role: 'platform', actor: 'platform-a', platformId: 'zomato' }],
    ['regulator', { username: 'regulator', role: 'regulator', actor: 'regulator' }],
  ]);
  const auth: ServiceAuthentication = {
    async authenticate(authorization) {
      const principal = principals.get(authorization?.slice(7) ?? '');
      if (!principal) throw new ApiError('ERR_AUTHENTICATION', 401, 'Sign in required.');
      return principal;
    },
    async login() { throw new Error('The fixture injects authenticated principals directly.'); },
  };
  const logs: Record<string, unknown>[] = [];
  const server = createApp({ ledger, auth, saltKey: Buffer.alloc(32), readinessActor: 'insurer',
    settlementEnabled: false, findProof: async () => ({ blockNumber: '2' }), simulatePremium: async (payment) => payment, log: (entry) => logs.push(entry) }).listen(0, '127.0.0.1');
  context.after(() => { server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const post = (token?: string, payload?: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: JSON.stringify(payload ?? {}),
  });
  const token = 'worker-a';
  assert.equal((await fetch(base + '/v1/readings', post(token))).status, 403);
  assert.equal((await fetch(base + '/v1/policies/other', { headers: { Authorization: 'Bearer ' + token } })).status, 403);
  const invalid = await fetch(base + '/v1/policies', post(token, { policyId: 'other' }));
  assert.equal(invalid.status, 400);
  const error = await invalid.json();
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'requestId']);
  assert.equal(error.requestId, invalid.headers.get('x-request-id'));
  const response = await fetch(base + '/v1/policies', post(token, {
    policyId: 'worker-a', workerId: 'worker-a', zone: 'mumbai', tier: 'standard',
    weeklyIncomePaise: 300000, weeklyMinutes: 2400, premiumPaise: 18000,
    worker: { phone: 'SYNTHETIC PHONE', identity: 'SIMULATED', bank: 'SIMULATED' },
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{ actor: 'platform-a', name: 'PolicyContract:CreatePolicy' }]);
  const platformToken = 'platform-a';
  const get = (path: string, credential: string) => fetch(base + path, { headers: { Authorization: 'Bearer ' + credential } });
  assert.equal((await get('/v1/policies/worker-a', token)).status, 200);
  const coverage = '/v1/policies/worker-a/coverage';
  assert.deepEqual(await (await get(coverage, token)).json(), { weeklyCapPaise: 100000 });
  configVersion = 5;
  assert.deepEqual(await (await get(coverage, token)).json(), { weeklyCapPaise: null });
  assert.equal((await get('/v1/policies/worker-b/coverage', token)).status, 403);
  assert.equal((await get(coverage, platformToken)).status, 403);
  assert.equal((await get('/v1/policies/worker-a/payouts', platformToken)).status, 200);
  for (const suffix of ['', '/payouts', '/claims']) {
    assert.equal((await get('/v1/policies/worker-b' + suffix, platformToken)).status, 403);
  }
  assert.equal((await fetch(base + '/v1/policies/worker-b/premium-simulation', post(platformToken))).status, 403);
  assert.equal((await fetch(base + '/v1/policies/worker-a/premium-simulation', post(platformToken))).status, 200);
  const proof = '/v1/ledger-proof/' + txId;
  assert.equal((await get(proof, token)).status, 403);
  assert.equal((await get(proof + '?payoutId=' + payoutId, token)).status, 200);
  assert.equal((await get(proof + '?payoutId=' + foreignPayoutId, token)).status, 403);
  assert.equal((await get(proof + '?payoutId=' + foreignPayoutId, platformToken)).status, 403);
  assert.equal((await get('/v1/ledger-proof/' + 'd'.repeat(64) + '?payoutId=' + payoutId, token)).status, 403);
  assert.equal((await get('/v1/payouts/' + payoutId, 'regulator')).status, 403);
  assert.equal((await get('/v1/policies/worker-a', 'regulator')).status, 403);
  assert.equal((await get('/v1/summary/bangalore', 'regulator')).status, 403);
  assert.equal((await get(proof, 'regulator')).status, 200);

  assert(!JSON.stringify(logs).includes('SYNTHETIC PHONE'));
  assert(!JSON.stringify(logs).includes(accessCode));
});

test('restart replays unfinished fan-out and resumes the saved page', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'gateway-checkpoint-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const job = { kind: 'fanout' as const, key: 'mumbai|severe_storm|1763985600', zone: 'mumbai', notBefore: 1, bookmark: '' };
  let state = await Checkpoints.open(directory);
  await state.enqueue(job);
  const cursors: string[] = [];
  const finished = new Set<string>();
  let failOnce = true;
  let active = 0;
  let peak = 0;
  const ledger: Ledger = {
    async evaluate<T>(_actor: string, _name: string, args?: string[]) {
      const bookmark = args?.at(-1) ?? '';
      cursors.push(bookmark);
      return (bookmark ? { policies: [{ id: '9' }], bookmark: '' }
        : { policies: Array.from({ length: 9 }, (_, i) => ({ id: String(i) })), bookmark: 'next' }) as T;
    },
    async submit<T>(_actor: string, _name: string, options?: Options) {
      active++;
      peak = Math.max(peak, active);
      try {
        const id = options?.arguments?.[1] ?? '';
        await new Promise((resolve) => setImmediate(resolve));
        if (id === '3' && failOnce) { failOnce = false; throw new Error('simulated crash'); }
        finished.add(id);
        return { result: {} as T, txId: 'tx', blockNumber: '5' };
      } finally { active--; }
    },
  };
  let worker = new Fanout(ledger, 'insurer', state, undefined, () => {});
  await assert.rejects(worker.process(job));
  state = await Checkpoints.open(directory);
  worker = new Fanout(ledger, 'insurer', state, undefined, () => {});
  for await (const pending of state.pending()) await worker.process(pending);
  for await (const pending of state.pending()) await worker.process(pending);
  for await (const _pending of state.pending()) assert.fail('job was not marked complete');
  assert.deepEqual(cursors, ['', '', 'next']);
  assert.equal(finished.size, 10);
  assert.equal(peak, 5);
});

test('bounded settlement lane progresses while a reservation page awaits commit', { timeout: 3000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'gateway-lanes-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const state = await Checkpoints.open(directory);
  await state.enqueue({ kind: 'fanout', key: 'mumbai|severe_storm|1763985600', zone: 'mumbai', notBefore: 1, bookmark: '' });
  await state.enqueue({ kind: 'settlement', key: 'a'.repeat(64), amountPaise: 100 });
  let reserveStarted!: () => void;
  let settlementFinished!: () => void;
  const reserved = new Promise<void>((resolve) => { reserveStarted = resolve; });
  const settled = new Promise<void>((resolve) => { settlementFinished = resolve; });
  const abort = new AbortController();
  context.after(() => abort.abort());
  const ledger: Ledger = {
    async evaluate<T>() { return { policies: [{ id: 'one' }], bookmark: '' } as T; },
    async submit<T>() {
      reserveStarted();
      await settled;
      abort.abort();
      return { result: {} as T, txId: 'tx', blockNumber: '1' };
    },
  };
  const worker = new Fanout(ledger, 'insurer', state, async () => {
    await reserved;
    settlementFinished();
  }, () => {}, { pageSize: 10, fanout: 1, settlement: 1, pollMs: 50 });
  await worker.run(abort.signal);
  for await (const _job of state.pending()) assert.fail("unfinished job");
});
