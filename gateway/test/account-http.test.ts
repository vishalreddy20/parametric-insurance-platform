import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { AccountHttp } from '../src/accounts/http.js';
import { Mfa } from '../src/accounts/mfa.js';
import { PasswordHasher } from '../src/accounts/password.js';
import { SqliteAccounts } from '../src/accounts/repository.js';
import { Sessions } from '../src/accounts/sessions.js';
import { createApp } from '../src/app.js';
import { DemoAuth } from '../src/auth.js';
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
  const accessCode = 'Copper paddles orbit zebra cliffs!';
  const store = new SqliteAccounts(':memory:');
  t.after(() => store.close());
  const hasher = await PasswordHasher.create();
  await store.insert({ id: 'insurer-account', username: 'insurer-a', role: 'insurer', platformId: null,
    passwordHash: await hasher.hash(accessCode), createdAt: Date.now() });
  const origin = 'http://127.0.0.1:5173';
  const now = Date.now();
  const accounts = new AccountHttp({ store, hasher, origin, mfa: new Mfa(store, Buffer.alloc(32, 1), () => now),
    sessions: new Sessions(store) });
  const ledger: Ledger = {
    async evaluate<T>(actor: string, _operation: string, ids?: string[]) {
      return { id: ids?.[0], terms: { workerId: ids?.[0], platform: actor } } as T;
    },
    async submit<T>() { return { result: {} as T, txId: 'test', blockNumber: '2' }; },
  };
  const auth = new DemoAuth([{ role: 'insurer', username: 'legacy-insurer', actor: 'insurer', accessCode }], Buffer.alloc(32));
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
    async function send(path: string, body?: unknown, useCsrf = true, useOrigin = origin) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: useOrigin, Cookie: [...jar].map(([name, value]) => name + '=' + value).join('; '),
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
  const staffCredentials = { username: 'insurer-a', accessCode };
  assert.equal((await staff.send('/auth/login', staffCredentials, false)).status, 403);
  assert.equal((await staff.send('/auth/csrf', undefined, true, 'https://other.example')).status, 403);
  assert.equal((await staff.send('/auth/csrf')).status, 200);
  assert.equal((await staff.send('/login', { username: 'legacy-insurer', accessCode })).status, 401);
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
  const credentials = { username: 'worker-a', accessCode, platformId: 'zomato' };
  assert.equal((await worker.send('/auth/register', { ...credentials, role: 'admin' })).status, 400);
  assert.equal((await worker.send('/auth/register', credentials)).status, 201);
  const workerLogin = await worker.send('/auth/login', { username: credentials.username, accessCode });
  assert.equal(workerLogin.status, 200);
  const session = await workerLogin.json();
  assert.equal(session.role, 'worker');
  assert.equal((await worker.send('/policies/' + session.policyId)).status, 200);
  assert.equal((await worker.send('/policies/another-worker')).status, 403);
  assert.equal((await worker.send('/metrics')).status, 403);
  assert.equal((await worker.send('/auth/logout-everywhere', {}, false)).status, 403);
  assert.equal((await worker.send('/auth/logout-everywhere', {})).status, 204);
  assert.equal((await worker.send('/auth/session')).status, 401);
});
