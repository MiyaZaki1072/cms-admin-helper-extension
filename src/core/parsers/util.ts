/** A parser met markup it does not recognise (likely not CMS v1.5). */
export class ParseError extends Error {
  constructor(
    readonly parser: string,
    message: string,
  ) {
    super(`${parser}: ${message}`);
    this.name = 'ParseError';
  }
}

/** Collapse whitespace and trim. */
export function text(node: Node | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Keep line breaks (for question/announcement bodies), trim the ends. */
export function multilineText(node: Node | null | undefined): string {
  return (node?.textContent ?? '').replace(/\r\n/g, '\n').trim();
}

export function num(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function idFrom(re: RegExp, href: string | null | undefined, group = 1): number | null {
  if (!href) return null;
  const m = re.exec(href);
  return m?.[group] ? Number(m[group]) : null;
}

/**
 * "2026-09-27 08:15:40" or "2026-09-27 08:15:40.248675" (UTC, as Python
 * prints datetimes) -> ms since epoch. Throws on anything else.
 */
export function parseCmsDateTime(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!m) throw new Error(`Not a CMS date-time: "${value}"`);
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Math.floor(Number(frac.padEnd(6, '0')) / 1000) : 0;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
}

/** ms since epoch -> "YYYY-MM-DD HH:MM:SS" in UTC, the format AWS forms accept. */
export function formatCmsDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/** Header cell texts of a table, e.g. ["Time", "User", ...]. */
export function headers(table: Element): string[] {
  return [...table.querySelectorAll(':scope > thead > tr > th')].map((th) => text(th));
}

/** Throws ParseError unless the table's headers are exactly `expected`. */
export function expectHeaders(parser: string, table: Element | null, expected: readonly string[]): Element {
  if (!table) throw new ParseError(parser, 'table not found');
  const found = headers(table);
  if (found.length !== expected.length || found.some((h, i) => h !== expected[i])) {
    throw new ParseError(parser, `unexpected table headers [${found.join(', ')}]`);
  }
  return table;
}

/** The first table under `root` matching `selector` whose headers are `expected`. */
export function findTable(parser: string, root: ParentNode, selector: string, expected: readonly string[]): Element {
  for (const table of root.querySelectorAll(selector)) {
    const found = headers(table);
    if (found.length === expected.length && found.every((h, i) => h === expected[i])) return table;
  }
  throw new ParseError(parser, `no table with headers [${expected.join(', ')}]`);
}

export function cells(row: Element): Element[] {
  return [...row.children].filter((c) => c.tagName === 'TD');
}

/** Direct text of an element, without its child elements' text. */
export function ownText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent;
  return out.replace(/\s+/g, ' ').trim();
}
