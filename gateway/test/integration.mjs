import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:' + process.env.PARASHIELD_GATEWAY_PORT;
const master = Buffer.from(process.env.PARASHIELD_DEMO_MASTER, 'hex');

async function call(path, { token, method, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(40_000),
  });
  return { status: response.status, body: await response.json() };
}

async function checked(path, options, status = 200) {
  const response = await call(path, options);
  assert.equal(response.status, status, path + ': ' + (response.body.code ?? 'unexpected status'));
  return response.body;
}

async function login(username) {
  const accessCode = createHmac('sha256', master).update('login:' + username).digest('hex');
  return (await checked('/v1/login', { method: 'POST', body: { username, accessCode } })).token;
}

let ready = false;
for (let attempt = 0; attempt < 15; attempt++) {
  try { ready = (await call('/ready')).status === 200; } catch {}
  if (ready) break;
  await delay(800);
}
assert(ready, 'Fabric Gateway readiness did not pass.');

const [platform, bank, insurer, regulator, oracle, secondOracle] = await Promise.all(
  ['zomato', 'bank', 'insurer', 'regulator', 'oracle-1', 'oracle-2'].map(login),
);
const policyId = 'integration-' + randomUUID();
const create = {
  policyId, workerId: policyId, zone: 'bangalore', tier: 'standard', weeklyIncomePaise: 400000,
  weeklyMinutes: 2400, premiumPaise: 20000,
  worker: { identity: 'SIMULATED identity', phone: 'SIMULATED phone', bank: 'SIMULATED bank' },
};
const enrolled = await checked('/v1/policies', { token: platform, method: 'POST', body: create }, 201);
assert.equal(enrolled.result.status, 'PENDING_PREMIUM');
assert.match(enrolled.blockNumber, /^\d+$/);
const readback = await checked('/v1/policies/' + policyId, { token: platform });
assert.equal(readback.id, policyId);
assert.equal(readback.workerHash, enrolled.result.workerHash);
assert(!JSON.stringify(readback).includes('SIMULATED'));
const replay = await checked('/v1/policies', { token: platform, method: 'POST', body: create }, 201);
assert.deepEqual(replay.result, enrolled.result);
const premium = { policyId, term: 1, amountPaise: 20000, reference: policyId, requestId: policyId };
const confirmed = await checked('/v1/callbacks/premium', { token: bank, method: 'POST', body: premium });
assert.equal(confirmed.result.status, 'ACTIVE');
await checked('/v1/callbacks/premium', { token: oracle, method: 'POST', body: premium }, 403);
const now = Math.floor(Date.now() / 1000);
await checked('/v1/activity', { token: platform, method: 'POST', body: {
  workerId: policyId, platformId: 'zomato', windowStart: now - 120, windowEnd: now - 1, requestId: policyId,
} });
const page = await checked('/v1/summary/bangalore?size=100', { token: insurer });
assert(page.policies.some(({ id }) => id === policyId));
const payouts = await checked('/v1/policies/' + policyId + '/payouts', { token: regulator });
assert.equal(payouts.records.length, 0);
const eventPage = await checked('/v1/events/bangalore', { token: insurer });
assert(Array.isArray(eventPage.records));
const worker = await login('demo-worker');
await checked('/v1/policies/' + policyId, { token: worker }, 403);
await checked('/v1/config', {}, 401);
const cfg = await checked('/v1/config', { token: insurer });
assert.equal(cfg.quorum, 2);
const begin = Math.floor(now / 3600) * 3600;
const zone = 'bangalore';
const available = cfg.triggers.find(({ code }) =>
  !eventPage.records.some(({ eventKey }) => eventKey === [zone, code, begin].join('|')));
assert(available, 'Use an unused zone or wait for the next hour bucket.');
const observation = { zone, triggerType: available.code, value: available.threshold,
  unit: available.unit, windowStart: begin, observedAt: now };
const one = await checked('/v1/readings', { token: oracle, method: 'POST', body: observation });
assert.equal(one.result.status, 'PENDING');
const two = await checked('/v1/readings', { token: secondOracle, method: 'POST', body: observation });
assert.equal(two.result.status, 'DECLARED');
assert.equal(two.result.readings.length, 2);
const checkpointDirectory = process.env.PARASHIELD_GATEWAY_STATE_DIR;
let jobQueued = false;
for (let attempt = 0; attempt < 15; attempt++) {
  const files = await readdir(checkpointDirectory);
  for (const file of files.filter((name) => /^job-.*\.json$/.test(name))) {
    const record = JSON.parse(await readFile(join(checkpointDirectory, file), 'utf8'));
    if (record.job.key === two.result.eventKey) jobQueued = true;
  }
  if (jobQueued) break;
  await delay(500);
}
assert(jobQueued, 'Declared event was not checkpointed for fan-out.');
console.log('DRUNIX Gateway integration passed: enrollment, commit, replay, premium, activity, pagination, roles, quorum and durable event intake.');
