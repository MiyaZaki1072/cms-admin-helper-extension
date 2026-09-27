/**
 * Screenshots of the helper on the local dev server, for the README
 * (docs/screenshots) and for checking layout. Build first with
 * `pnpm build:e2e`. Nothing is saved to CMS.
 *
 *   pnpm screenshots [outDir] [--scene tracker-person --scene tools ...]
 *
 * Scenes: tracker-person, tracker-grid, time-card, import-preview, tools, time.
 * Older usage `--tab <Name>` captures a plain tab.
 */
import { type Page, chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const outDir = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'docs/screenshots');
const tabs = flag('--tab');
const ALL = ['tracker-person', 'tracker-grid', 'time-card', 'import-preview', 'tools', 'time'];
const scenes = flag('--scene').length > 0 ? flag('--scene') : tabs.length > 0 ? [] : ALL;
const AWS = 'http://localhost:8889';
const extension = resolve('.output', 'chrome-mv3-e2e');

const SAMPLE = `username,first_name,last_name,password,email,team,ip,hidden,unrestricted,extra_time,timezone,languages
stu101,Somchai,Jaidee,,somchai@school.ac.th,BKK01,,false,false,0,Asia/Bangkok,th
stu102,Malee,Srisuk,MyPass!23,,BKK02,10.0.0.12,false,false,600,Asia/Bangkok,"th,en"
stu102,Malee,Duplicate,,,,,,,,,
stu001,Arthit,Srisuk,,,,,,,,,
stu103,Anan,Boonmee,,,NEWTEAM,10.0.0.5/24,,,,,`;

mkdirSync(outDir, { recursive: true });
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cah-shot-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

async function shot(page: Page, name: string) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.getByLabel('AWS address').fill(AWS);
  await options.getByRole('button', { name: 'Save' }).click();
  await options.locator('.status.ok').waitFor();
  await shot(options, 'options');

  const page = await context.newPage();
  await page.goto(`${AWS}/login`);
  await page.locator('input[name=username]').fill('admin');
  await page.locator('input[name=password]').fill('admin');
  await page.locator('input[name=password]').press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.goto(`${AWS}/contest/1/submissions`);
  const overlay = page.locator('cms-admin-helper .cah-overlay');
  const open = async () => {
    if (!(await overlay.isVisible().catch(() => false))) await page.locator('#cms-admin-helper-menu a').click();
    await overlay.getByTestId('permission').waitFor();
  };
  const tab = async (name: string) => {
    await open();
    await overlay.getByRole('tab', { name }).click();
  };

  for (const name of tabs) {
    await tab(name);
    await page.waitForTimeout(1500);
    await shot(page, name.toLowerCase());
  }

  for (const scene of scenes) {
    switch (scene) {
      case 'tracker-person':
        await tab('Tracker');
        await overlay.getByTestId('tracker-status').filter({ hasText: /[1-9]\d* submissions indexed/ }).waitFor({ timeout: 60_000 });
        await overlay.getByRole('button', { name: 'People' }).click();
        await overlay.locator('.cah-pick[data-username="stu007"]').click();
        await overlay.getByTestId('person-matrix').waitFor();
        await page.waitForTimeout(1500);
        break;
      case 'tracker-grid':
        await tab('Tracker');
        await overlay.getByRole('button', { name: 'Grid' }).click();
        await overlay.getByTestId('grid').waitFor();
        break;
      case 'time':
        await tab('Time');
        await page.waitForTimeout(1500);
        break;
      case 'import-preview':
        await tab('Import');
        await overlay.getByLabel('Paste users').fill(SAMPLE);
        await overlay.getByRole('button', { name: 'Read' }).click();
        await overlay.getByRole('button', { name: /Check \d+ rows against CMS/ }).click();
        await overlay.getByTestId('import-preview').waitFor();
        await overlay.getByTestId('import-preview').scrollIntoViewIfNeeded();
        break;
      case 'tools':
        await tab('Tools');
        await overlay.getByTestId('status-bar').filter({ hasText: 'scored' }).waitFor({ timeout: 20_000 });
        break;
      case 'time-card': {
        if (await overlay.isVisible().catch(() => false)) await page.keyboard.press('Escape');
        await page.goto(`${AWS}/contest/1`);
        const card = page.locator('#cah-quick-setup');
        await card.getByLabel('Contest date').fill('2026-10-04');
        await card.getByLabel('Start time').fill('09:00');
        await card.getByLabel('Length').fill('5h');
        await card.getByRole('button', { name: 'Fill the form' }).click();
        await card.scrollIntoViewIfNeeded();
        break;
      }
      default:
        console.warn(`Unknown scene ${scene}`);
        continue;
    }
    await shot(page, scene);
    if (scene === 'time-card') await page.goto(`${AWS}/contest/1/submissions`); // leave without saving
  }
} finally {
  await context.close();
}
