/**
 * Export a table as CSV (built here) or XLSX (built by the background).
 */
import { toCsv } from './csv';
import { request } from './messaging';

export type Cell = string | number | boolean | null;
export type ExportFormat = 'csv' | 'xlsx';

export interface ExportSheet {
  name: string;
  rows: Cell[][];
}

export async function buildExport(format: ExportFormat, sheets: ExportSheet[]): Promise<Blob> {
  if (format === 'csv') {
    // CSV holds one sheet; BOM so Excel reads UTF-8 (Thai names).
    return new Blob(['﻿', toCsv(sheets[0]?.rows ?? [])], { type: 'text/csv;charset=utf-8' });
  }
  const { base64 } = await request({ type: 'xlsx:write', sheets });
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
