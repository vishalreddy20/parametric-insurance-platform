import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const sets = [
  { actor: 'insurer', org: 1, role: 'insurer' },
  { actor: 'bank', org: 1, role: 'bank' },
  { actor: 'regulator', org: 1, role: 'regulator' },
  { actor: 'zomato', org: 2, role: 'platform', platformId: 'zomato' },
  { actor: 'swiggy', org: 2, role: 'platform', platformId: 'swiggy' },
  ...[1, 2, 3].map((index) => ({ actor: 'oracle-' + index, org: 2, role: 'oracle', oracleId: 'oracle-' + index })),
];

const openssl = (...args) => execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'ignore'] });

async function run() {
  const runtime = process.env.DRUNIX_RUNTIME;
  const output = process.env.PARASHIELD_RUNTIME_IDENTITY_DIR;
  const seed = process.env.PARASHIELD_RUNTIME_MASTER;
  if (!runtime || !output || !seed || !/^[a-fA-F0-9]{64}$/.test(seed)) {
    throw new Error('Set DRUNIX_RUNTIME, PARASHIELD_RUNTIME_IDENTITY_DIR and PARASHIELD_RUNTIME_MASTER.');
  }
  const root = resolve(output);
  const organizations = resolve(runtime, 'drunix-network/test-network/organizations/peerOrganizations');
  await mkdir(root, { mode: 0o700 });
  const identities = {};
  const principals = [];
  const accessCode = (username) => createHmac('sha256', Buffer.from(seed, 'hex')).update('login:' + username).digest('hex');
  for (const { actor, org, role, platformId, oracleId } of sets) {
    const domain = 'org' + org + '.example.com';
    const directory = join(organizations, domain);
    const caDirectory = join(directory, 'ca');
    const keys = (await readdir(caDirectory)).filter((name) => name.endsWith('_sk'));
    if (keys.length !== 1) throw new Error('The sample CA signing key could not be located.');
    const actorDir = join(root, actor);
    await mkdir(actorDir, { mode: 0o700 });
    const privateKey = join(actorDir, 'signing.key');
    const certificate = join(actorDir, 'client.pem');
    const request = join(actorDir, 'client.csr');
    const extensions = join(actorDir, 'extensions.cnf');
    const attrs = { role, ...(platformId && { platformId }), ...(oracleId && { oracleId }) };
    const encoded = Buffer.from(JSON.stringify({ attrs })).toString('hex').match(/../g).join(':');
    await writeFile(extensions, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n' +
      'subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n1.2.3.4.5.6.7.8.1=DER:' + encoded + '\n', { mode: 0o600 });
    openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', privateKey);
    openssl('req', '-new', '-key', privateKey, '-subj', '/OU=client/CN=parashield-' + actor, '-out', request);
    openssl('x509', '-req', '-in', request, '-out', certificate, '-extfile', extensions, '-days', '14', '-sha256',
      '-CA', join(caDirectory, 'ca.' + domain + '-cert.pem'), '-CAkey', join(caDirectory, keys[0]),
      '-set_serial', '0x' + randomBytes(16).toString('hex'));
    await rm(request);
    await rm(extensions);
    identities[actor] = {
      mspId: 'Org' + org + 'MSP', certificate, privateKey,
      tlsCertificate: join(directory, 'tlsca', 'tlsca.' + domain + '-cert.pem'),
      endpoint: org === 1 ? 'localhost:7051' : 'localhost:9051', tlsHost: 'peer0.' + domain,
    };
    if (role === 'bank' || role === 'oracle') {
      principals.push({ username: actor, role, actor, accessCode: accessCode(actor), ...(platformId && { platformId }) });
    }
  }
  identities['event-insurer'] = { ...identities.insurer, endpoint: 'localhost:7061', tlsHost: 'peer1.org1.example.com' };
  await writeFile(join(root, 'gateway-config.json'), JSON.stringify({ identities, principals, insurer: 'insurer', eventActor: 'event-insurer' }),
    { flag: 'wx', mode: 0o600 });
  console.log('SIMULATED identities created in the external runtime directory.');
}

process.umask(0o077);
try {
  await run();
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith('Set DRUNIX_RUNTIME')
    ? error.message : 'Could not create simulated identities. Use a fresh directory and a running cryptogen sample.');
  process.exitCode = 1;
}
