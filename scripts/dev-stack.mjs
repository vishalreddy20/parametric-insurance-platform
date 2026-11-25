import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const children = new Set();
let stopping = false;
process.umask(0o077);
const log = (message) => console.log(message);
const hex = () => randomBytes(32).toString('hex');

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const force = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 45_000);
  force.unref();
}

function start(label, executable, args, env) {
  const child = spawn(executable, args, { cwd: repo, env, stdio: ['ignore', 'inherit', 'inherit'] });
  children.add(child);
  child.once('error', () => {
    console.error(label + ' could not start.');
    process.exitCode = 1;
    stop();
  });
  child.once('exit', (status) => {
    children.delete(child);
    if (!stopping) {
      console.error(label + ' exited with status ' + status + '.');
      process.exitCode = 1;
      stop();
    }
  });
}

async function main() {
  if (!process.env.DRUNIX_RUNTIME) throw new Error('Set DRUNIX_RUNTIME to the writable running sample checkout.');
  const statePath = process.env.PARASHIELD_RUNTIME_STATE ?? process.env.PARASHIELD_DEMO_STATE;
  const dir = statePath ? resolve(statePath) : await mkdtemp(join(tmpdir(), 'parashield-stack-'));
  if (dir.startsWith(resolve(repo) + '/') || dir === resolve(repo)) {
    throw new Error('Use a runtime state directory outside the repository.');
  }
  const state = join(dir, 'ledger-data');
  const identityDir = join(dir, 'msp');
  const keysPath = join(state, 'runtime-keys.json');
  const configPath = join(identityDir, 'gateway-config.json');
  await mkdir(state, { recursive: true, mode: 0o700 });
  let keys;
  try {
    keys = JSON.parse(await readFile(keysPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    keys = { master: process.env.PARASHIELD_RUNTIME_MASTER ?? hex(), jwt: hex(), salt: hex(), upi: hex() };
    await writeFile(keysPath, JSON.stringify(keys), { flag: 'wx', mode: 0o600 });
  }
  try {
    await readFile(configPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const command = spawnSync(process.execPath, ['scripts/runtime-identities.mjs'], {
      cwd: repo, stdio: 'inherit',
      env: { ...process.env, PARASHIELD_RUNTIME_IDENTITY_DIR: identityDir, PARASHIELD_RUNTIME_MASTER: keys.master },
    });
    if (command.status !== 0) throw new Error('Simulated identity provisioning failed.');
  }
  const port = process.env.PARASHIELD_GATEWAY_PORT ?? '8080';
  const oraclePort = process.env.PARASHIELD_ORACLE_PORT ?? '8081';
  const upiPort = process.env.PARASHIELD_UPI_PORT ?? '8082';
  const browserPort = process.env.PARASHIELD_WEB_PORT ?? '5173';
  const gateway = 'http://127.0.0.1:' + port;
  const accessCode = (user) => createHmac('sha256', Buffer.from(keys.master, 'hex')).update('login:' + user).digest('hex');
  const common = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG,
    PARASHIELD_GATEWAY_URL: gateway };
  start('Gateway', process.execPath, ['gateway/dist/src/index.js'], {
    ...common,
    PARASHIELD_GATEWAY_PORT: port,
    ...Object.fromEntries(['PARASHIELD_PROFILE', 'PARASHIELD_EVALUATE_TIMEOUT_MS', 'PARASHIELD_PAGE_SIZE', 'PARASHIELD_FANOUT_CONCURRENCY',
      'PARASHIELD_SETTLEMENT_CONCURRENCY', 'PARASHIELD_WORKER_POLL_MS'].filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]])),
    PARASHIELD_GATEWAY_CONFIG: configPath,
    PARASHIELD_GATEWAY_STATE_DIR: join(state, 'gateway'),
    PARASHIELD_ACCOUNT_DB: process.env.PARASHIELD_ACCOUNT_DB ?? join(state, 'gateway', 'accounts.sqlite'),
    ...(process.env.PARASHIELD_PASSWORD_PEPPER && { PARASHIELD_PASSWORD_PEPPER: process.env.PARASHIELD_PASSWORD_PEPPER }),
    PARASHIELD_JWT_KEY: keys.jwt,
    PARASHIELD_PII_SALT_KEY: keys.salt,
    PARASHIELD_ORIGIN: 'http://127.0.0.1:' + browserPort,
    PARASHIELD_UPI_URL: 'http://127.0.0.1:' + upiPort,
    PARASHIELD_ORACLE_URL: 'http://127.0.0.1:' + oraclePort,
    PARASHIELD_UPI_AUTHORIZATION: 'Bearer ' + keys.upi,
    ...(process.env.PARASHIELD_BENCHMARK_REPORT && { PARASHIELD_BENCHMARK_REPORT: process.env.PARASHIELD_BENCHMARK_REPORT }),
  });
  start('Oracle simulation', process.execPath, ['oracles/dist/index.js'], {
    ...common, PARASHIELD_ORACLE_PORT: oraclePort,
    PARASHIELD_ORACLE_1_ACCESS_CODE: accessCode('oracle-1'),
    PARASHIELD_ORACLE_2_ACCESS_CODE: accessCode('oracle-2'),
    PARASHIELD_ORACLE_3_ACCESS_CODE: accessCode('oracle-3'),
  });
  start('Mock UPI', process.execPath, ['mock-upi/index.mjs'], {
    ...common, PARASHIELD_UPI_PORT: upiPort, PARASHIELD_PROFILE: process.env.PARASHIELD_PROFILE ?? '0',
    PARASHIELD_UPI_STATE_DIR: join(state, 'mock-upi'),
    PARASHIELD_UPI_AUTHORIZATION: 'Bearer ' + keys.upi,
    PARASHIELD_BANK_ACCESS_CODE: accessCode('bank'),
    PARASHIELD_UPI_FAILURE_BPS: process.env.PARASHIELD_UPI_FAILURE_BPS ?? '0',
    PARASHIELD_UPI_LATENCY_MS: process.env.PARASHIELD_UPI_LATENCY_MS ?? '100',
  });
  if (process.env.PARASHIELD_SERVICES_ONLY !== '1') {
    start('Frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', browserPort, '--strictPort'], {
      ...common, VITE_GATEWAY_URL: gateway,
    });
    log('ParaShield frontend: http://127.0.0.1:' + browserPort);
  }
  log('SIMULATED credentials manifest: ' + configPath);
  log('Runtime state: ' + dir);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
try {
  await main();
} catch (error) {
  console.error(error instanceof Error && /^(Set DRUNIX|Use a runtime|Simulated identity)/.test(error.message)
    ? error.message : 'The application stack could not start. Check external state and the running sample.');
  process.exitCode = 1;
  stop();
}
