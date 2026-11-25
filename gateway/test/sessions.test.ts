import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { SqliteAccounts } from '../src/accounts/repository.js';
import { Sessions } from '../src/accounts/sessions.js';

const minute = 60_000;

async function fixture(t: TestContext) {
  const store = new SqliteAccounts(':memory:');
  t.after(() => store.close());
  for (const id of ['a', 'b']) {
    await store.insert({ id, username: id, role: 'admin', passwordHash: 'test-hash', platformId: null, createdAt: 0 });
  }
  let now = 0;
  return { sessions: new Sessions(store, () => now), advance: (minutes: number) => { now += minutes * minute; } };
}

test('rotating refresh invalidates old access and reuse revokes the whole family', async (t) => {
  const { sessions } = await fixture(t);
  const first = await sessions.start('a');
  const parallel = await sessions.start('a');
  assert.notEqual(first.id, parallel.id);
  const authenticated = await sessions.authenticate(first.access);
  assert.ok(authenticated);
  assert.equal(sessions.checkCsrf(authenticated, first.csrf), true);
  assert.equal(sessions.checkCsrf(authenticated, parallel.csrf), false);
  assert.equal((await sessions.refresh(first.refresh, parallel.csrf)).status, 'invalid');
  const second = await sessions.refresh(first.refresh, first.csrf);
  assert.ok(second.access && second.refresh);
  assert.equal(await sessions.authenticate(first.access), undefined);
  assert.equal((await sessions.authenticate(second.access))?.id, first.id);
  assert.equal((await sessions.refresh(first.refresh, first.csrf)).status, 'reuse');
  assert.equal(await sessions.authenticate(second.access), undefined);
  assert.equal((await sessions.refresh(second.refresh, first.csrf)).status, 'invalid');
  assert.ok(await sessions.authenticate(parallel.access));
});

test('access, idle and absolute timeouts apply at their boundaries', async (t) => {
  const { sessions, advance } = await fixture(t);
  const idle = await sessions.start('a');
  advance(5);
  assert.equal(await sessions.authenticate(idle.access), undefined);
  advance(10);
  assert.equal((await sessions.refresh(idle.refresh, idle.csrf)).status, 'invalid');
  const active = await sessions.start('a');
  let refresh = active.refresh;
  for (let elapsed = 10; elapsed < 480; elapsed += 10) {
    advance(10);
    const renewed = await sessions.refresh(refresh, active.csrf);
    assert.ok(renewed.refresh);
    refresh = renewed.refresh;
  }
  advance(10);
  assert.equal((await sessions.refresh(refresh, active.csrf)).status, 'invalid');
});

test('session revocation is scoped by account', async (t) => {
  const { sessions } = await fixture(t);
  const first = await sessions.start('a');
  const second = await sessions.start('a');
  const other = await sessions.start('b');
  await sessions.revoke('b', first.id);
  assert.ok(await sessions.authenticate(first.access));
  await sessions.revoke('a', first.id);
  assert.equal(await sessions.authenticate(first.access), undefined);
  assert.ok(await sessions.authenticate(second.access));
  await sessions.revoke('a');
  assert.equal(await sessions.authenticate(second.access), undefined);
  assert.ok(await sessions.authenticate(other.access));
});
