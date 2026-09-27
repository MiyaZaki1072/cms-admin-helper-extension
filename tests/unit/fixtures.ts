import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'fixtures', 'v1.5');

export function fixtureText(name: string): string {
  return readFileSync(join(DIR, name), 'utf8');
}

/** Parse a saved AWS page the way the content script does (DOMParser). */
export function fixture(name: string): Document {
  return new DOMParser().parseFromString(fixtureText(name), 'text/html');
}
