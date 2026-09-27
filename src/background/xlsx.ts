/**
 * XLSX in the background worker, so the content script injected on every
 * AWS page does not carry SheetJS. Cells are written as values, never as
 * formulas.
 */
import * as XLSX from 'xlsx';

export type Cell = string | number | boolean | null;

export interface SheetData {
  name: string;
  rows: Cell[][];
}

export function writeXlsx(sheets: SheetData[]): string {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    // Sheet names: max 31 chars, no []:*?/\
    XLSX.utils.book_append_sheet(book, ws, sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1');
  }
  return XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;
}

/** First sheet (or the named one) as rows of strings. */
export function readXlsx(base64: string, sheetName?: string): { sheets: string[]; rows: string[][] } {
  const book = XLSX.read(base64, { type: 'base64', cellFormula: false, cellHTML: false });
  const name = sheetName && book.SheetNames.includes(sheetName) ? sheetName : book.SheetNames[0];
  const ws = name ? book.Sheets[name] : undefined;
  const rows = ws ? (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false }) as unknown[][]) : [];
  return { sheets: book.SheetNames, rows: rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))) };
}
