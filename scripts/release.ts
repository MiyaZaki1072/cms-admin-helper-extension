/**
 * Copy the Chrome and Firefox zips from .output/ into releases/, under names
 * without the version so the download links in the README never change.
 *
 *   pnpm release
 *
 * Run through the `release` script, which builds the zips first.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'releases');
const { name, version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as { name: string; version: string };

await mkdir(OUT, { recursive: true });
for (const browser of ['chrome', 'firefox']) {
  const to = join(OUT, `${name}-${browser}.zip`);
  await copyFile(join(ROOT, '.output', `${name}-${version}-${browser}.zip`), to);
  console.log(`releases/${name}-${browser}.zip  (v${version})`);
}
