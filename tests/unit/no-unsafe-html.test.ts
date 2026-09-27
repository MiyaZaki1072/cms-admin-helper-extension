import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Ways to turn a string into markup; server strings must never reach them. */
const UNSAFE = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write\s*\(/, /dangerouslySetInnerHTML/, /\beval\s*\(/, /new Function\s*\(/];

describe('no unsafe HTML sinks in the extension source', () => {
  it.each(files(SRC).map((f) => [relative(SRC, f), f]))('%s', (_name, path) => {
    const source = readFileSync(path, 'utf8');
    for (const pattern of UNSAFE) expect(source, `${pattern} found`).not.toMatch(pattern);
  });
});

describe('no requests to other servers', () => {
  it('source has no hard-coded external URLs used for requests', () => {
    for (const path of files(SRC)) {
      const source = readFileSync(path, 'utf8');
      const urls = source.match(/fetch\(\s*['"`]https?:\/\/[^'"`]+/g) ?? [];
      expect(urls, relative(SRC, path)).toEqual([]);
    }
  });
});
