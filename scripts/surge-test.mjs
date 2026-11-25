import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { cpus, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const n = Number(process.argv[2]);
const state = process.env.PARASHIELD_RUNTIME_STATE ?? process.env.PARASHIELD_DEMO_STATE;
const preparedWorker = process.env.PARASHIELD_PREPARE_WORKER;
const runtime = process.env.DRUNIX_RUNTIME;
const gateway = 'http://127.0.0.1:' + (process.env.PARASHIELD_GATEWAY_PORT ?? '8080');
const origin = process.env.PARASHIELD_ORIGIN ?? 'http://127.0.0.1:5173';
const upi = 'http://127.0.0.1:' + (process.env.PARASHIELD_UPI_PORT ?? '8082');
const resultPath = resolve(process.env.PARASHIELD_BENCHMARK_REPORT ?? 'docs/benchmark-latest.json');
const tablePath = resolve(process.env.PARASHIELD_BENCHMARK_TABLE ?? 'docs/BENCHMARKS.md');
const timeout = Number(process.env.PARASHIELD_SURGE_TIMEOUT_SECONDS ?? '1800') * 1000;
const concurrency = Number(process.env.PARASHIELD_SURGE_CONCURRENCY ?? '8');
const zones = ['jaipur', 'ahmedabad', 'lucknow', 'kolkata', 'pune', 'delhi', 'chennai', 'mumbai', 'hyderabad', 'bangalore'];
const run = randomUUID().slice(0, 12);
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; });
const round = (value) => Math.round(value * 100) / 100;
const epoch = () => Math.floor(Date.now() / 1000);
const hourStart = () => Math.floor(epoch() / 3600) * 3600;

function weekOf(seconds) {
  const day = new Date((seconds + 19800) * 1000);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

async function request(path, { token, body, method, base = gateway, authorization, missingOK } = {}, retry = true) {
  const generation = token?.generation;
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(authorization ? { Authorization: authorization } : token?.headers(body !== undefined)),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  if (response.status === 401 && token && retry) {
    await response.body?.cancel();
    await token.renew(generation);
    return request(path, { token, body, method, base, authorization, missingOK }, false);
  }
  const value = await response.json();
  if (missingOK && response.status === 404) return null;
  if (!response.ok) throw new Error(path.split('?')[0] + ' returned HTTP ' + response.status + ' ' + (value?.code ?? ''));
  return value;
}

async function loadAccounts() {
  if (!process.env.PARASHIELD_SURGE_ACCOUNTS) throw new Error('Set PARASHIELD_SURGE_ACCOUNTS to an external account credentials file.');
  const path = await realpath(process.env.PARASHIELD_SURGE_ACCOUNTS);
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const file = await stat(path);
  if (path.startsWith(repository) || !file.isFile() || (file.mode & 0o077) || file.uid !== process.getuid()) {
    throw new Error('The account credentials file must be private, owned by the current user and outside the repository.');
  }
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('The account credentials file could not be read.'); }
}

async function loginAccount(role, credentials) {
  if (typeof credentials?.username !== 'string' || typeof credentials?.password !== 'string' ||
      (role !== 'worker' && (typeof credentials.code !== 'string' || !/^\d{6}$/.test(credentials.code)))) {
    throw new Error('The benchmark needs credentials for a provisioned ' + role + ' account.');
  }
  const jar = new Map();
  let csrf;
  let renewing;
  const session = {
    generation: 0,
    headers(mutate) {
      return { Origin: origin, Cookie: [...jar].map(([name, value]) => name + '=' + value).join('; '),
        ...(mutate && { 'X-CSRF-Token': csrf }) };
    },
    async renew(generation) {
      if (generation !== session.generation) return;
      renewing ??= send('refresh', {}).then(() => { session.generation++; })
        .finally(() => { renewing = undefined; });
      await renewing;
    },
  };
  async function send(route, body) {
    const response = await fetch(gateway + '/v1/auth/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...session.headers(body !== undefined), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 202) throw new Error('Complete MFA enrolment in the browser before running the benchmark.');
    if (!response.ok) throw new Error('Benchmark account ' + route + ' failed with HTTP ' + response.status + '.');
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';', 1)[0].split('=');
      jar.set(name, value);
    }
    if (response.status !== 204) return response.json();
  }
  csrf = (await send('csrf')).csrfToken;
  const account = await send('login', {
    username: credentials.username, password: credentials.password,
    ...(role !== 'worker' && { mfa: { code: credentials.code, recovery: false } }),
  });
  if (account.role !== role) throw new Error('The benchmark account has an unexpected role.');
  csrf = account.csrfToken;
  return { ...session, account, get generation() { return session.generation; } };
}

