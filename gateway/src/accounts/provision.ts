import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { passwordError, PasswordHasher } from './password.js';
import { accountRoles, SqliteAccounts } from './repository.js';

const input = z.tuple([
  z.enum(accountRoles),
  z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/),
  z.enum(['zomato', 'swiggy']).nullable(),
]);

async function main(): Promise<void> {
  const [roleArg, usernameArg, platformArg, ...extra] = process.argv.slice(2);
  const parsed = input.safeParse([roleArg, usernameArg, platformArg ?? null]);
  if (!parsed.success || extra.length) throw new Error('Invalid role, username or platform.');
  const [role, username, platformId] = parsed.data;
  if ((role === 'platform' || role === 'worker') !== (platformId !== null)) {
    throw new Error('A platform is required for platform and worker accounts only.');
  }
  const path = process.env.PARASHIELD_ACCOUNT_DB;
  if (!path) throw new Error('Set PARASHIELD_ACCOUNT_DB to the SQLite file path.');
  const rawPepper = process.env.PARASHIELD_PASSWORD_PEPPER;
  if (rawPepper !== undefined && !/^[a-fA-F0-9]{64}$/.test(rawPepper)) {
    throw new Error('PARASHIELD_PASSWORD_PEPPER must contain 64 hexadecimal characters.');
  }
  process.stdin.setEncoding('utf8');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 256) throw new Error('Use between 12 and 128 characters.');
  }
  const policyError = passwordError(password, [username]);
  if (policyError) throw new Error(policyError);
  const hasher = await PasswordHasher.create(rawPepper ? Buffer.from(rawPepper, 'hex') : undefined);
  const passwordHash = await hasher.hash(password);
  const store = new SqliteAccounts(path);
  try {
    if (!await store.insert({ id: randomUUID(), username, role, platformId, passwordHash, createdAt: Date.now() })) {
      throw new Error('Could not provision account. Check that the username is available.');
    }
  } finally {
    store.close();
  }
  console.log('Account provisioned.');
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error && error.constructor === Error ? error.message : 'Account provisioning failed.';
  console.error(message);
  process.exitCode = 1;
}
