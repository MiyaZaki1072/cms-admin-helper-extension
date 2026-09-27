import { configure, expect, loginAws, test } from './fixtures';

const CSV = `username,first_name,last_name,password,email,team,ip,hidden,unrestricted,extra_time,timezone,languages
new001,Somchai,Jaidee,,somchai@school.ac.th,BKK01,,false,false,0,Asia/Bangkok,th
new002,Malee,Srisuk,MyPass!23,,NEWTEAM,10.0.0.12,false,false,600,Asia/Bangkok,"th,en"
new002,Dup,Row,,,,,,,,,
stu001,Arthit,Srisuk,,,,,,,,,
guest01,Guest,Account,,,,,,,,,
new005,A,B,,,,10.0.0.5/24,,,,,
new003,A,B,,,,999.1.1.1,,,,,
new004,A,B,,,,,maybe,,,,`;

test('import preview: duplicates, bad IPs and existing users get the right status', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto('http://localhost:8889/contest/1');
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByRole('tab', { name: 'Import' }).click();

  await overlay.getByLabel('Paste users').fill(CSV);
  await overlay.getByRole('button', { name: 'Read' }).click();
  await expect(overlay.getByLabel('Column 1', { exact: true })).toHaveValue('username');
  await expect(overlay.getByLabel('Column 12', { exact: true })).toHaveValue('languages');
  await overlay.getByRole('button', { name: /Check 8 rows against CMS/ }).click();

  const preview = overlay.getByTestId('import-preview');
  const status = (line: number) => preview.locator(`tr[data-line="${line}"]`);
  await expect(status(2)).toHaveAttribute('data-status', 'new');
  await expect(status(3)).toHaveAttribute('data-status', 'error');
  await expect(status(3)).toContainText('appears 2 times');
  await expect(status(4)).toHaveAttribute('data-status', 'error');
  await expect(status(5)).toHaveAttribute('data-status', 'skip');
  await expect(status(6)).toHaveAttribute('data-status', 'add');
  await expect(status(7)).toHaveAttribute('data-status', 'error');
  await expect(status(7)).toContainText('host bits set');
  await expect(status(8)).toHaveAttribute('data-status', 'error');
  await expect(status(8)).toContainText('not an IPv4 address');
  await expect(status(9)).toHaveAttribute('data-status', 'error');

  // Blank password generated for the new user; the given one kept.
  await expect(status(2).locator('code')).toHaveText(/^[a-z]+-\d{4}$/);
  await expect(overlay.getByTestId('import-counts')).toContainText('New user: 1');
  await expect(overlay.getByTestId('import-counts')).toContainText('Error: 5');

  // Nothing was created in CMS.
  await page.goto('http://localhost:8889/users');
  await expect(page.locator('#core')).not.toContainText('new001');
});

test('generate users from a pattern', async ({ context, extensionId }) => {
  await configure(context, extensionId);
  const page = await context.newPage();
  await loginAws(page);
  await page.goto('http://localhost:8889/contest/1');
  await page.locator('#cms-admin-helper-menu a').click();
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  await overlay.getByRole('tab', { name: 'Import' }).click();
  await overlay.getByRole('button', { name: 'Generate from pattern' }).click();
  await overlay.getByLabel('Username pattern').fill('stu{045..055}');
  await overlay.getByRole('button', { name: 'Generate', exact: true }).click();
  await overlay.getByRole('button', { name: /Check 11 rows/ }).click();
  const counts = overlay.getByTestId('import-counts');
  await expect(counts).toContainText('New user: 5'); // stu051..stu055
  await expect(counts).toContainText('Already in contest: skip: 6'); // stu045..stu050
});
