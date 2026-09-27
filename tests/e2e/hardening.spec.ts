import { AWS, configure, expect, loginAws, test } from './fixtures';

test('no request goes to any host except the AWS origin', async ({ context, extensionId }) => {
  const hosts = new Set<string>();
  context.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.host);
  });
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1/submissions`);
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await expect(overlay.getByTestId('tracker-status')).toContainText(/\d+ submissions indexed/, { timeout: 30_000 });
  await overlay.locator('.cah-pick').first().click();
  await expect(overlay.getByTestId('person-view')).toContainText('Extra time');
  for (const tab of ['Time', 'Import', 'Tools', 'Log']) {
    await overlay.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(1500);
  }
  expect([...hosts]).toEqual(['localhost:8889']);
});

test('an expired session is detected and explained', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1`);
  // Log out in another tab; this tab still shows the old page.
  const other = await context.newPage();
  await other.goto(`${AWS}/contest/1`);
  await other.getByRole('button', { name: 'Logout' }).click();
  await other.close();

  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await expect(overlay.locator('.cah-banner-error')).toContainText('not logged in');
  await expect(overlay.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('the Helper does not appear on the login page', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await page.goto(`${AWS}/login`);
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('#cms-admin-helper-menu')).toHaveCount(0);
});
