import type { Page } from '@playwright/test';
import { AWS, CWS, configure, expect, loginAws, test } from './fixtures';

/** Tomorrow's date in Bangkok as YYYY-MM-DD. */
function tomorrowInBangkok(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + 86400_000),
  );
  return parts; // en-CA formats as YYYY-MM-DD
}

async function saveContestTimes(page: Page, start: string, stop: string) {
  await page.goto(`${AWS}/contest/1`);
  await page.locator('input[name="start"]').fill(start);
  await page.locator('input[name="stop"]').fill(stop);
  await page.locator('form[name="edit_contest"] input[type="submit"][value="Update"]').click();
  const warnings = page.locator('#cah-save-warnings');
  if (await warnings.isVisible()) await warnings.getByRole('button', { name: 'Save anyway' }).click();
  await page.waitForLoadState('load');
}

test('quick setup: 09:00-14:00 Bangkok saves 02:00-07:00 UTC; contestants see 09:00', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1`);
  const originalStart = await page.locator('input[name="start"]').inputValue();
  const originalStop = await page.locator('input[name="stop"]').inputValue();
  const day = tomorrowInBangkok();

  try {
    const card = page.locator('#cah-quick-setup');
    await card.getByLabel('Contest date').fill(day);
    await card.getByLabel('Start time').fill('09:00');
    await card.getByLabel('Length').fill('5h');
    await card.getByRole('button', { name: 'Fill the form' }).click();

    await expect(page.locator('input[name="start"]')).toHaveValue(`${day} 02:00:00`);
    await expect(page.locator('input[name="stop"]')).toHaveValue(`${day} 07:00:00`);
    await expect(page.locator('input[name="timezone"]')).toHaveValue('Asia/Bangkok');
    await expect(page.getByTestId('quick-setup-result')).toContainText('09:00');
    await expect(page.getByTestId('quick-setup-result')).toContainText(`${day} 02:00:00`);

    await page.locator('form[name="edit_contest"] input[type="submit"][value="Update"]').click();
    await page.waitForLoadState('load');
    await expect(page.locator('#cah-save-warnings')).toBeHidden();
    await page.goto(`${AWS}/contest/1`);
    await expect(page.locator('input[name="start"]')).toHaveValue(`${day} 02:00:00`);
    await expect(page.locator('input[name="stop"]')).toHaveValue(`${day} 07:00:00`);

    // The contestant site shows the contest in Bangkok time.
    const cws = await context.newPage();
    await cws.goto(`${CWS}/test`);
    await cws.locator('#username').fill('stu001');
    await cws.locator('#password').fill('pass001');
    await cws.locator('#password').press('Enter');
    await expect(cws.locator('body')).toContainText('9:00:00 AM');
    await expect(cws.locator('body')).toContainText('2:00:00 PM');
  } finally {
    await saveContestTimes(page, originalStart, originalStop);
    await expect(page.locator('input[name="start"]')).toHaveValue(originalStart);
  }
});

test('warns before saving an end before the start, and lets you cancel', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1`);
  const start = await page.locator('input[name="start"]').inputValue();
  await page.locator('input[name="stop"]').fill('2000-01-01 00:00:00');
  await page.locator('form[name="edit_contest"] input[type="submit"][value="Update"]').click();
  const warnings = page.locator('#cah-save-warnings');
  await expect(warnings).toContainText('The contest ends before it starts.');
  await warnings.getByRole('button', { name: 'Cancel' }).click();
  await page.goto(`${AWS}/contest/1`);
  await expect(page.locator('input[name="start"]')).toHaveValue(start);
  await expect(page.locator('input[name="stop"]')).not.toHaveValue('2000-01-01 00:00:00');
});

test('AWS page times in Bangkok with UTC on hover, clock and duration fields', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);

  await page.goto(`${AWS}/contest/1/submissions`);
  const firstTime = page.locator('#submissions table.bordered > tbody > tr').first().locator('td').first().locator('a');
  const title = (await firstTime.getAttribute('title')) ?? '';
  const utc = /UTC: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(title)?.[1];
  expect(utc).toBeDefined();
  const expected = new Date(Date.parse(`${utc!.replace(' ', 'T')}Z`) + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  await expect(firstTime).toHaveText(expected);

  const clock = page.locator('#cah-clock');
  await expect(clock).toContainText('Bangkok:');
  await expect(clock).toContainText('UTC:');
  await expect(clock).toContainText(/Contest (ends in|starts in|over)/);

  // Toggle back to UTC.
  await clock.getByRole('link', { name: 'Show page times in UTC' }).click();
  await expect(firstTime).toHaveText(utc!);
  await clock.getByRole('link', { name: 'Show page times in Bangkok' }).click();
  await expect(firstTime).toHaveText(expected);

  // Duration field on a participation page (not saved).
  await page.goto(`${AWS}/contest/1/user/1/edit`);
  const extra = page.locator('input[name="extra_time"]');
  await extra.fill('1h 30m');
  await expect(page.locator('input[name="extra_time"] + .cah-duration-hint')).toHaveText('= 5400 seconds');
  await extra.blur();
  await expect(extra).toHaveValue('5400');
});

test('Time tab converts both ways', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByRole('tab', { name: 'Time' }).click();
  await overlay.getByLabel('Bangkok time').fill('2026-10-04T06:00');
  await expect(overlay.getByTestId('convert-utc')).toHaveText('2026-10-03 23:00:00');
  await overlay.getByLabel('UTC time').fill('2026-10-04 02:00:00');
  await expect(overlay.getByTestId('convert-local')).toHaveText('Sun 4 Oct 2026, 09:00');
  await overlay.getByLabel('Duration').fill('4h30m');
  await expect(overlay.getByTestId('convert-seconds')).toContainText('16200 seconds');
  await expect(overlay.getByTestId('time-countdown')).toContainText(/ends in|starts in|over/);
});
