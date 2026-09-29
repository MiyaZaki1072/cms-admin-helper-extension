import { describe, expect, it } from 'vitest';
import { MAX_DIFF_CELLS, diffLines, foldUnchanged, splitLines } from '@/core/diff';

/** Compact form: " x" same, "+x" added, "-x" removed. */
const show = (oldText: string, newText: string) =>
  diffLines(oldText, newText)?.map((l) => `${l.kind === 'same' ? ' ' : l.kind === 'added' ? '+' : '-'}${l.text}`);

describe('splitLines', () => {
  it('ignores CRLF vs LF and a final newline', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
  });
});

describe('diffLines', () => {
  it('identical files are all "same" with both line numbers', () => {
    const d = diffLines('a\nb\n', 'a\r\nb\r\n')!;
    expect(d.every((l) => l.kind === 'same')).toBe(true);
    expect(d[1]).toEqual({ kind: 'same', text: 'b', oldNo: 2, newNo: 2 });
  });

  it('only additions', () => {
    expect(show('a\nc', 'a\nb\nc\nd')).toEqual([' a', '+b', ' c', '+d']);
  });

  it('only deletions', () => {
    expect(show('a\nb\nc', 'c')).toEqual(['-a', '-b', ' c']);
  });

  it('a changed line shows as removed then added, with line numbers on each side', () => {
    const d = diffLines('int main() {\n  return 1;\n}\n', 'int main() {\n  x++;\n  return 0;\n}\n')!;
    expect(d.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['same', 1, 1],
      ['removed', 2, undefined],
      ['added', undefined, 2],
      ['added', undefined, 3],
      ['same', 3, 4],
    ]);
  });

  it('keeps unchanged lines between separate edits', () => {
    expect(show('a\nb\nc\nd\ne', 'a\nB\nc\nd\nE')).toEqual([' a', '-b', '+B', ' c', ' d', '-e', '+E']);
  });

  it('empty files', () => {
    expect(show('', '')).toEqual([]);
    expect(show('', 'x')).toEqual(['+x']);
    expect(show('x', '')).toEqual(['-x']);
  });

  it('gives up when the changed middle is too large', () => {
    const size = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 1;
    const a = Array.from({ length: size }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: size }, (_, i) => `b${i}`).join('\n');
    expect(diffLines(a, b)).toBeNull();
  });

  it('a small edit inside a large file is fine: shared lines are trimmed first', () => {
    const big = Array.from({ length: 10_000 }, (_, i) => `line ${i}`);
    const edited = [...big];
    edited[5000] = 'changed';
    const d = diffLines(big.join('\n'), edited.join('\n'))!;
    expect(d).toHaveLength(10_001);
    expect(d.filter((l) => l.kind !== 'same').map((l) => l.text)).toEqual(['line 5000', 'changed']);
  });
});

describe('foldUnchanged', () => {
  it('keeps context around changes and folds the rest', () => {
    const old = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const next = [...old];
    next[9] = 'changed';
    const rows = foldUnchanged(diffLines(old.join('\n'), next.join('\n'))!, 2);
    expect(rows.map((r) => (r.kind === 'skip' ? `skip ${r.count}` : r.text))).toEqual([
      'skip 7',
      'l8',
      'l9',
      'l10',
      'changed',
      'l11',
      'l12',
      'skip 8',
    ]);
  });

  it('folds everything when nothing changed', () => {
    expect(foldUnchanged(diffLines('a\nb', 'a\nb')!)).toEqual([{ kind: 'skip', count: 2 }]);
  });
});