async function mapLimit(items, size, callback) {
  let next = 0;
  const workers = Array.from({ length: Math.min(items.length, size) }, async () => {
    while (next < items.length && !interrupted) {
      const index = next++;
      await callback(items[index], index);
    }
  });
  const results = await Promise.allSettled(workers);
  const error = results.find((result) => result.status === 'rejected');
  if (error) throw error.reason;
  if (interrupted) throw new Error('The benchmark was interrupted.');
}

function readEnvironment() {
  const command = (name, args) => execFileSync(name, args, { encoding: 'utf8' }).trim();
  const names = command('docker', ['ps', '--format', '{{.Names}}']).split('\n');
  const litePeers = names.filter((name) => /^lp\d+\.org\d+$/.test(name)).length;
  assert(litePeers >= 2, 'The DRUNIX Lite Peers are not running.');
  return {
    network: 'NPCI DRUNIX', revision: command('git', ['-C', runtime, 'rev-parse', 'HEAD']),
    chaincode: '3.1', litePeers, cpu: cpus()[0].model, logicalCPUs: cpus().length,
    memoryGiB: round(totalmem() / 2 ** 30), kernel: release(), docker: command('docker', ['version', '--format', '{{.Server.Version}}']),
    node: process.version, stateDB: 'YugabyteDB',
  };
}

