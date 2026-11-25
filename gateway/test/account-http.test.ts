import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { AccountHttp } from '../src/accounts/http.js';
import { Mfa } from '../src/accounts/mfa.js';
import { PasswordHasher } from '../src/accounts/password.js';
import { SqliteAccounts } from '../src/accounts/repository.js';
import { Sessions } from '../src/accounts/sessions.js';
import { createApp } from '../src/app.js';
import { ServiceAuth } from '../src/auth.js';
import type { Ledger } from '../src/ledger.js';

function authenticatorCode(setupKey: string, now: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...setupKey].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((chunk) => Number.parseInt(chunk, 2)));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', key).update(message).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

test('browser account endpoints enforce CSRF, MFA enrolment, replay, rotation, role and ownership', async (t) => {
  const password = 'Copper paddles orbit zebra cliffs!';
  const store = new SqliteAccounts(':memory:');
  t.after(() => store.close());
  const hasher = await PasswordHasher.create();
  await store.insert({ id: 'insurer-account', username: 'insurer-a', role: 'insurer', platformId: null,
    passwordHash: await hasher.hash(password), createdAt: Date.now() });
  const origin = 'http://127.0.0.1:5173';
  const now = Date.now();
  const accounts = new AccountHttp({ store, hasher, origin, requestKey: Buffer.alloc(32, 2), mfa: new Mfa(store, Buffer.alloc(32, 1), () => now),
    sessions: new Sessions(store) });
  const ledger: Ledger = {
    async evaluate<T>(actor: string, _operation: string, ids?: string[]) {
      return { id: ids?.[0], terms: { workerId: ids?.[0], platform: actor } } as T;
    },
    async submit<T>() { return { result: {} as T, txId: 'test', blockNumber: '2' }; },
  };
  const auth = new ServiceAuth([], Buffer.alloc(32));
  const server = createApp({ accounts, auth, ledger, corsOrigin: origin, saltKey: Buffer.alloc(32), readinessActor: 'insurer',
    settlementEnabled: false }).listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port + '/v1';
  function browser() {
    const jar = new Map<string, string>();
    let csrf = '';
    async function send(path: string, body?: unknown, useCsrf = true, useOrigin = origin, registrationKey?: string) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: useOrigin, ...(registrationKey && { 'Idempotency-Key': registrationKey }), Cookie: [...jar].map(([name, value]) => name + '=' + value).join('; '),
          ...(body !== undefined && { 'Content-Type': 'application/json', ...(useCsrf && { 'X-CSRF-Token': csrf }) }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const headers = response.headers.getSetCookie();
      for (const entry of headers) {
        assert.match(entry, /HttpOnly/);
        assert.match(entry, /SameSite=Strict/);
        const pair = entry.split(';', 1)[0];
        const separator = pair.indexOf('=');
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      csrf = jar.get('ps_csrf') ?? '';
      return response;
    }
    return { jar, send };
  }
  const staff = browser();
  const staffCredentials = { username: 'insurer-a', password };
  assert.equal((await staff.send('/auth/login', staffCredentials, false)).status, 403);
  assert.equal((await staff.send('/auth/csrf', undefined, true, 'https://other.example')).status, 403);
  assert.equal((await staff.send('/auth/csrf')).status, 200);
  assert.equal((await staff.send('/login', { username: 'legacy-insurer', password })).status, 404);
  const enroll = await staff.send('/auth/login', staffCredentials);
  assert.equal(enroll.status, 202);
  assert.equal((await staff.send('/auth/session')).status, 401);
  const { setupKey } = await enroll.json();
  const code = authenticatorCode(setupKey, now);
  const factor = { code, recovery: false };
  const bad = code === '000000' ? '111111' : '000000';
  assert.equal((await staff.send('/auth/login', { ...staffCredentials, mfa: { ...factor, code: bad } })).status, 401);
  const staffLogin = await staff.send('/auth/login', { ...staffCredentials, mfa: factor });
  assert.equal(staffLogin.status, 200);
  const { recoveryCodes, role } = await staffLogin.json();
  assert.equal(role, 'insurer');
  assert.equal(recoveryCodes.length, 10);
  assert.equal((await staff.send('/auth/login', { ...staffCredentials, mfa: factor })).status, 401);
  const recover = browser();
  await recover.send('/auth/csrf');
  const recovery = { code: recoveryCodes[0], recovery: true };
  assert.equal((await recover.send('/auth/login', { ...staffCredentials, mfa: recovery })).status, 200);
  assert.equal((await recover.send('/auth/login', { ...staffCredentials, mfa: recovery })).status, 401);
  const oldRefresh = staff.jar.get('ps_refresh')!;
  assert.equal((await staff.send('/auth/refresh', {})).status, 204);
  assert.notEqual(staff.jar.get('ps_refresh'), oldRefresh);
  staff.jar.set('ps_refresh', oldRefresh);
  assert.equal((await staff.send('/auth/refresh', {})).status, 401);
  assert.equal((await staff.send('/auth/session')).status, 401);
  assert.equal((await recover.send('/auth/session')).status, 200);

  const worker = browser();
  await worker.send('/auth/csrf');
  const credentials = { username: 'worker-a', password, platformId: 'zomato' };
  const registrationKey = randomUUID();
  assert.equal((await worker.send('/auth/register', credentials)).status, 400);
  assert.equal((await worker.send('/auth/register', { ...credentials, role: 'admin' }, true, origin, registrationKey)).status, 400);
  const register = (body: unknown = credentials, key = registrationKey) =>
    worker.send('/auth/register', body, true, origin, key);
  const concurrent = await Promise.all([register(), register()]);
  assert.deepEqual(concurrent.map((response) => response.status), [201, 201]);
  assert.equal((await register()).status, 201);
  assert.equal((await register({ ...credentials, platformId: 'swiggy' })).status, 409);
  assert.equal((await register({ ...credentials, password: 'Unique alternative password!' })).status, 409);
  assert.equal((await register(credentials, randomUUID())).status, 409);
  const workerLogin = await worker.send('/auth/login', { username: credentials.username, password });
  assert.equal(workerLogin.status, 200);
  const session = await workerLogin.json();
  assert.equal(session.role, 'worker');
  const directoryPassword = await hasher.hash(password);
  for (const [name, role, platformId] of [
    ['platform-z', 'platform', 'zomato'],
    ['other-worker', 'worker', 'swiggy'],
    ['admin-z', 'admin', null],
  ] as const) {
    assert(await store.insert({ id: randomUUID(), username: name, role, platformId, passwordHash: directoryPassword, createdAt: Date.now() }));
  }
  const staffBrowser = async (name: string) => {
    const client = browser();
    await client.send('/auth/csrf');
    const creds = { username: name, password };
    const setup = await client.send('/auth/login', creds);
    assert.equal(setup.status, 202);
    const { setupKey } = await setup.json();
    assert.equal((await client.send('/auth/login', { ...creds,
      mfa: { recovery: false, code: authenticatorCode(setupKey, now) } })).status, 200);
    return client;
  };
  const platform = await staffBrowser('platform-z');
  const admin = await staffBrowser('admin-z');
  assert.equal((await worker.send('/auth/directory')).status, 403);
  const scoped = await (await platform.send('/auth/directory')).json();
  assert.deepEqual(scoped.records, [{ id: session.workerId, username: credentials.username, role: 'worker', platformId: 'zomato' }]);
  const provision = { username: 'new-regulator', password, role: 'regulator', platformId: null };
  assert.equal((await platform.send('/auth/admin/provision', provision)).status, 403);
  assert.equal((await admin.send('/auth/admin/provision', provision, false)).status, 403);
  assert.equal((await admin.send('/auth/admin/provision', { ...provision, role: 'worker' })).status, 400);
  assert.equal((await admin.send('/auth/admin/provision', provision)).status, 201);
  const directory = await (await admin.send('/auth/directory')).json();
  assert(directory.records.some((entry: { username: string }) => entry.username === provision.username));
  assert(directory.records.every((entry: Record<string, unknown>) => !('passwordHash' in entry)));
  const draft = { step: 1, name: 'Test Worker', phone: '9876543210', upi: 'testing@sample',
    zone: 'mumbai', income: '5000', hours: '40', tier: 'standard' };
  assert.equal((await recover.send('/auth/onboarding')).status, 403);
  assert.equal((await worker.send('/auth/onboarding', draft, false)).status, 403);
  assert.equal((await worker.send('/auth/onboarding', { ...draft, txId: 'client-written' })).status, 400);
  assert.equal((await worker.send('/auth/onboarding', draft)).status, 204);
  const storedDraft = await store.onboarding(session.workerId);
  assert(storedDraft?.draft);
  assert(!storedDraft.draft.includes(draft.phone) && !storedDraft.draft.includes(draft.upi));
  assert.deepEqual(await (await worker.send('/auth/onboarding')).json(), { draft, confirmation: null });
  const committed = await worker.send('/policies', {
    policyId: session.policyId, workerId: session.workerId, zone: draft.zone, tier: draft.tier,
    weeklyIncomePaise: 500000, weeklyMinutes: 2400, premiumPaise: 30000,
    worker: { identity: draft.name, phone: draft.phone, bank: draft.upi },
  });
  assert.equal(committed.status, 201);
  assert.deepEqual(await (await worker.send('/auth/onboarding')).json(), { draft: null, confirmation: { txId: 'test', blockNumber: '2' } });
  assert.equal((await worker.send('/auth/onboarding', draft)).status, 409);
  assert.equal((await worker.send('/policies/' + session.policyId)).status, 200);
  assert.equal((await worker.send('/policies/another-worker')).status, 403);
  assert.equal((await worker.send('/metrics')).status, 403);
  const other = browser();
  await other.send('/auth/csrf');
  assert.equal((await other.send('/auth/login', { username: credentials.username, password })).status, 200);
  const staffSecurity = await (await recover.send('/auth/security')).json();
  const workerSecurity = await (await worker.send('/auth/security')).json();
  assert.equal(staffSecurity.authenticatorEnrolled, true);
  assert.equal(workerSecurity.authenticatorEnrolled, false);
  assert.equal(workerSecurity.sessions.length, 2);
  assert.equal(workerSecurity.sessions.filter((entry: { current: boolean }) => entry.current).length, 1);
  for (const entry of workerSecurity.sessions) assert.deepEqual(Object.keys(entry).sort(), ['absoluteExpiresAt', 'current', 'id', 'idleExpiresAt']);
  const otherId = workerSecurity.sessions.find((entry: { current: boolean }) => !entry.current).id;
  const currentId = workerSecurity.sessions.find((entry: { current: boolean }) => entry.current).id;
  assert.equal((await worker.send('/auth/security/revoke', { sessionId: otherId }, false)).status, 403);
  assert.equal((await worker.send('/auth/security/revoke', { sessionId: currentId })).status, 400);
  assert.equal((await worker.send('/auth/security/revoke', { sessionId: staffSecurity.sessions[0].id })).status, 204);
  assert.equal((await recover.send('/auth/session')).status, 200);
  assert.equal((await worker.send('/auth/security/revoke', { sessionId: otherId })).status, 204);
  assert.equal((await other.send('/auth/session')).status, 401);
  assert.equal((await other.send('/auth/login', { username: credentials.username, password })).status, 200);
  assert.equal((await worker.send('/auth/logout-everywhere', {}, false)).status, 403);
  assert.equal((await worker.send('/auth/logout-everywhere', {})).status, 204);
  assert.equal((await worker.send('/auth/session')).status, 401);
  assert.equal((await other.send('/auth/session')).status, 401);

  assert.equal((await worker.send('/auth/csrf')).status, 200);
  assert.equal((await worker.send('/auth/login', { username: credentials.username, password })).status, 200);
  assert.equal((await other.send('/auth/login', { username: credentials.username, password })).status, 200);
  const changedPassword = 'Another iris lighthouse in spirals!';
  const change = { currentPassword: password, newPassword: changedPassword };
  assert.equal((await worker.send('/auth/security/password', change, false)).status, 403);
  assert.equal((await worker.send('/auth/security/password', { ...change, currentPassword: 'wrong' })).status, 400);
  assert.equal((await worker.send('/auth/security/password', change)).status, 204);
  assert.equal((await other.send('/auth/session')).status, 401);
  assert.equal((await other.send('/auth/refresh', {})).status, 401);
  await worker.send('/auth/csrf');
  assert.equal((await worker.send('/auth/login', { username: credentials.username, password })).status, 401);
  assert.equal((await worker.send('/auth/login', { username: credentials.username, password: changedPassword })).status, 200);
  const resetTarget = { accountId: session.workerId };
  assert.equal((await platform.send('/auth/admin/reset-code', resetTarget)).status, 403);
  assert.equal((await admin.send('/auth/admin/reset-code', resetTarget, false)).status, 403);
  const issued = await (await admin.send('/auth/admin/reset-code', resetTarget)).json();
  const resetter = browser();
  await resetter.send('/auth/csrf');
  const resetBody = { code: issued.code, newPassword: password };
  assert.equal((await resetter.send('/auth/reset-password', resetBody, false)).status, 403);
  assert.equal((await resetter.send('/auth/reset-password', resetBody)).status, 204);
  assert.equal((await worker.send('/auth/session')).status, 401);
  await resetter.send('/auth/csrf');
  assert.equal((await resetter.send('/auth/reset-password', resetBody)).status, 400);
  assert.equal((await resetter.send('/auth/login', { username: credentials.username, password })).status, 200);

  assert.equal((await platform.send('/auth/audit')).status, 403);
  assert.equal((await worker.send('/auth/audit')).status, 401);
  const audit = await (await admin.send('/auth/audit')).json();
  assert(audit.records.some((entry: { action: string }) => entry.action === 'PASSWORD_RESET'));
  assert(audit.records.some((entry: { action: string }) => entry.action === 'MFA_ENROLLED'));
  for (const record of audit.records) {
    assert.deepEqual(Object.keys(record).sort(), ['action', 'at', 'id', 'requestId', 'role']);
  }
  const throttled = browser();
  await throttled.send('/auth/csrf');
  const attempt = (username: string) => throttled.send('/auth/login', { username, password: 'wrong' });
  const first = await attempt('worker-a');
  const unknown = await attempt('unknown-worker');
  assert.equal(first.status, 401);
  assert.equal(unknown.status, 401);
  const { code: firstCode, message: firstMessage } = await first.json();
  const { code: unknownCode, message: unknownMessage } = await unknown.json();
  assert.deepEqual([firstCode, firstMessage], [unknownCode, unknownMessage]);
  for (let count = 1; count < 8; count++) assert.equal((await attempt('worker-a')).status, 401);
  const locked = await attempt('WORKER-A');
  assert.equal(locked.status, 423);
  assert.equal((await locked.json()).code, 'ERR_ACCOUNT_LOCKED');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  let limited: Response | undefined;
  for (let count = 0; count < 30; count++) {
    const response = await attempt('other-' + count);
    if (response.status === 429) { limited = response; break; }
    assert.equal(response.status, 401);
  }
  assert.ok(limited);
  assert.equal((await limited.json()).code, 'ERR_RATE_LIMIT');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
