import { type BrowserContext, type Page, test as base, chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const AWS = 'http://localhost:8889';
export const CWS = 'http://localhost:8888';
const EXTENSION = resolve(import.meta.dirname, '..', '..', '.output', 'chrome-mv3-e2e');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cah-e2e-')), {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

/** Save the AWS URL in the options page (permission is pre-granted in e2e builds). */
export async function configure(context: BrowserContext, extensionId: string, url = AWS): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel('AWS address').fill(url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.status.ok')).toContainText('Saved');
  await page.close();
}

export async function loginAws(page: Page, username = 'admin', password = username): Promise<void> {
  await page.goto(`${AWS}/login`);
  await page.locator('input[name=username]').fill(username);
  await page.locator('input[name=password]').fill(password);
  await page.locator('input[name=password]').press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
