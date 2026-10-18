import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { completeSetup, launchApp, nav, newUserDataDir, screenshot } from './app';

const SAMPLE = join(import.meta.dirname, '..', '..', 'samples', 'sample-items.xlsx');
const PANADOL_BARCODE = '8961100000012';

test('phase 1: import, items, POS sale, hold/recall, return and reports', async () => {
  const userData = newUserDataDir();
  const { app, page } = await launchApp(userData, { AYYAZ_E2E_IMPORT_PATH: SAMPLE });
  await completeSetup(page);

  // ── Import the sample medicine list ────────────────────────────────────
  await nav(page, 'Import').click();
  await page.getByRole('button', { name: 'Choose file' }).click();
  await expect(page.getByText('sample-items.xlsx · 48 rows')).toBeVisible();
  await screenshot(page, '10-import-mapping');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Check the rows' }).click();
  await expect(page.getByRole('button', { name: 'Import 48 rows' })).toBeEnabled();
  await screenshot(page, '11-import-preview');
  await page.getByRole('button', { name: 'Import 48 rows' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  await expect(page.getByText('Added: 48')).toBeVisible();

  // ── Items ──────────────────────────────────────────────────────────────
  await nav(page, 'Items').click();
  await page.getByLabel('Search items').fill('metformin');
  await expect(page.getByText('Glucophage 850mg Tab')).toBeVisible();
  await page.getByLabel('Search items').fill('');
  await screenshot(page, '12-items');
  await page.getByText('Panadol 500mg Tab').click();
  await page.getByRole('tab', { name: /Batches/ }).click();
  await expect(page.getByRole('cell', { name: 'PA271101' })).toBeVisible();
  await screenshot(page, '13-item-batches');
  await page.keyboard.press('Escape');

  // ── POS: scan, search, discount, pay ───────────────────────────────────
  await page.keyboard.press('F1');
  const search = page.getByLabel('Scan barcode or search brand / generic');
  await expect(search).toBeFocused();
  await search.fill(PANADOL_BARCODE);
  await search.press('Enter');
  await expect(page.getByRole('cell', { name: /^Panadol 500mg Tab/ })).toBeVisible();
  await page.getByRole('button', { name: 'One more' }).click(); // 2 strips
  await page.mouse.move(0, 0); // keep the pointer off the results list
  await search.fill('glucophage');
  await expect(page.getByRole('option', { name: /Glucophage 500mg/ })).toBeVisible();
  await search.press('Enter');
  await expect(page.getByRole('cell', { name: /^Glucophage 500mg Tab/ })).toBeVisible();
  // Panadol: Rs 18 per strip (GST-exempt) × 2 = Rs 36; Glucophage 500: Rs 165 per box of 5 strips = Rs 33 per strip.
  const billTotal = page.getByRole('status', { name: 'Bill total' });
  await expect(billTotal).toHaveText('Rs 69.00');
  // F4 discounts the selected line; the totals panel link discounts the whole bill.
  await page.getByRole('button', { name: 'Add (F4)' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Discount/)
    .fill('10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(billTotal).toHaveText('Rs 62.10');
  await screenshot(page, '14-pos-cart');

  await page.keyboard.press('F12');
  await page.getByLabel('Cash received').fill('100');
  await expect(page.getByText('Rs 37.90')).toBeVisible();
  await screenshot(page, '15-pos-payment');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(
    page.getByRole('heading', { name: /Sale complete · Invoice #000001/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View receipt' }).click();
  await expect(
    page.frameLocator('iframe[title="Receipt preview"]').getByText('Invoice #000001'),
  ).toBeVisible();
  await screenshot(page, '16-receipt');
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: /New sale/ }).click();

  // ── Hold and recall ────────────────────────────────────────────────────
  await search.fill('brufen');
  await search.press('Enter');
  await page.keyboard.press('F6');
  await page.getByLabel('Name for the bill').fill('Bilal');
  await page.getByRole('button', { name: 'Hold bill' }).click();
  await expect(page.getByText('The bill is empty')).toBeVisible();
  await page.keyboard.press('F7');
  await page.getByRole('cell', { name: 'Bilal', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^Brufen 400mg Tab/ })).toBeVisible();
  await page.keyboard.press('F12');
  await page.getByRole('radio', { name: 'Card' }).click();
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.getByRole('heading', { name: /Invoice #000002/ })).toBeVisible();
  await page.getByRole('button', { name: /New sale/ }).click();

  // ── Return one strip of Panadol from invoice 1 ─────────────────────────
  await page.keyboard.press('F9');
  await page.getByLabel('Invoice number').fill('1');
  await page.getByRole('button', { name: 'Find invoice' }).click();
  await page.getByLabel('Quantity of Panadol 500mg Tab to return').fill('1');
  await screenshot(page, '17-return');
  await page.getByRole('button', { name: 'Make refund' }).click();
  await expect(
    page.getByRole('heading', { name: /Refund receipt · Return #000001/ }),
  ).toBeVisible();
  await screenshot(page, '18-refund-receipt');
  await page.getByRole('button', { name: 'Close' }).first().click();

  // ── Reports ────────────────────────────────────────────────────────────
  await nav(page, 'Reports').click();
  await expect(page.getByText('Net sales', { exact: true })).toBeVisible();
  await expect(page.getByText('2 invoices')).toBeVisible();
  await screenshot(page, '19-reports');
  await page.getByRole('tab', { name: 'Stock' }).click();
  await expect(page.getByText('48 batches')).toBeVisible();

  await nav(page, 'Inventory').click();
  await page.getByLabel('Filter').selectOption('near');
  await expect(page.getByText('Augmentin 625mg Tab')).toBeVisible();
  await screenshot(page, '20-inventory-near-expiry');

  await nav(page, 'Dashboard').click();
  await expect(page.getByText("Today's net sales")).toBeVisible();
  await screenshot(page, '21-dashboard');

  await app.close();
  rmSync(userData, { recursive: true, force: true });
});
