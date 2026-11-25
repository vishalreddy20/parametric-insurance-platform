import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordError, PasswordHasher } from '../src/accounts/password.js';

test('password policy rejects short, common, and overlong values', () => {
  assert.ok(passwordError('short'));
  assert.ok(passwordError('passwordpassword'));
  assert.ok(passwordError('a'.repeat(129)));
  assert.equal(passwordError('Copper paddles orbit zebra cliffs!'), undefined);
});

test('Argon2id uses unique salts and verifies with the configured pepper', async () => {
  const pepper = Buffer.alloc(32, 1);
  const hasher = await PasswordHasher.create(pepper);
  const password = 'Copper paddles orbit zebra cliffs!';
  const first = await hasher.hash(password);
  const second = await hasher.hash(password);
  assert.match(first, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await hasher.verify(password, first), true);
  assert.equal(await hasher.verify('wrong', first), false);
  assert.equal(await hasher.verify(password), false);
  assert.equal(await (await PasswordHasher.create()).verify(password, first), false);
});
