import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const gateway = process.env.PARASHIELD_GATEWAY_URL;
const oracle = 'http://127.0.0.1:' + process.env.PARASHIELD_ORACLE_PORT;
const upi = process.env.PARASHIELD_UPI_URL;
const seed = Buffer.from(process.env.PARASHIELD_DEMO_MASTER, 'hex');
const zones = ['mumbai', 'chennai', 'hyderabad', 'delhi', 'pune', 'lucknow', 'ahmedabad', 'jaipur', 'kolkata', 'bangalore'];

async function call(base, endpoint, body, token, status = 200) {
  const response = await fetch(base + endpoint, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(100_000),
  });
  const result = await response.json();
  assert.equal(response.status, status, endpoint + ': ' + (result.code ?? 'wrong status'));
  return result;
}
async function login(username) {
  const accessCode = createHmac('sha256', seed).update('login:' + username).digest('hex');
  return (await call(gateway, '/v1/login', { username, accessCode })).token;
}

for (const [base, endpoint] of [[upi, '/health'], [oracle, '/health'], [gateway, '/ready']]) {
  let ok = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await call(base, endpoint); ok = true; break; } catch {}
    await delay(500);
  }
  assert(ok, 'Service did not become ready: ' + endpoint);
}

const [admin, platform] = await Promise.all([login('insurer'), login('zomato')]);
await call(oracle, '/v1/simulations', { zone: 'mumbai' }, platform, 403);
const start = Math.floor(Date.now() / 3_600_000) * 3600;
const availableZones = [];
for (const zone of zones) {
  const { records } = await call(gateway, '/v1/events/' + zone + '?size=100', undefined, admin);
  if (!records.some(({ eventKey }) => eventKey === [zone, 'severe_storm', start].join('|'))) availableZones.push(zone);
  if (availableZones.length === 3) break;
}
assert.equal(availableZones.length, 3, 'The current hour needs three unused demo zones.');
for (const [index, mode] of ['normal', 'offline', 'disagree'].entries()) {
  const zone = availableZones[index];
  const result = await call(oracle, '/v1/simulations', { zone, scenario: 'storm', mode }, admin);
  assert.equal(result.simulated, true);
  assert.equal(result.event.status, 'DECLARED');
  assert.equal(result.readings.length, mode === 'offline' ? 2 : 3);
  assert.equal(new Set(result.readings.map(({ oracleId }) => oracleId)).size, result.readings.length);
  assert.equal(new Set(result.readings.map(({ txId }) => txId)).size, result.readings.length);
  if (mode === 'offline') assert.equal(result.offlineOracle, 'oracle-3');
  if (mode === 'disagree') assert(result.event.readings.some(({ oracleId, breach }) => oracleId === 'oracle-3' && !breach));
  console.log('SIMULATED storm ' + mode + ': DECLARED with ' + result.readings.length + ' authenticated submissions.');
}

const id = 'services-' + randomUUID();
await call(gateway, '/v1/policies', {
  policyId: id, workerId: id, zone: availableZones[0], tier: 'basic', weeklyIncomePaise: 400000,
  weeklyMinutes: 2400, premiumPaise: 20000,
  worker: { identity: 'SIMULATED worker', phone: 'SIMULATED phone', bank: 'SIMULATED bank' },
}, platform, 201);
const path = '/v1/policies/' + id + '/premium-simulation';
const premium = await call(gateway, path, {}, platform);
assert.equal(premium.simulated, true);
assert.equal(premium.callbackStatus, 'DELIVERED');
assert.equal(premium.status, 'PAID');
assert.deepEqual(await call(gateway, path, {}, platform), premium);
assert.equal((await call(gateway, '/v1/policies/' + id, undefined, platform)).status, 'ACTIVE');
console.log('SIMULATED premium collection: idempotent payment and committed DRUNIX callback.');
