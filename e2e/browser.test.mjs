import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { authenticatorCode } from '../gateway/test/browser-client.mjs';

const base = process.env.PARASHIELD_TEST_URL ?? 'http://127.0.0.1:5173';
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.PARASHIELD_CHROMIUM_PATH });
});
after(async () => browser?.close());

async function audit(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })), []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

test('public entry, authentication and recovery pages are accessible at 360 px', async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 900 } });
  try {
    const page = await context.newPage();
    for (const [path, heading] of [
      ['/', /Coverage for delivery partners/],
      ['/sign-in', /Sign in/],
      ['/sign-up', /Create a worker account/],
      ['/forgot-password', /Forgot password/],
      ['/evaluation-missing-page', /Page not found/],
      ['/500', /Something went wrong/],
      ['/offline', /Gateway unreachable/],
    ]) {
      await page.goto(base + path);
      await page.getByRole('heading', { level: 1, name: heading }).waitFor();
      await audit(page);
    }
  } finally {
    await context.close();
  }
});

test('worker can register, manage MFA, sign in and out, and receives 403 for insurer route', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    const username = 'e2e-' + randomUUID();
    const password = randomBytes(24).toString('base64url');
    await page.goto(base + '/sign-up');
    await page.getByRole('heading', { level: 1, name: /Create a worker account/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).isDisabled(), true);
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Notice.' }).check();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: /Sign in/ }).waitFor();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'Account security', exact: true }).first().click();
    await page.getByRole('button', { name: 'Enable authenticator' }).click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('Current password').fill(password);
    await modal.getByRole('button', { name: 'Start setup' }).click();
    const setup = await modal.locator('code').textContent();
    await modal.getByLabel('Authenticator code').fill(authenticatorCode(setup));
    await modal.getByRole('button', { name: 'Verify and enable' }).click();
    await modal.getByRole('heading', { name: 'Save recovery codes' }).waitFor();
    const recovery = await modal.locator('code').first().textContent();
    await modal.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Disable authenticator' }).click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('Current password').fill(password);
    await modal.getByLabel('Authenticator or recovery code').fill(recovery);
    await modal.getByRole('button', { name: 'Confirm disable' }).click();
    await page.getByRole('button', { name: 'Enable authenticator' }).waitFor();
    await audit(page);
    await page.goto(base + '/insurer');
    await page.getByRole('heading', { name: /Access denied/ }).waitFor();
    await audit(page);
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(base + '/sign-in');
      await otherPage.getByLabel('Username', { exact: true }).fill(username);
      await otherPage.getByLabel('Password', { exact: true }).fill(password);
      await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await otherPage.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Account security', exact: true }).first().click();
      await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: /Coverage for delivery partners/ }).waitFor();
      await otherPage.goto(base + '/worker');
      await otherPage.getByRole('heading', { level: 1, name: /Sign in/ }).waitFor();
      await otherPage.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
      await otherPage.getByLabel('Username', { exact: true }).fill(username);
      await otherPage.getByLabel('Password', { exact: true }).fill(password);
      await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await otherPage.getByRole('button', { name: 'Sign out', exact: true }).click();
      await otherPage.getByRole('heading', { level: 1, name: /Coverage for delivery partners/ }).waitFor();
    } finally {
      await other.close();
    }
  } finally {
    await context.close();
  }
});
