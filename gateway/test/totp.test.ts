import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchTotp } from '../src/accounts/totp.js';

test('TOTP matches RFC 6238 SHA-1 vectors with six digits and rejects earlier counters', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(matchTotp(secret, '287082', 59_000, -1), 1);
  assert.equal(matchTotp(secret, '287082', 60_000, -1), 1);
  assert.equal(matchTotp(secret, '287082', 60_000, 1), undefined);
  assert.equal(matchTotp(secret, '287082', 90_000, -1), undefined);
  assert.equal(matchTotp(secret, '000000', 59_000, -1), undefined);
  assert.equal(matchTotp(secret, 'bad', 59_000, -1), undefined);
});
