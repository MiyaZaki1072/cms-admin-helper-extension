import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { AWS, CWS, configure, expect, loginAws, test } from './fixtures';

async function openTools(page: Page): Promise<Locator> {
  if (!/\/contest\/1(\/|$)/.test(page.url())) await page.goto(`${AWS}/contest/1`);
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByRole('tab', { name: 'Tools' }).click();
  return overlay;
}

test('status bar, questions inbox with badge, and replying', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  // A contestant asks a question.
  const cws = await context.newPage();
  await cws.goto(`${CWS}/test`);
  await cws.locator('#username').fill('stu044');
  await cws.locator('#password').fill('pass044');
  await cws.locator('#password').press('Enter');
  await cws.goto(`${CWS}/test/communication`);
  const subject = `Q${Date.now().toString(36)}`;
  await cws.locator('#input_subject').fill(subject);
  await cws.locator('#input_text').fill('Is the input sorted?');
  await cws.locator('#input_text').locator('xpath=ancestor::form').locator('button[type=submit], input[type=submit]').first().click();

  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1`);
  // Badge on the Helper item (first check runs on page load).
  await expect(page.locator('#cms-admin-helper-menu a')).toHaveText(/Helper \(\d+ \?\)/);

  const overlay = await openTools(page);
  await expect(overlay.getByTestId('status-bar')).toContainText('scored');
  await expect(overlay.getByTestId('status-bar')).toContainText(/Workers \d+\/\d+ up/);

  const card = overlay.getByTestId('questions-card');
  const item = card.locator('.cah-question', { hasText: subject });
  await expect(item).toContainText('stu044');
  const before = Number(/(\d+) unanswered/.exec((await card.locator('h3').textContent()) ?? '')?.[1]);
  await item.getByLabel('Quick answer').selectOption('answered');
  await item.getByRole('button', { name: 'Reply' }).click();
  await expect(card.locator('h3')).toContainText(`${before - 1} unanswered`);
  await expect(card.locator('.cah-question', { hasText: subject })).toHaveCount(0);
});

test('announcement from a template', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openTools(page);
  const card = overlay.getByTestId('announcements-card');
  await card.getByRole('button', { name: '30 minutes left', exact: true }).click();
  const subject = `30 minutes left ${Date.now().toString(36)}`;
  await card.getByLabel('Announcement subject').fill(subject);
  await card.getByRole('button', { name: 'Post to all contestants' }).click();
  await overlay.getByRole('dialog').getByRole('button', { name: 'Post' }).click();
  await expect(card).toContainText('Posted.');
  await page.goto(`${AWS}/contest/1/announcements`);
  await expect(page.locator('#announcements')).toContainText(subject);
});

test('bulk extra time (and back), bulk message, IP from a seat map', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  const overlay = await openTools(page);

  // +10 minutes for two contestants, then -10 to restore.
  const edit = overlay.getByTestId('bulk-edit-card');
  await edit.getByLabel('Usernames').first().check().catch(() => undefined);
  await edit.getByText('Usernames', { exact: true }).click();
  await edit.getByRole('textbox', { name: 'Usernames' }).fill('stu041 stu042');
  await expect(edit.getByTestId('selected-count')).toHaveText('2 selected');
  await edit.getByLabel('Minutes').fill('10');
  await edit.getByRole('button', { name: 'Apply to 2' }).click();
  await overlay.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
  await expect(edit.getByTestId('bulk-edit-summary')).toHaveText('2 done, 0 failed');
  await expect(edit.getByTestId('bulk-edit-results').locator('tr[data-username="stu041"]')).toContainText('extra 10 m');
  await page.goto(`${AWS}/contest/1/user/41/edit`);
  await expect(page.locator('input[name="extra_time"]')).toHaveValue('600');
  // The password and team were sent back unchanged.
  await expect(page.locator('input[name="password"]')).toHaveValue('');
  await expect(page.locator('input[name="team"]')).not.toHaveValue('');

  const overlay2 = await openTools(page);
  const edit2 = overlay2.getByTestId('bulk-edit-card');
  await edit2.getByText('Usernames', { exact: true }).click();
  await edit2.getByRole('textbox', { name: 'Usernames' }).fill('stu041 stu042');
  await edit2.getByLabel('Minutes').fill('-10');
  await edit2.getByRole('button', { name: 'Apply to 2' }).click();
  await overlay2.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
  await expect(edit2.getByTestId('bulk-edit-summary')).toHaveText('2 done, 0 failed');
  await expect(edit2.getByTestId('bulk-edit-results').locator('tr[data-username="stu042"]')).toContainText('extra 0 s');

  // Seat map: IP for stu043.
  await edit2.getByLabel('Change').selectOption('ip');
  await edit2.getByLabel('Seat map').fill('username,ip\nstu043,10.10.0.43');
  await edit2.getByRole('button', { name: 'Apply to 1' }).click();
  await overlay2.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
  await expect(edit2.getByTestId('bulk-edit-summary')).toHaveText('1 done, 0 failed');

  // Bulk message with placeholders.
  const message = overlay2.getByTestId('bulk-message-card');
  await message.getByText('Usernames', { exact: true }).click();
  await message.getByRole('textbox', { name: 'Usernames' }).fill('stu041');
  const tag = Date.now().toString(36);
  await message.getByLabel('Message subject').fill(`Hello {first_name} ${tag}`);
  await message.getByLabel('Message text').fill('Your username is {username}.');
  await message.getByRole('button', { name: 'Send to 1' }).click();
  await overlay2.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(message.getByTestId('bulk-message-summary')).toHaveText('1 sent, 0 failed');

  await page.goto(`${AWS}/contest/1/user/41/edit`);
  await expect(page.locator('#messages')).toContainText(`${tag}`);
  await expect(page.locator('#messages')).toContainText('Your username is stu041.');

  // Restore stu043's IP by hand.
  await page.goto(`${AWS}/contest/1/user/43/edit`);
  await expect(page.locator('input[name="ip"]')).toHaveValue(/10\.10\.0\.43/);
  await page.locator('input[name="ip"]').fill('');
  await page.locator('#participation_info input[type="submit"][value="Update"]').click();
  await page.goto(`${AWS}/contest/1/user/43/edit`);
  await expect(page.locator('input[name="ip"]')).toHaveValue('');

  // All of it is in the audit log.
  const overlay3 = await openTools(page);
  await overlay3.getByRole('tab', { name: 'Log' }).click();
  for (const action of ['Bulk extra time', 'Bulk IP lock', 'Bulk message']) await expect(overlay3.locator('.cah-table')).toContainText(action);
});

test('re-evaluate needs a typed confirmation; checklist, ranking snapshot and submission zip', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1`);
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  // Index the submissions first (the Tracker tab syncs on first open).
  await expect(overlay.getByTestId('tracker-status')).toContainText(/\d+ submissions indexed/, { timeout: 30_000 });
  await overlay.getByRole('tab', { name: 'Tools' }).click();

  const reeval = overlay.getByTestId('reevaluate-card');
  await reeval.getByRole('button', { name: 'Re-evaluate task' }).click();
  const dialog = overlay.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Queue' })).toBeDisabled();
  await dialog.getByLabel('Type REEVALUATE to confirm').fill('REEVALUATE');
  await expect(dialog.getByRole('button', { name: 'Queue' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const checklist = overlay.getByTestId('checklist-card');
  await checklist.getByRole('button', { name: 'Run checks' }).click();
  await expect(checklist).toContainText('2 task(s).');
  await expect(checklist).toContainText('Timezone: Asia/Bangkok.');

  const snapshot = page.waitForEvent('download');
  await overlay.getByRole('button', { name: 'Download ranking CSV now' }).click();
  const csv = await snapshot;
  expect(csv.suggestedFilename()).toMatch(/^ranking-test-.*\.csv$/);
  expect(readFileSync((await csv.path())!, 'utf8')).toContain('Username,User,Team');

  const zip = page.waitForEvent('download');
  await overlay.getByTestId('zip-card').getByRole('button', { name: /Download zip \(\d+\)/ }).click();
  const file = await zip;
  expect(file.suggestedFilename()).toMatch(/^submissions-test-best-.*\.zip$/);
  expect(readFileSync((await file.path())!).subarray(0, 2).toString()).toBe('PK');
});
