import { describe, expect, it } from 'vitest';
import { formatDateTime, fromLocalInput, toLocalInput, zoneOffsetMs, zonedToUtc } from '@/core/time';

describe('time zones', () => {
  it('Bangkok is UTC+7 all year', () => {
    expect(zoneOffsetMs(Date.UTC(2026, 0, 15), 'Asia/Bangkok')).toBe(7 * 3600_000);
    expect(zoneOffsetMs(Date.UTC(2026, 6, 15), 'Asia/Bangkok')).toBe(7 * 3600_000);
  });

  it('09:00 Bangkok is 02:00 UTC; 06:00 Bangkok is 23:00 UTC the day before', () => {
    expect(zonedToUtc({ year: 2026, month: 10, day: 4, hour: 9, minute: 0 }, 'Asia/Bangkok')).toBe(Date.UTC(2026, 9, 4, 2, 0));
    expect(zonedToUtc({ year: 2026, month: 10, day: 4, hour: 6, minute: 0 }, 'Asia/Bangkok')).toBe(Date.UTC(2026, 9, 3, 23, 0));
  });

  it('handles zones with daylight saving', () => {
    // 2026-03-29 03:30 in Berlin is after the spring-forward (UTC+2).
    expect(zonedToUtc({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 }, 'Europe/Berlin')).toBe(Date.UTC(2026, 2, 29, 1, 30));
  });

  it('formats and round-trips datetime-local values', () => {
    const ms = Date.UTC(2026, 9, 3, 23, 0);
    expect(formatDateTime(ms)).toBe('2026-10-04 06:00:00');
    expect(toLocalInput(ms)).toBe('2026-10-04T06:00');
    expect(fromLocalInput('2026-10-04T06:00')).toBe(ms);
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nonsense')).toBeNull();
  });
});
