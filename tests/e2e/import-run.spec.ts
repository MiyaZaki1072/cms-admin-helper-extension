import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { AWS, configure, expect, loginAws, test } from './fixtures';

/** Users per import run; set IMPORT_COUNT=300 for the full check (takes ~5 min at 4 requests/s). */
const COUNT = Number(process.env.IMPORT_COUNT ?? 20);

async function openImport(page: Page, contest = 'practice'): Promise<Locator> {
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByLabel('Contest', { exact: true }).selectOption({ label: `${contest} — ${contest === 'practice' ? 'Practice Contest' : 'Practice Contest 2'}` });
  await overlay.getByRole('tab', { name: 'Import' }).click();
  return overlay;
}

/** Unique usernames per run so the test can be repeated on the same server. */
function batch(n: number, tag: string) {
  const prefix = `${tag}${Date.now().toString(36)}`;
  const lines = ['username,first_name,last_name,team,ip,extra_time'];
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(3, '0');
    const team = `${prefix.toUpperCase()}T${(i % 5) + 1}`;
    const ip = i % 5 === 0 ? `10.9.${Math.floor(i / 250)}.${i % 250}` : '';
    const extra = i % 7 === 0 ? '10m' : '';
    lines.push(`${prefix}-${num},First${num},Last${num},${team},${ip},${extra}`);
  }
  return { prefix, csv: lines.join('\n') };
}

async function runImport(overlay: Locator, csv: string, n: number) {
  await overlay.getByLabel('Paste users').fill(csv);
  await overlay.getByRole('button', { name: 'Read' }).click();
  await overlay.getByRole('button', { name: new RegExp(`Check ${n} rows against CMS`) }).click();
  await expect(overlay.getByTestId('import-counts')).toContainText(`New user: ${n}`);
  await overlay.getByRole('button', { name: new RegExp(`Import ${n} users?`) }).click();
  await overlay.getByRole('dialog').getByRole('button', { name: 'Start import' }).click();
  await expect(overlay.getByTestId('import-summary')).toHaveText(new RegExp(`^${n} done, 0 failed, 0 skipped`), {
    timeout: 60_000 + n * 2_000,
  });
}

test(`import ${COUNT} users with teams: zero failures, and running again changes nothing`, async ({ context, extensionId }) => {
  test.setTimeout(120_000 + COUNT * 3_000);
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openImport(page);
  const { prefix, csv } = batch(COUNT, 'imp');

  await runImport(overlay, csv, COUNT);
  await expect(overlay.getByTestId('import-results').locator('tr[data-state="failed"]')).toHaveCount(0);
  const firstPassword = (await overlay.getByTestId('import-results').locator('tr').nth(1).locator('code').textContent()) ?? '';
  expect(firstPassword).toMatch(/^[a-z]+-\d{4}$/);

  // Results file has every user with a password.
  const download = page.waitForEvent('download');
  await overlay.getByTestId('import-run').getByRole('button', { name: 'CSV' }).click();
  const text = readFileSync((await (await download).path())!, 'utf8');
  expect(text).toContain(`${prefix}-001,${firstPassword}`);
  expect(text.trim().split(/\r?\n/)).toHaveLength(COUNT + 1);

  // Login cards open in a new window, one card per user.
  const popup = page.waitForEvent('popup');
  await overlay.getByRole('button', { name: /Print login cards/ }).click();
  const cards = await popup;
  await expect(cards.locator('.card')).toHaveCount(COUNT);
  await expect(cards.locator('.card').first()).toContainText(firstPassword);
  await cards.close();

  // The same file again: every row is already in the contest.
  await overlay.getByRole('button', { name: new RegExp(`Check ${COUNT} rows against CMS`) }).click();
  await expect(overlay.getByTestId('import-counts')).toContainText(`Already in contest: skip: ${COUNT}`);
  await expect(overlay.getByRole('button', { name: /^Import 0 users$/ })).toBeDisabled();

  // AWS agrees: team, IP and extra time were set by read-modify-write.
  await page.goto(`${AWS}/contest/2/users`);
  const link = page.locator('#core a', { hasText: `${prefix}-005` });
  await link.click();
  await expect(page.locator('input[name="team"]')).toHaveValue(`${prefix.toUpperCase()}T1`);
  await expect(page.locator('input[name="ip"]')).toHaveValue(/^10\.9\.0\.5(\/32)?$/);
  await page.goto(`${AWS}/contest/2/users`);
  await page.locator('#core a', { hasText: `${prefix}-007` }).click();
  await expect(page.locator('input[name="extra_time"]')).toHaveValue('600');
});

