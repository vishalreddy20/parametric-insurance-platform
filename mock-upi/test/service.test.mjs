import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mockUPI } from '../service.mjs';

const authorization = 'Bearer simulated-unit-test-token';
async function bind(t, app) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); });
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
async function request(base, kind, data, header = authorization) {
  const response = await fetch(base + '/v1/' + kind, {
    method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}
const payment = { reference: 'test-premium', policyId: 'demo-policy', term: 1, amountPaise: 20000 };
const payout = { reference: 'test-payout', payoutId: 'a'.repeat(64), amountPaise: 30000 };

test('duplicate concurrent premium requests deliver one callback and reject conflicting data', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mock-upi-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const deliveries = [];
  const { app } = await mockUPI({ directory, authorization, failureBps: 0, latencyMs: 0, callback: async (payment) => { deliveries.push(payment); } });
  const base = await bind(t, app);
  const [one, two] = await Promise.all([request(base, 'premiums', payment), request(base, 'premiums', payment)]);
  assert.deepEqual(one, two);
  assert.equal(one.data.status, 'PAID');
  assert.equal(one.data.simulated, true);
  assert.equal(deliveries.length, 1);
  assert.equal((await request(base, 'premiums', { ...payment, amountPaise: 3 })).status, 409);
  assert.equal((await request(base, 'premiums', payment, 'invalid-auth')).status, 401);
});

test('pending payout callback survives restart and a forced failure stays failed', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mock-upi-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { directory, authorization, failureBps: 10000, latencyMs: 0 };
  const initial = await mockUPI({ ...settings, callback: async () => { throw new Error('temporary disconnect'); } });
  let base = await bind(t, initial.app);
  const first = await request(base, 'payouts', payout);
  assert.equal(first.status, 202);
  assert.equal(first.data.status, 'FAILED');
  const premium = await request(base, 'premiums', payment);
  assert.equal(premium.data.callbackStatus, 'SKIPPED');

  let deliveries = 0;
  const restarted = await mockUPI({ ...settings, failureBps: 0, callback: async () => { deliveries++; } });
  await restarted.retryPending();
  base = await bind(t, restarted.app);
  const replay = await request(base, 'payouts', payout);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.status, 'FAILED');
  assert.equal(replay.data.callbackStatus, 'DELIVERED');
  assert.equal(deliveries, 1);
});
