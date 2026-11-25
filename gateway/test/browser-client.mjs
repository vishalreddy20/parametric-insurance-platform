import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PasswordHasher } from '../dist/src/accounts/password.js';
import { SqliteAccounts } from '../dist/src/accounts/repository.js';

export function authenticatorCode(setupKey) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...setupKey].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((chunk) => Number.parseInt(chunk, 2)));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(message).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function browserHeaders(session, mutate) {
  return typeof session === 'string' ? { Authorization: 'Bearer ' + session } : session ? {
    Origin: process.env.PARASHIELD_ORIGIN, Cookie: session.cookie,
    ...(mutate && { 'X-CSRF-Token': session.csrf }),
  } : {};
}

export async function browserLogin(base, role) {
  const origin = process.env.PARASHIELD_ORIGIN;
  const username = 'integration-' + randomUUID();
  const password = randomBytes(32).toString('base64url');
  const hasher = await PasswordHasher.create();
  const store = new SqliteAccounts(process.env.PARASHIELD_ACCOUNT_DB);
  try {
    assert(await store.insert({ id: randomUUID(), username, role,
      platformId: ['worker', 'platform'].includes(role) ? 'zomato' : null,
      passwordHash: await hasher.hash(password), createdAt: Date.now() }));
  } finally {
    store.close();
  }

  const jar = new Map();
  let csrf;
  async function send(path, body) {
    const response = await fetch(base + '/v1/auth/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        Cookie: [...jar].map(([name, value]) => name + '=' + value).join('; '),
        ...(body && { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';', 1)[0].split('=');
      jar.set(name, value);
    }
    return response;
  }
  const csrfResponse = await send('csrf');
  assert.equal(csrfResponse.status, 200, 'Obtain CSRF token');
  csrf = (await csrfResponse.json()).csrfToken;
  let login = await send('login', { username, password });
  if (role !== 'worker') {
    assert.equal(login.status, 202, 'Staff must enrol MFA');
    const setup = await login.json();
    assert.equal(setup.status, 'enrol');
    login = await send('login', { username, password, mfa: { code: authenticatorCode(setup.setupKey), recovery: false } });
  }
  assert.equal(login.status, 200, 'Account authentication');
  const session = await login.json();
  assert.equal(session.role, role);
  return { cookie: [...jar].map(([name, value]) => name + '=' + value).join('; '), csrf: session.csrfToken };
}