test('bulk password reset, add to another contest and remove', async ({ context, extensionId }) => {
  test.setTimeout(180_000);
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  let overlay = await openImport(page);
  const { prefix, csv } = batch(3, 'blk');
  await runImport(overlay, csv, 3);

  const manage = overlay.getByTestId('manage-users');
  await manage.getByRole('button', { name: /Select shown/ }).isVisible();
  // The list reloads after the import finishes; reopen the tab to be sure.
  await overlay.getByRole('tab', { name: 'Tools' }).click();
  await overlay.getByRole('tab', { name: 'Import' }).click();
  await manage.getByLabel('Filter users').fill(prefix);
  await expect(manage.getByTestId('manage-list').locator('tbody tr')).toHaveCount(3);

  // Reset two passwords (plain text so AWS shows them).
  await manage.getByLabel(`Select ${prefix}-001`).check();
  await manage.getByLabel(`Select ${prefix}-002`).check();
  await manage.getByRole('button', { name: 'Reset passwords…' }).click();
  const dialog = overlay.getByRole('dialog');
  await dialog.getByLabel('Plain text').check();
  await expect(dialog.getByRole('button', { name: 'Reset passwords' })).toBeDisabled();
  await dialog.getByLabel('Type RESET to confirm').fill('RESET');
  await dialog.getByRole('button', { name: 'Reset passwords' }).click();
  const results = overlay.getByTestId('bulk-results');
  await expect(results).toContainText('2 done, 0 failed');
  const newPassword = (await results.locator(`tr[data-username="${prefix}-001"] code`).textContent()) ?? '';
  expect(newPassword).toMatch(/^[a-z]+-\d{4}$/);

  // Add one to practice2.
  await manage.getByLabel(`Select ${prefix}-003`).check();
  await manage.getByRole('button', { name: 'Add to another contest…' }).click();
  await overlay.getByRole('dialog').getByLabel('Target contest').selectOption({ label: 'practice2 — Practice Contest 2' });
  await overlay.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(results).toContainText('1 done, 0 failed');

  // Remove one from practice (typed confirmation).
  await manage.getByLabel(`Select ${prefix}-003`).check();
  await manage.getByRole('button', { name: 'Remove from contest…' }).click();
  await overlay.getByRole('dialog').getByLabel('Type REMOVE to confirm').fill('REMOVE');
  await overlay.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(results).toContainText('1 done, 0 failed');
  await expect(manage.getByTestId('manage-list').locator('tbody tr')).toHaveCount(2);

  // Check in AWS.
  await page.goto(`${AWS}/contest/2/users`);
  await page.locator('#core a', { hasText: `${prefix}-001` }).click();
  const userLink = page.locator('#core h1 a').first();
  await userLink.click();
  await expect(page.locator('input[name="password"]')).toHaveValue(newPassword);
  await page.goto(`${AWS}/contest/3/users`);
  await expect(page.locator('#core')).toContainText(`${prefix}-003`);
  await page.goto(`${AWS}/contest/2/users`);
  await expect(page.locator('#core table.bordered')).not.toContainText(`${prefix}-003`);

  // Every action is in the audit log.
  await page.locator('#cms-admin-helper-menu a').click();
  overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByRole('tab', { name: 'Log' }).click();
  for (const action of ['Bulk import', 'Bulk password reset (plaintext)', 'Bulk add to contest', 'Bulk remove from contest']) {
    await expect(overlay.locator('.cah-table')).toContainText(action);
  }
});
