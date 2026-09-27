/** Display timezone helpers. All conversion uses Intl; no timezone library. */

export const DEFAULT_ZONE = 'Asia/Bangkok';

let displayZone = DEFAULT_ZONE;

/** Zone the helper shows times in (setting, default Asia/Bangkok). */
export function getDisplayZone(): string {
  return displayZone;
}

export function setDisplayZone(zone: string): void {
  displayZone = isValidZone(zone) ? zone : DEFAULT_ZONE;
}

export function isValidZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "Asia/Bangkok" -> "Bangkok", "America/New_York" -> "New York". */
export function zoneLabel(zone = displayZone): string {
  if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/** IANA zone names, Asia/Bangkok first. */
export function allZones(): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = ['Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'UTC'];
  return [DEFAULT_ZONE, 'UTC', ...zones.filter((z) => z !== DEFAULT_ZONE && z !== 'UTC')];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** Wall-clock parts of `ms` in `zone`. */
export function zonedParts(ms: number, zone = displayZone) {
  const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-04 09:00:00" in `zone`. */
export function formatDateTime(ms: number, zone = displayZone): string {
  const p = zonedParts(ms, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Offset of `zone` from UTC at instant `ms` (e.g. +7 h for Bangkok), in ms. */
export function zoneOffsetMs(ms: number, zone = displayZone): number {
  const p = zonedParts(ms, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export interface WallTime {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

/** The UTC instant at which the clock in `zone` shows `wall`. */
export function zonedToUtc(wall: WallTime, zone = displayZone): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second ?? 0);
  const first = guess - zoneOffsetMs(guess, zone);
  // Re-check with the offset at the result (matters around DST changes).
  return guess - zoneOffsetMs(first, zone);
}

/** "2026-10-04T06:00" for <input type="datetime-local">, in `zone`. */
export function toLocalInput(ms: number, zone = displayZone): string {
  const p = zonedParts(ms, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parse a datetime-local value as wall time in `zone`; null if empty or invalid. */
export function fromLocalInput(value: string, zone = displayZone): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map((v) => (v === undefined ? undefined : Number(v)));
  return zonedToUtc({ year: y!, month: mo!, day: d!, hour: h!, minute: mi!, second: s ?? 0 }, zone);
}

/** "09:00" in `zone`. */
export function formatTime(ms: number, zone = displayZone): string {
  const p = zonedParts(ms, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Sun 4 Oct 2026, 09:00" in `zone`. */
export function humanDateTime(ms: number, zone = displayZone): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

/** "2 h 14 m", "38 m", "45 s". */
export function shortSpan(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} m` : `${h} h`;
  if (m > 0) return `${m} m`;
  return `${s} s`;
}

/** Contest phase in words, e.g. "starts in 2 h 14 m", "ends in 38 m", "analysis open". All times in ms. */
export function countdown(
  now: number,
  t: { start: number; stop: number; analysisStart?: number | null; analysisStop?: number | null },
): string {
  if (now < t.start) return `starts in ${shortSpan(t.start - now)}`;
  if (now < t.stop) return `ends in ${shortSpan(t.stop - now)}`;
  const aStart = t.analysisStart ?? null;
  const aStop = t.analysisStop ?? null;
  if (aStart !== null && aStop !== null && aStop > aStart) {
    if (now < aStart) return `over; analysis opens in ${shortSpan(aStart - now)}`;
    if (now < aStop) return `analysis open, closes in ${shortSpan(aStop - now)}`;
  }
  return 'over';
}
