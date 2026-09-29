/**
 * Line diff for comparing two versions of a contestant's source file.
 * Common leading and trailing lines are trimmed first, then the changed
 * middle is aligned with a longest-common-subsequence table.
 */

export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
  /** 1-based line number in the old file (same and removed lines). */
  oldNo?: number;
  /** 1-based line number in the new file (same and added lines). */
  newNo?: number;
}

/** A run of unchanged lines hidden from the view. */
export interface DiffSkip {
  kind: 'skip';
  count: number;
}

/** Largest changed middle (old lines × new lines) that is aligned; beyond it diffLines gives up. */
export const MAX_DIFF_CELLS = 4_000_000;

/** Split into lines, ignoring \r\n vs \n and a final newline. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Line diff of `oldText` → `newText`, or null when the changed part is too large to align. */
export function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_DIFF_CELLS) return null;

  const out: DiffLine[] = [];
  const same = (i: number, j: number) => out.push({ kind: 'same', text: a[i]!, oldNo: i + 1, newNo: j + 1 });
  for (let k = 0; k < start; k++) same(k, k);

  // lcs[i * (m + 1) + j] = LCS length of a[start+i..endA) and b[start+j..endB).
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[start + i] === b[start + j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      middle.push({ kind: 'same', text: a[start + i]!, oldNo: start + i + 1, newNo: start + j + 1 });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i * w + j + 1]! >= lcs[(i + 1) * w + j]!)) {
      middle.push({ kind: 'added', text: b[start + j]!, newNo: start + j + 1 });
      j++;
    } else {
      middle.push({ kind: 'removed', text: a[start + i]!, oldNo: start + i + 1 });
      i++;
    }
  }
  out.push(...removedFirst(middle));

  for (let k = 0; k < a.length - endA; k++) same(endA + k, endB + k);
  return out;
}

/** Within each run of consecutive changes, put removed lines before the added ones that replace them. */
function removedFirst(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];
  let run: DiffLine[] = [];
  const flush = () => {
    out.push(...run.filter((l) => l.kind === 'removed'), ...run.filter((l) => l.kind === 'added'));
    run = [];
  };
  for (const l of lines) {
    if (l.kind === 'same') {
      flush();
      out.push(l);
    } else run.push(l);
  }
  flush();
  return out;
}

/** Keep `context` unchanged lines around each change; fold longer unchanged runs into a skip marker. */
export function foldUnchanged(lines: readonly DiffLine[], context = 3): Array<DiffLine | DiffSkip> {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, k) => {
    if (l.kind === 'same') return;
    for (let c = Math.max(0, k - context); c <= Math.min(lines.length - 1, k + context); c++) keep[c] = true;
  });
  const out: Array<DiffLine | DiffSkip> = [];
  let skipped = 0;
  lines.forEach((l, k) => {
    if (keep[k]) {
      if (skipped > 0) out.push({ kind: 'skip', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped > 0) out.push({ kind: 'skip', count: skipped });
  return out;
}
