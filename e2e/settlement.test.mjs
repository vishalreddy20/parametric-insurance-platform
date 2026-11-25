import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { browserLogin, browserHeaders } from '../gateway/test/browser-client.mjs';
const enabled = process.env.PARASHIELD_TEST_SETTLEMENT === '1';

test(
  'live settled payout, platform attestation, worker proof and regulator privacy',
  { skip: !enabled, timeout: 240_000 },
  async () => {
    const base = process.env.PARASHIELD_TEST_GATEWAY ?? 'http://127.0.0.1:8080';
    const origin = process.env.PARASHIELD_ORIGIN ?? 'http://127.0.0.1:5173';
    assert(process.env.PARASHIELD_ACCOUNT_DB, 'Set PARASHIELD_ACCOUNT_DB to the dedicated test stack database.');
    assert.equal(new URL(base).hostname, '127.0.0.1');
    assert.equal(new URL(origin).hostname, '127.0.0.1');
    process.env.PARASHIELD_ORIGIN = origin;
    const [worker, insurer, platform, regulator, admin] = await Promise.all(
      ['worker', 'insurer', 'platform', 'regulator', 'admin'].map((role) => browserLogin(base, role)),
    );
    async function req(session, path, body, method = body === undefined ? 'GET' : 'POST') {
      const response = await fetch(base + '/v1' + path, {
        method,
        headers: {
          ...browserHeaders(session, body !== undefined),
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(95000),
      });
      const v = await response.json().catch(() => null);
      if (!response.ok) throw new Error(path.split('?')[0] + ' HTTP ' + response.status + ' ' + v?.code);
      return v;
    }
    const account = await req(worker, '/auth/session');
    const directory = await req(admin, '/auth/directory');
    assert(directory.records.every((record) => !record.passwordHash));
    const fleet = await req(platform, '/auth/directory');
    assert(fleet.records.every((record) => record.role === 'worker' && record.platformId === 'zomato'));
    await assert.rejects(req(regulator, '/auth/directory'), /HTTP 403/);
    console.log('Live staff directory role checks passed.');
    const old = await req(insurer, '/config');
    let applied;
    const browser = await chromium.launch({ executablePath: process.env.PARASHIELD_CHROMIUM_PATH });
    async function rolePage(session) {
      const context = await browser.newContext({ viewport: { width: 360, height: 900 } });
      await context.addCookies(
        session.cookie.split('; ').map((pair) => {
          const [name, value] = pair.split('=', 2);
          return { name, value, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' };
        }),
      );
      return context.newPage();
    }
    async function audit(page) {
      const { violations } = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id),
        [],
      );
    }
    try {
      const setup = await req(
        insurer,
        '/config',
        { requestId: randomUUID(), config: { ...old, quorum: 2, waiting: 0, demoClose: true } },
        'PUT',
      );
      applied = setup.result.version;
      const hour = Math.floor(Date.now() / 3600000) * 3600;
      let zone;
      for (const candidate of [
        'jaipur',
        'pune',
        'lucknow',
        'mumbai',
        'delhi',
        'hyderabad',
        'chennai',
        'bangalore',
        'kolkata',
        'ahmedabad',
      ]) {
        const events = await req(insurer, '/events/' + candidate + '?size=100');
        if (!events.records.some((e) => e.windowStart === hour)) {
          zone = candidate;
          break;
        }
      }
      assert(zone, 'No unused zone for the current hour.');
      const id = account.policyId;
      const workerPage = await rolePage(worker);
      await workerPage.goto(origin + '/worker/onboarding');
      await workerPage.getByRole('heading', { name: 'Worker profile and income baseline' }).waitFor();
      await audit(workerPage);
      await workerPage.getByLabel('Full name').fill('Synthetic Verification Worker');
      await workerPage.getByLabel('Phone number').fill('9876543210');
      await workerPage.getByLabel('City and coverage zone').selectOption(zone);
      await workerPage.getByLabel('Weekly income (INR)').fill('4000');
      await workerPage.getByLabel('Weekly active hours').fill('40');
      await workerPage.getByLabel('UPI ID').fill('synthetic@test');
      await workerPage.getByRole('button', { name: 'Next: Select plan' }).click();
      await workerPage.getByRole('heading', { name: 'Premium breakdown' }).waitFor();
      await audit(workerPage);
      await workerPage.getByRole('button', { name: 'Next: Review policy' }).click();
      await workerPage.getByRole('heading', { name: 'Review and confirm policy' }).waitFor();
      await audit(workerPage);
      await workerPage.getByRole('button', { name: 'Confirm and create policy' }).click();
      await workerPage.getByRole('heading', { name: 'Policy created' }).waitFor();
      assert.match(await workerPage.locator('.onboarding-confirmation code').nth(1).textContent(), /^[0-9a-f]{64}$/);
      await workerPage.getByRole('button', { name: 'Pay simulated premium' }).click();
      await workerPage.getByRole('heading', { name: 'Your policy is active' }).waitFor();
      assert.equal((await req(worker, '/policies/' + id)).status, 'ACTIVE');
      await audit(workerPage);
      const end = Math.floor(Date.now() / 1000) - 1;
      const fleetPage = await rolePage(platform);
      await fleetPage.goto(origin + '/platform');
      const row = fleetPage.getByRole('listitem').filter({ hasText: id });
      await row.getByRole('button', { name: 'Record activity' }).click();
      const ist = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 19);
      await fleetPage.getByLabel('Activity start (IST)').fill(ist(end - 600));
      await fleetPage.getByLabel('Activity end (IST)').fill(ist(end));
      await fleetPage.getByRole('dialog').getByRole('button', { name: 'Record activity' }).click();
      await fleetPage.getByText(/Activity recorded in block/).waitFor();
      await audit(fleetPage);

      const insurerPage = await rolePage(insurer);
      await insurerPage.goto(origin + '/insurer');
      await insurerPage.getByLabel('Zone', { exact: true }).selectOption(zone);
      // Request accelerated closure in the dedicated test configuration. The response is live.
      const simulationUrl = base + '/v1/simulations';
      await insurerPage.route(simulationUrl, (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.continue({ postData: { ...route.request().postDataJSON(), closeWindow: true } });
      });
      const simulated = insurerPage.waitForResponse(
        (response) => response.url() === simulationUrl && response.request().method() === 'POST',
        { timeout: 95_000 },
      );
      await insurerPage.getByRole('button', { name: 'Run storm simulation' }).click();
      const stormResponse = await simulated;
      const storm = await stormResponse.json();
      assert.equal(stormResponse.status(), 200, storm.code);
      await insurerPage.locator('.insurer-simulation-result').waitFor();
      await audit(insurerPage);
      assert.equal(storm.event.status, 'DECLARED');
      assert.equal(storm.closure.closed, true);
      console.log('Live policy activation, platform attestation and signed storm closure passed.');
      let paid;
      for (let elapsed = 0; elapsed < 90000; elapsed += 1500) {
        const page = await req(worker, '/policies/' + id + '/payouts');
        paid = page.records.find((p) => p.eventKey === storm.event.eventKey && p.status === 'SETTLED');
        if (paid) break;
        await delay(1500);
      }
      assert(paid, 'No settled worker payout within 90 seconds.');
      const proof = await req(worker, '/ledger-proof/' + paid.txId + '?payoutId=' + paid.id);
      assert.match(proof.blockNumber, /^\d+$/);
      const day = new Date((hour + 19800) * 1000);
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      let bookmark = '',
        settled = 0;
      do {
        const rec = await req(
          regulator,
          '/reconciliation/' +
            zone +
            '?week=' +
            day.toISOString().slice(0, 10) +
            '&size=100&bookmark=' +
            encodeURIComponent(bookmark),
        );
        settled += rec.settledPaise;
        bookmark = rec.bookmark;
      } while (bookmark);
      assert(settled >= paid.amountPaise);
      await assert.rejects(req(regulator, '/policies/' + id), /HTTP 403/);
      await workerPage.goto(origin + '/worker');
      await workerPage
        .getByRole('button', { name: /inspect ledger proof/i })
        .first()
        .click();
      await workerPage.getByRole('heading', { name: 'Ledger proof' }).waitFor();
      await workerPage.getByRole('dialog').getByText(proof.blockNumber, { exact: true }).waitFor();
      await audit(workerPage);
      const regulatorPage = await rolePage(regulator);
      await regulatorPage.goto(origin + '/regulator');
      await regulatorPage.getByLabel('Zone', { exact: true }).selectOption(zone);
      await regulatorPage.getByRole('heading', { name: 'Weekly payout reconciliation' }).waitFor();
      await regulatorPage.getByRole('heading', { name: 'Authentication audit' }).waitFor();
      await audit(regulatorPage);
      console.log(
        'Live worker settlement, committed block proof, regulator aggregate reconciliation and policy PII denial passed.',
      );
    } finally {
      await browser.close();
      if (applied !== undefined) {
        assert.equal((await req(insurer, '/config')).version, applied, 'Ledger config changed concurrently.');
        await req(insurer, '/config', { requestId: randomUUID(), config: { ...old, version: applied } }, 'PUT');
      }
    }
  },
);
