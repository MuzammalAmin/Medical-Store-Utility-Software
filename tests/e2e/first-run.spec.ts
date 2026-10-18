import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, nav, newUserDataDir, screenshot } from './app';

const OWNER = { fullName: 'Ayyaz Ahmed', username: 'ayyaz', pin: '482915' };

test('first run: setup, lock, login, backups and recovery', async () => {
  const userData = newUserDataDir();

  // ── First run ──────────────────────────────────────────────────────────
  let { app, page } = await launchApp(userData);
  await expect(page.getByText('Welcome')).toBeVisible();
  await screenshot(page, '01-welcome');

  await page.getByRole('button', { name: /Start a new setup/ }).click();
  await page.getByLabel('Address').fill('Main Bazaar, Lahore');
  await page.getByLabel('Phone').fill('042-1234567');
  await page.getByLabel('Full name').fill(OWNER.fullName);
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('PIN', { exact: true }).fill(OWNER.pin);
  await page.getByLabel('Repeat PIN').fill(OWNER.pin);
  await screenshot(page, '02-details');
  await page.getByRole('button', { name: 'Continue' }).click();

  const keyBox = page.getByLabel('Recovery key');
  await expect(keyBox).toHaveText(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
  const recoveryKey = (await keyBox.textContent())!;
  const continueButton = page.getByRole('button', { name: /I have saved it/ });
  await expect(continueButton).toBeDisabled();
  await screenshot(page, '03-recovery-key');
  await page.getByRole('button', { name: /Save to file/ }).click();
  await expect(page.getByText('Done. Keep that copy safe.')).toBeVisible();
  expect(readFileSync(join(userData, 'recovery-key.txt'), 'utf8')).toContain(recoveryKey);
  await continueButton.click();

  // Type back the requested groups, first a wrong one to see the error.
  const groups = recoveryKey.split('-');
  const labels = await page.getByText(/^Group \d+$/).allTextContents();
  const indexes = labels.map((l) => Number(l.replace('Group ', '')) - 1);
  const inputs = page.locator('input[maxlength="4"]');
  await inputs.nth(0).fill('ZZZZ');
  await inputs.nth(1).fill(groups[indexes[1]!]!);
  await inputs.nth(2).fill(groups[indexes[2]!]!);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByText(/do not match/)).toBeVisible();
  await screenshot(page, '04-confirm-error');
  await inputs.nth(0).fill(groups[indexes[0]!]!);
  await page.getByRole('button', { name: 'Finish setup' }).click();

  // ── Dashboard & settings ───────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Welcome, Ayyaz' })).toBeVisible();
  await screenshot(page, '05-dashboard');
  await nav(page, 'Settings').click();
  await page.getByRole('tab', { name: 'Tax & pricing' }).click();
  await expect(page.getByText('Base Rs 100.00 + GST 18% (Rs 18.00) = Rs 118.00')).toBeVisible();
  await page.getByText('Sale price only').click();
  await expect(
    page.getByText('Rs 118.00 (includes GST 18% = Rs 18.00, base Rs 100.00)'),
  ).toBeVisible();
  await screenshot(page, '06-settings-tax');
  await page.getByRole('tab', { name: 'Backups' }).click();
  await expect(page.getByText('After setup')).toBeVisible();
  await screenshot(page, '07-settings-backups');
  await nav(page, 'POS').click();
  await expect(page.getByLabel('Scan barcode or search brand / generic')).toBeFocused();
  await page.getByRole('link', { name: 'Back' }).click();

  // ── Lock & login ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: /Lock/ }).click();
  await expect(page.getByText('Who is using the counter?')).toBeVisible();
  await page.getByRole('button', { name: OWNER.fullName }).click();
  await page.getByLabel('PIN').fill('000000');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(/Wrong PIN\. 4 attempt/)).toBeVisible();
  await screenshot(page, '08-login-wrong-pin');
  await page.getByLabel('PIN').fill(OWNER.pin);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Ayyaz' })).toBeVisible();

  await app.close();

  // A backup is made after setup and again on close; the database is encrypted.
  const backups = readdirSync(join(userData, 'backups')).filter((f) => f.endsWith('.apbak'));
  expect(backups.some((f) => f.includes('-setup.'))).toBe(true);
  expect(backups.some((f) => f.includes('-close.'))).toBe(true);
  const dbFile = join(userData, 'data', 'ayyaz-pharmacy.db');
  expect(readFileSync(dbFile).subarray(0, 15).toString()).not.toBe('SQLite format 3');

  // ── Normal restart opens with the stored key ──────────────────────────
  ({ app, page } = await launchApp(userData));
  await expect(page.getByText('Who is using the counter?')).toBeVisible();
  await app.close();

  // ── Lost key store (e.g. Windows reinstalled): recover with the key ───
  rmSync(join(userData, 'data', 'database.keystore'));
  ({ app, page } = await launchApp(userData));
  await expect(page.getByText('Enter your recovery key')).toBeVisible();
  await page.getByLabel('Recovery key').fill('AAAA'.repeat(14));
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText(/not valid|does not match/)).toBeVisible();
  await screenshot(page, '09-recover-wrong-key');
  await page.getByLabel('Recovery key').fill(recoveryKey.toLowerCase());
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Who is using the counter?')).toBeVisible();
  expect(existsSync(join(userData, 'data', 'database.keystore'))).toBe(true);
  await app.close();

  rmSync(userData, { recursive: true, force: true });
});
