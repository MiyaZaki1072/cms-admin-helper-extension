/**
 * Durations as people type them: "1h 30m", "90m", "4h30m", "1d", "45s",
 * "1.5h", "1:30:00", or plain seconds "5400". AWS wants seconds.
 */

const UNIT: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };

/** Seconds, or null if empty or not a duration. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const clock = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(text);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\s*/y;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    total += Number(m[1]) * (UNIT[m[2]!] ?? 0);
    matched = true;
    if (re.lastIndex === text.length) return Math.round(total);
  }
  return matched && re.lastIndex === text.length ? Math.round(total) : null;
}

/** 5400 -> "1 h 30 m"; 0 -> "0 s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const sign = seconds < 0 ? '-' : '';
  let rest = Math.round(Math.abs(seconds));
  const parts: string[] = [];
  for (const [unit, size] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    if (rest >= size) {
      parts.push(`${Math.floor(rest / size)} ${unit}`);
      rest %= size;
    }
  }
  return sign + (parts.join(' ') || '0 s');
}
