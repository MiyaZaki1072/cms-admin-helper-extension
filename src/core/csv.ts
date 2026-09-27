/**
 * CSV writing for exports (audit log, tracker, import results). Cells that a
 * spreadsheet would run as a formula (=, +, -, @ at the start) are prefixed
 * with a quote, so a username like "=HYPERLINK(...)" stays text.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
