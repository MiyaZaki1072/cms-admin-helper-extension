import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { AWS, configure, expect, loginAws, test } from './fixtures';

async function openSynced(page: Page) {
  // On a contest page the helper opens on that contest.
  if (!/\/contest\/1(\/|$)/.test(page.url())) await page.goto(`${AWS}/contest/1`);
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await expect(overlay.getByTestId('tracker-status')).toContainText('300 submissions indexed', { timeout: 30_000 });
  return overlay;
}

test('"what did stu007 do on task max?" in two clicks', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1/tasks`);

  const overlay = await openSynced(page); // click 1: Helper
  await overlay.locator('.cah-pick[data-username="stu007"]').click(); // click 2

  await expect(overlay.getByTestId('person-username')).toHaveText('stu007');
  const maxRow = overlay.getByTestId('person-matrix').locator('tr[data-task="max"]');
  await expect(maxRow).toBeVisible();
  const attempts = Number((await maxRow.locator('td').nth(2).textContent())?.trim().split(' ')[0]);
  const listed = overlay.getByTestId('submission-list').locator('tbody tr').filter({ hasText: 'max' });
  await expect(listed).toHaveCount(attempts);
  // Participation details are loaded on demand.
  await expect(overlay.getByTestId('person-view')).toContainText('Extra time');
});

test('grid, filters, submission detail and export', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openSynced(page);

  // Grid: every contestant, click a row to open them.
  await overlay.getByRole('button', { name: 'Grid' }).click();
  await expect(overlay.getByTestId('grid').locator('tbody tr')).toHaveCount(50);
  await overlay.getByTestId('grid').locator('tr[data-username="stu015"]').click();
  await expect(overlay.getByTestId('person-username')).toHaveText('stu015');

  // Submissions: compile failures only (the seed has 43).
  await overlay.getByRole('button', { name: 'Submissions' }).click();
  await overlay.getByLabel('Status').selectOption('compilation_failed');
  await expect(overlay.getByTestId('filter-count')).toHaveText('43 of 300 submissions');
  await overlay.getByLabel('Status').selectOption('any');
  await overlay.getByLabel('Users filter').fill('stu001');
  const firstRow = overlay.getByTestId('submission-list').locator('tbody tr').first();
  await expect(firstRow).toContainText('stu001');

  // Detail: testcases from /submission/{id}.
  await overlay.getByLabel('Status').selectOption('scored');
  await firstRow.getByRole('button', { name: 'Details' }).click();
  await expect(overlay.getByTestId('testcases').locator('tbody tr')).toHaveCount(5);
  await overlay.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // XLSX export of the filtered list (built in the background).
  const download = page.waitForEvent('download');
  await overlay.getByRole('button', { name: 'XLSX' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^submissions-.*\.xlsx$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
});

test('compare two contestants', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openSynced(page);
  await overlay.getByRole('button', { name: 'Compare' }).click();
  await overlay.locator('.cah-pick[data-username="stu001"]').click();
  await overlay.locator('.cah-pick[data-username="stu002"]').click();
  await expect(overlay.getByTestId('compare').locator('thead th')).toHaveCount(3);
  await expect(overlay.getByTestId('compare')).toContainText('Total');
});

test('AWS submissions page gets a filter bar, "only" links and hover cards', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  // Build the index first.
  await openSynced(page);
  await page.keyboard.press('Escape');

  await page.goto(`${AWS}/contest/1/submissions`);
  const filter = page.getByLabel('Filter submissions on this page');
  await filter.fill('stu015');
  const visibleRows = page.locator('#submissions table.bordered > tbody > tr:visible');
  const count = await visibleRows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(visibleRows.nth(i).locator('td').nth(1)).toContainText('stu015');

  // Hover card from the index.
  await visibleRows.first().locator('td').nth(1).locator('a').first().hover();
  await expect(page.locator('#cah-hover-card')).toBeVisible();
  await expect(page.locator('#cah-hover-card .card')).toContainText('submissions');

  // "only" opens the helper on that contestant.
  await visibleRows.first().locator('a.cah-only').click();
  await expect(page.locator('cms-admin-helper').getByTestId('person-username')).toHaveText('stu015');
});
