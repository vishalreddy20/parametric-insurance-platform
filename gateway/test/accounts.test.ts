import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SqliteAccounts, type Account } from '../src/accounts/repository.js';

test('the migrated account store survives reopening and rejects duplicate usernames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'parashield-accounts-'));
  try {
    const path = join(directory, 'accounts.sqlite');
    const account: Account = {
      id: 'first', username: 'worker-a', role: 'worker',
      passwordHash: 'test-hash', platformId: 'zomato', createdAt: 123,
    };
    const store = new SqliteAccounts(path);
    try {
      assert.equal(await store.insert(account), true);
      assert.equal(await store.insert({ ...account, id: 'second', username: 'Worker-A' }), false);
    } finally {
      store.close();
    }
    const reopened = new SqliteAccounts(path);
    try {
      assert.deepEqual(await reopened.findByUsername('Worker-A'), account);
      assert.equal(await reopened.findByUsername('missing'), undefined);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
