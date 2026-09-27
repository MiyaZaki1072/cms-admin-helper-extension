/** Save text as a file from the content script (no extra permission needed). */
export function downloadText(filename: string, content: string | Blob, type = 'text/csv;charset=utf-8'): void {
  // BOM so Excel opens UTF-8 CSV (Thai names) correctly.
  const blob = content instanceof Blob ? content : new Blob([type.startsWith('text/csv') ? '﻿' : '', content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "2026-09-27-1530" for file names. */
export function fileStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