async function writeReport(report) {
  const { environment: env, metrics: m } = report;
  const row = [
    env.litePeers, report.policies, m.settled, m.failures, m.tps, m.p50Ms, m.p95Ms,
    m.mvccRetries, m.totalMs, report.passed ? 'PASS' : 'FAIL',
  ].map((value) => value ?? '—').join(' | ');
  const table =
    '# Surge benchmark\n\n' +
    'Measured by `scripts/surge-test` on ' + report.completedAt + '.\n\n' +
    '| Lite Peers | Policies | Settled | Failures | Payouts/s | p50 (ms) | p95 (ms) | MVCC retries | End-to-end (ms) | Result |\n' +
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |\n| ' + row + ' |\n\n' +
    '- Network ' + env.network + ' `' + env.revision + '` with ' + env.stateDB + '. Chaincode ' + env.chaincode + '.\n' +
    '- Machine ' + env.cpu + ', ' + env.logicalCPUs + ' logical CPUs, ' + env.memoryGiB + ' GiB RAM, Linux ' + env.kernel + '. Docker ' + env.docker + ', Node ' + env.node + '.\n' +
    '- Payout rate and percentiles use the elapsed time from storm submission to observed terminal ledger state. This includes signed test-window closure, fan-out, simulated settlement and polling. End-to-end also includes policy setup.\n' +
    '- The documented sample has fixed two-org Lite Peer endpoints and no four-Lite-Peer scaling procedure. Four Lite Peers were not benchmarked.\n' +
    '- The oracle inputs, identities and UPI were simulated. Ledger writes, commit, reconciliation and the stated timings were measured.\n' +
    (report.error ? '\nRun failure: ' + report.error + '\n' : '');
  let previous = '';
  try { previous = await readFile(tablePath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const history = previous.trimEnd()
    ? previous.trimEnd() + '\n\n' + table.replace('# Surge benchmark', '## Benchmark run')
    : table;
  for (const [path, text] of [[resultPath, JSON.stringify(report, null, 2) + '\n'], [tablePath, history]]) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + '.' + run + '.tmp';
    await writeFile(temporary, text);
    await rename(temporary, path);
  }
}

async function main() {
  if (!state || !runtime || !Number.isSafeInteger(n) || n < 1 || n > 10000 || !Number.isFinite(timeout) || timeout < 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('Set PARASHIELD_RUNTIME_STATE and DRUNIX_RUNTIME. Choose 1–10000 policies and a timeout of at least 10 seconds.');
  }
  if (preparedWorker && (n !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(preparedWorker))) {
    throw new Error('Preparing an evaluation worker requires one policy and a valid local username.');
  }
  const environment = readEnvironment();
  const credentials = await loadAccounts();
  const keys = JSON.parse(await readFile(join(state, 'ledger-data/runtime-keys.json'), 'utf8'));
  const [insurer, platform, regulator, worker] = await Promise.all([
    loginAccount('insurer', credentials?.insurer), loginAccount('platform', credentials?.platform),
    loginAccount('regulator', credentials?.regulator), preparedWorker ? loginAccount('worker', credentials?.worker) : null,
  ]);
  if (worker && (worker.account.username !== preparedWorker || worker.account.platformId !== platform.account.platformId)) {
    throw new Error('The worker must match the requested username and the benchmark platform.');
  }
  const oldConfig = await request('/v1/config', { token: insurer });
  const report = { environment, policies: n, passed: false, metrics: {} };
  let appliedVersion;
  const started = performance.now();
  try {
    const setup = await request('/v1/config', { token: insurer, method: 'PUT', body: {
      requestId: 'surge-enable-' + run, config: { ...oldConfig, quorum: 2, waiting: 0, demoClose: true },
    } });
    appliedVersion = setup.result.version;
    for (const zone of zones) {
      const policies = await request('/v1/summary/' + zone + '?size=1', { token: insurer });
      const events = await request('/v1/events/' + zone + '?size=100', { token: insurer });
      const week = weekOf(hourStart());
      const baseline = await request('/v1/reconciliation/' + zone + '?week=' + week, { token: regulator });
      if (!policies.policies.length && !policies.bookmark && !events.records.some((event) => event.windowStart === hourStart())
          && !baseline.reservedCount && !baseline.settledCount && !baseline.failedCount) {
        report.zone = zone;
        break;
      }
    }
    assert(report.zone, 'No clean zone is available in the current hour and week.');
    const ids = worker ? [worker.account.policyId] : Array.from({ length: n }, (_, index) => 'surge-' + run + '-' + (index + 1));
    const before = await request('/v1/metrics', { token: insurer });
    await mapLimit(ids, concurrency, async (id) => {
      const policy = await request('/v1/policies', { token: platform, body: {
        policyId: id, workerId: id, zone: report.zone, tier: 'standard', weeklyIncomePaise: 400000, weeklyMinutes: 2400,
        premiumPaise: 20000, worker: { identity: 'SIMULATED worker', phone: 'SIMULATED phone', bank: 'SIMULATED bank' },
      } });
      assert.equal(policy.result.status, 'PENDING_PREMIUM', 'Unexpected enrollment state.');
      const premium = await request('/v1/policies/' + id + '/premium-simulation', { token: platform, body: {} });
      assert.equal(premium.status, 'PAID', 'A benchmark premium did not succeed.');
      for (let tries = 0; tries < 8; tries++) {
        if ((await request('/v1/policies/' + id, { token: platform })).status === 'ACTIVE') return;
        await delay(250);
      }
      throw new Error('A simulated premium did not activate on the ledger.');
    });
    await mapLimit(ids, concurrency, async (id) => {
      const end = epoch() - 1;
      await request('/v1/activity', { token: platform, body: {
        workerId: id, platformId: platform.account.platformId, windowStart: end - 600, windowEnd: end, requestId: id,
      } });
    });

    assert(epoch() % 3600 < 3570, 'The hour is about to roll over. Run again in the next hour.');
    const stormStarted = performance.now();
    const simulation = await request('/v1/simulations', { token: insurer, body: {
      zone: report.zone, scenario: 'storm', mode: 'normal', closeWindow: true,
    } });
    assert.equal(simulation.event.status, 'DECLARED');
    assert(simulation.closure.closed && simulation.closure.signers.length === 3, 'The signed reading window did not close.');
    report.eventKey = simulation.event.eventKey;
    const observed = new Map();
    const firstTerminalMs = new Map();
    const deadline = stormStarted + timeout;
    while (!interrupted && observed.size < ids.length && performance.now() < deadline) {
      await mapLimit(ids.filter((id) => !observed.has(id)), concurrency, async (id) => {
        const payoutId = createHash('sha256').update(id + '\0' + report.eventKey).digest('hex');
        const payout = await request('/v1/payouts/' + payoutId, { token: insurer, missingOK: true });
        if (payout && payout.status !== 'RESERVED') {
          observed.set(id, payout);
          firstTerminalMs.set(id, performance.now() - stormStarted);
        }
      });
      if (observed.size < ids.length) await delay(350);
    }
    const done = performance.now();
    const paid = [...observed.values()].filter(({ status }) => status === 'SETTLED');
    const latencies = paid.map(({ policyId }) => firstTerminalMs.get(policyId)).sort((a, b) => a - b);
    const percentile = (value) => latencies.length ? round(latencies[Math.ceil(latencies.length * value) - 1]) : null;
    const after = await request('/v1/metrics', { token: insurer });
    report.metrics = { totalMs: round(done - started), stormToTerminalMs: round(done - stormStarted), settled: paid.length,
      failures: ids.length - paid.length, tps: round(paid.length * 1000 / (done - stormStarted)),
      p50Ms: percentile(0.50), p95Ms: percentile(0.95), mvccRetries: after.mvccRetries - before.mvccRetries };
    assert(!interrupted, 'The benchmark was interrupted.');
    assert.equal(observed.size, n, 'Timed out waiting for terminal ledger payouts.');
    assert.equal(paid.length, n, 'Every eligible policy must settle in the zero-failure scenario.');
    assert.equal(new Set(paid.map(({ id }) => id)).size, n, 'Payout IDs must be unique.');
    const total = paid.reduce((sum, payout) => sum + payout.amountPaise, 0);
    assert(total <= n * oldConfig.standard.cap, 'Total payouts exceed the sum of policy caps.');
    let upiTotal = 0;
    await mapLimit(paid, concurrency, async (payout) => {
      const receipt = await request('/v1/receipts/' + payout.reference, { base: upi, authorization: 'Bearer ' + keys.upi });
      assert.equal(receipt.payoutId, payout.id, 'Mock UPI payout ID mismatch.');
      assert.equal(receipt.status, 'SETTLED', 'Mock UPI payout is not settled.');
      assert.equal(receipt.amountPaise, payout.amountPaise, 'Mock UPI amount mismatch.');
      assert.equal(receipt.simulated, true);
      upiTotal += receipt.amountPaise;
    });
    assert.equal(upiTotal, total, 'Mock UPI and ledger totals differ.');
    report.receiptVerification = { payoutCount: paid.length, ledgerPaise: total, mockUPIPaise: upiTotal };
    const auditStarted = performance.now();
    let reserved = 0, settled = 0, failed = 0, ledger = 0, bookmark = '';
    do {
      const page = await request('/v1/reconciliation/' + report.zone + '?size=100&week=' + weekOf(simulation.event.windowStart) +
        '&bookmark=' + encodeURIComponent(bookmark), { token: regulator });
      reserved += page.reservedCount; settled += page.settledCount; failed += page.failedCount; ledger += page.settledPaise;
      assert(!page.bookmark || page.bookmark !== bookmark, 'The reconciliation bookmark did not advance.');
      bookmark = page.bookmark;
    } while (bookmark);
    report.auditMs = round(performance.now() - auditStarted);
    assert(reserved === 0 && settled === n && failed === 0 && ledger === total, 'The audit totals did not reconcile.');
    const proof = await request('/v1/ledger-proof/' + paid[0].txId, { token: regulator });
    assert(/^\d+$/.test(proof.blockNumber), 'The committed payout block proof is missing.');
    report.reconciliation = { ledgerPaise: total, mockUPIPaise: upiTotal, paidPolicies: n, duplicates: 0, capPaise: n * oldConfig.standard.cap };
    report.passed = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : 'An unclassified error ended the run.';
  } finally {
    if (appliedVersion !== undefined) {
      try {
        const current = await request('/v1/config', { token: insurer });
        assert.equal(current.version, appliedVersion, 'Configuration changed during the run; restore the original configuration separately.');
        await request('/v1/config', { token: insurer, method: 'PUT', body: {
          requestId: 'surge-restore-' + run, config: { ...oldConfig, version: appliedVersion },
        } });
      } catch {
        report.passed = false;
        report.error ??= 'Could not restore the previous configuration.';
      }
    }
    report.completedAt = new Date().toISOString();
    await writeReport(report);
  }
  if (!report.passed) throw new Error(report.error);
  console.log(JSON.stringify({ passed: true, policies: n, ...report.metrics }));
}

try {
  await main();
} catch (error) {
  console.error('Surge test failed. ' + (error instanceof Error ? error.message : 'Check the report.'));
  process.exitCode = 1;
}
