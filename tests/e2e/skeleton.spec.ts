import { AWS, CWS, configure, expect, loginAws, test } from './fixtures';

test('Helper appears on AWS after setup, and only there', async ({ context, extensionId }) => {
  const page = await context.newPage();

  // Before setup: nothing is injected.
  await loginAws(page);
  await expect(page.locator('#cms-admin-helper-menu')).toHaveCount(0);

  await configure(context, extensionId);

  await page.goto(`${AWS}/`);
  await expect(page.locator('#cms-admin-helper-menu')).toHaveText('Helper');

  // Not on the contestant site (other port, same host).
  await page.goto(`${CWS}/`);
  await page.waitForLoadState('load');
  await expect(page.locator('#cms-admin-helper-menu')).toHaveCount(0);
});

test('the request layer loads the contest list from the live server', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.locator('#cms-admin-helper-menu a').click();
  await expect(page.locator('cms-admin-helper').getByLabel('Contest').locator('option', { hasText: 'test — Test Contest' })).toHaveCount(1);
});
