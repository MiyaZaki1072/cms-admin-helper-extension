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

test('task filter, score changes and the code viewer', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openSynced(page);
  // stu016 has 8 submissions on max in the seed.
  await overlay.locator('.cah-pick[data-username="stu016"]').click();
  await expect(overlay.getByTestId('person-username')).toHaveText('stu016');

  // Task buttons: only that task's submissions, as many as the matrix says.
  const pill = overlay.getByTestId('task-pills').getByRole('button', { name: /^max/ });
  const attempts = Number((await pill.locator('.cah-muted').textContent())?.trim());
  expect(attempts).toBeGreaterThanOrEqual(2);
  await pill.click();
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
  const rows = overlay.getByTestId('submission-list').locator('tbody tr');
  await expect(rows).toHaveCount(attempts);
  for (const text of await rows.locator('td:nth-child(2)').allTextContents()) expect(text).toBe('max');

  // Code of the oldest one, then step to the next and compare with it.
  await rows.last().getByRole('button', { name: 'Code' }).click();
  const viewer = overlay.getByTestId('code-viewer');
  await expect(viewer.getByTestId('code-position')).toHaveText(`1 of ${attempts}`);
  await expect(viewer.getByTestId('code-source').locator('.cah-code-line').first()).toBeVisible();
  await expect(viewer.getByLabel('Compare with previous')).toBeDisabled();
  await viewer.getByRole('button', { name: 'Next ▶' }).click();
  await expect(viewer.getByTestId('code-position')).toHaveText(`2 of ${attempts}`);
  await viewer.getByLabel('Compare with previous').check();
  await expect(viewer.getByTestId('code-diff-summary')).toContainText('Compared with #');
  await viewer.press('ArrowLeft');
  await expect(viewer.getByTestId('code-position')).toHaveText(`1 of ${attempts}`);
  await viewer.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(overlay.getByTestId('person-view')).toBeVisible();

  // Contest-wide: "Gained points" leaves only positive changes.
  await overlay.getByRole('button', { name: 'Submissions' }).click();
  await overlay.getByLabel('Change').selectOption('gained');
  const deltas = await overlay.getByTestId('submission-list').getByTestId('delta').allTextContents();
  expect(deltas.length).toBeGreaterThan(0);
  for (const d of deltas) expect(d).toMatch(/^\+\d/);
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
