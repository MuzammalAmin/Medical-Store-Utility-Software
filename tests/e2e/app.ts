import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const SCREENS_DIR = join(import.meta.dirname, '..', '..', 'test-results', 'screens');

export function newUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'ayyaz-e2e-'));
}

/** Launches the built app against an isolated data folder. */
export async function launchApp(
  userData: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  // Editors such as VS Code set ELECTRON_RUN_AS_NODE for child processes, which
  // would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const app = await electron.launch({
    // Launch the project folder (like `electron .`) so package.json sets the app name and version.
    args: [join(import.meta.dirname, '..', '..')],
    env: {
      ...(env as Record<string, string>),
      AYYAZ_USER_DATA: userData,
      AYYAZ_E2E_SAVE_PATH: join(userData, 'recovery-key.txt'),
      ...extraEnv,
    },
  });
  const page = await app.firstWindow();
  // Surface renderer crashes in the test output.
  page.on('pageerror', (error) => console.error('[renderer]', error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console]', msg.text());
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

export async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENS_DIR, `${name}.png`) });
}

export const OWNER = { fullName: 'Ayyaz Ahmed', username: 'ayyaz', pin: '482915' };

/** Runs the first-run setup with the owner above and lands on the dashboard. */
export async function completeSetup(page: Page): Promise<string> {
  await page.getByRole('button', { name: /Start a new setup/ }).click();
  await page.getByLabel('Address').fill('Main Bazaar, Lahore');
  await page.getByLabel('Phone').fill('042-1234567');
  await page.getByLabel('Full name').fill(OWNER.fullName);
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('PIN', { exact: true }).fill(OWNER.pin);
  await page.getByLabel('Repeat PIN').fill(OWNER.pin);
  await page.getByRole('button', { name: 'Continue' }).click();
  const recoveryKey = (await page.getByLabel('Recovery key').textContent())!;
  await page.getByRole('button', { name: /Save to file/ }).click();
  await page.getByRole('button', { name: /I have saved it/ }).click();
  const groups = recoveryKey.split('-');
  const labels = await page.getByText(/^Group \d+$/).allTextContents();
  const inputs = page.locator('input[maxlength="4"]');
  for (const [i, label] of labels.entries()) {
    await inputs.nth(i).fill(groups[Number(label.replace('Group ', '')) - 1]!);
  }
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.getByRole('heading', { name: /Welcome, Ayyaz/ }).waitFor();
  return recoveryKey;
}

/** A link in the sidebar (page bodies can contain links with the same name). */
export const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: new RegExp(`^${name}(\\s|$)`) });
