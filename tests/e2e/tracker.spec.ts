import { AWS, configure, expect, loginAws, test } from './fixtures';

test('tracker sync: counts match AWS, second sync is one request', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto(`${AWS}/contest/1/submissions`);
  await page.locator('#cms-admin-helper-menu a').click();

  const overlay = page.locator('cms-admin-helper .cah-overlay');
  const status = overlay.getByTestId('tracker-status');
  // First open: automatic full sync of 6 pages.
  await expect(status).toContainText('300 submissions indexed', { timeout: 30_000 });
  await expect(overlay.getByTestId('tracker-last')).toContainText('6 requests, 300 new');

  await overlay.getByRole('button', { name: 'Sync now' }).click();
  await expect(overlay.getByTestId('tracker-last')).toContainText('1 request, 0 new, 0 changed');

  // Per-user counts (grid "Subs" column) equal "Reevaluate all N submissions" on each participation page.
  await overlay.getByRole('button', { name: 'Grid' }).click();
  const subsColumn = 5; // User, Team, sum, max, Total, Subs
  const aws = await context.newPage();
  for (const [userId, username] of [
    [1, 'stu001'],
    [15, 'stu015'],
    [39, 'stu039'],
    [49, 'stu049'],
  ] as const) {
    await aws.goto(`${AWS}/contest/1/user/${userId}/edit`);
    const text = (await aws.locator('#submissions > p').first().textContent()) ?? '';
    const expected = /Reevaluate all (\d+) submissions/.exec(text)?.[1];
    expect(expected).toBeDefined();
    await expect(overlay.locator(`tr[data-username="${username}"] td`).nth(subsColumn)).toHaveText(expected!);
  }

  // The index survives a page reload (kept in the background).
  await page.reload();
  await page.locator('#cms-admin-helper-menu a').click();
  await expect(overlay.getByTestId('tracker-status')).toContainText('300 submissions indexed');
  await expect(overlay.getByTestId('tracker-last')).toHaveCount(0);
});
