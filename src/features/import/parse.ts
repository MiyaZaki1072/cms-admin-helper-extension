/** Reading the import source: CSV/TSV text (or a paste from a spreadsheet), XLSX, or a name pattern. */
import Papa from 'papaparse';
import { request } from '@/core/messaging';

/** Rows of trimmed cells; the delimiter (comma, tab, semicolon) is detected. Empty lines are dropped. */
export function parseText(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    delimiter: '',
    delimitersToGuess: ['\t', ',', ';', '|'],
    skipEmptyLines: 'greedy',
  });
  return result.data.map((row) => row.map((cell) => (cell ?? '').trim())).filter((row) => row.some((c) => c !== ''));
}

/** XLSX/XLS via the background (SheetJS lives there). */
export async function parseSpreadsheet(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { rows } = await request({ type: 'xlsx:read', base64: btoa(binary) });
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

export async function readImportFile(file: File): Promise<string[][]> {
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) return parseSpreadsheet(file);
  return parseText(await file.text());
}

export const PATTERN_MAX = 2000;

/**
 * "stu{001..120}" -> stu001 ... stu120 (zero padding follows the first
 * number); "team{1..5}-a" -> team1-a ... team5-a.
 */
export function expandPattern(pattern: string): { ok: true; names: string[] } | { ok: false; error: string } {
  const m = /^(.*)\{(\d+)\.\.(\d+)\}(.*)$/.exec(pattern.trim());
  if (!m) return { ok: false, error: 'Use a pattern like stu{001..120}.' };
  const [, prefix = '', fromText = '', toText = '', suffix = ''] = m;
  if (/[{}]/.test(prefix + suffix)) return { ok: false, error: 'Only one {from..to} range is supported.' };
  const from = Number(fromText);
  const to = Number(toText);
  if (to < from) return { ok: false, error: 'The range goes backwards.' };
  if (to - from + 1 > PATTERN_MAX) return { ok: false, error: `At most ${PATTERN_MAX} users at once.` };
  const width = fromText.length > 1 && fromText.startsWith('0') ? fromText.length : 0;
  const names: string[] = [];
  for (let n = from; n <= to; n++) names.push(`${prefix}${String(n).padStart(width, '0')}${suffix}`);
  return { ok: true, names };
}
