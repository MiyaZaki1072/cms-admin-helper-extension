import { AWS, configure, expect, loginAws, test } from './fixtures';

test('Helper overlay opens on AWS pages, picks the current contest, closes with Esc', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1/users`);

  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('tab')).toHaveText(['Tracker', 'Time', 'Import', 'Tools', 'Log']);
  await expect(overlay.getByLabel('Contest')).toHaveValue('1');
  await expect(overlay.getByTestId('permission')).toHaveText('Full access');

  await overlay.getByRole('tab', { name: 'Tools' }).click();
  await expect(overlay.locator('.cah-dl')).toContainText('admin');

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  // Opens again with state kept.
  await page.locator('#cms-admin-helper-menu a').click();
  await expect(overlay.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
});

test('a read-only admin sees write actions disabled', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page, 'viewer');
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await expect(overlay.getByTestId('permission')).toHaveText('Read-only');
  await expect(overlay.getByRole('status')).toContainText('read-only');
});
