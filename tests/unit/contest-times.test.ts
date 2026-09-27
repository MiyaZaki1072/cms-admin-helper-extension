import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from '@/core/duration';
import { countdown, humanDateTime } from '@/core/time';
import { type ContestFormTimes, computeQuickSetup, saveWarnings } from '@/features/time/contest-times';

describe('durations', () => {
  it.each([
    ['5h', 18000],
    ['4h30m', 16200],
    ['1h 30m', 5400],
    ['90m', 5400],
    ['1.5h', 5400],
    ['1d', 86400],
    ['45s', 45],
    ['1:30:00', 5400],
    ['1:30', 5400],
    ['5400', 5400],
    ['  2H  ', 7200],
  ])('%s = %i s', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });
  it.each(['', 'abc', '5x', 'h5', '1h abc'])('rejects %j', (text) => {
    expect(parseDuration(text)).toBeNull();
  });
  it('formats', () => {
    expect(formatDuration(5400)).toBe('1 h 30 m');
    expect(formatDuration(18000)).toBe('5 h');
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(90061)).toBe('1 d 1 h 1 m 1 s');
  });
});

describe('quick setup', () => {
  it('09:00-14:00 Bangkok becomes 02:00-07:00 UTC', () => {
    const r = computeQuickSetup({ date: '2026-10-04', start: '09:00', length: '5h' }, 'Asia/Bangkok');
    expect(r.ok && r.value.form).toEqual({
      start: '2026-10-04 02:00:00',
      stop: '2026-10-04 07:00:00',
      analysis_start: null,
      analysis_stop: null,
      per_user_time: '',
    });
    expect(r.ok && humanDateTime(r.value.start, 'Asia/Bangkok')).toBe('Sun 4 Oct 2026, 09:00');
  });

  it('06:00 Bangkok starts at 23:00 UTC the day before', () => {
    const r = computeQuickSetup({ date: '2026-10-04', start: '06:00', length: '4h30m' }, 'Asia/Bangkok');
    expect(r.ok && r.value.form.start).toBe('2026-10-03 23:00:00');
    expect(r.ok && r.value.form.stop).toBe('2026-10-04 03:30:00');
  });

  it('analysis window and per-user time', () => {
    const r = computeQuickSetup(
      { date: '2026-10-04', start: '09:00', length: '5h', analysis: { after: '30m', length: '1d' }, perUser: { length: '3h' } },
      'Asia/Bangkok',
    );
    expect(r.ok && r.value.form).toMatchObject({
      analysis_start: '2026-10-04 07:30:00',
      analysis_stop: '2026-10-05 07:30:00',
      per_user_time: '10800',
    });
  });

  it('explains bad input', () => {
    expect(computeQuickSetup({ date: '', start: '09:00', length: '5h' }, 'Asia/Bangkok')).toEqual({ ok: false, error: 'Pick a date.' });
    expect(computeQuickSetup({ date: '2026-10-04', start: '25:00', length: '5h' }, 'Asia/Bangkok').ok).toBe(false);
    expect(computeQuickSetup({ date: '2026-10-04', start: '09:00', length: 'soon' }, 'Asia/Bangkok').ok).toBe(false);
    expect(
      computeQuickSetup({ date: '2026-10-04', start: '09:00', length: '2h', perUser: { length: '3h' } }, 'Asia/Bangkok'),
    ).toEqual({ ok: false, error: 'The time per contestant is longer than the window.' });
  });
});

describe('save warnings', () => {
  const now = Date.UTC(2026, 9, 1);
  const good: ContestFormTimes = {
    start: '2026-10-04 02:00:00',
    stop: '2026-10-04 07:00:00',
    timezone: 'Asia/Bangkok',
    analysisEnabled: false,
    analysisStart: '2030-01-01 00:00:00',
    analysisStop: '2030-01-01 00:00:00',
  };
  it('none for a sensible contest', () => {
    expect(saveWarnings(good, good, now)).toEqual([]);
  });
  it('end before start, too long, empty timezone', () => {
    expect(saveWarnings({ ...good, stop: '2026-10-04 01:00:00' }, good, now)).toContain('The contest ends before it starts.');
    expect(saveWarnings({ ...good, stop: '2026-10-05 07:00:00' }, good, now)[0]).toMatch(/lasts 29 hours/);
    expect(saveWarnings({ ...good, timezone: ' ' }, good, now)[0]).toMatch(/timezone is empty/);
  });
  it('start already passed, only when the start changed', () => {
    const later = Date.UTC(2026, 9, 4, 3);
    expect(saveWarnings(good, good, later)).toEqual([]);
    expect(saveWarnings({ ...good, start: '2026-10-04 02:30:00' }, good, later)).toContain('The new start time has already passed.');
  });
  it('analysis overlapping the contest', () => {
    const w = saveWarnings({ ...good, analysisEnabled: true, analysisStart: '2026-10-04 06:00:00', analysisStop: '2026-10-05 00:00:00' }, good, now);
    expect(w).toContain('Analysis mode starts before the contest ends.');
  });
  it('unparseable times', () => {
    expect(saveWarnings({ ...good, start: 'tomorrow' }, good, now)[0]).toMatch(/not a valid time/);
  });
});

describe('countdown', () => {
  const t = { start: 10_000_000, stop: 10_000_000 + 5 * 3600_000 };
  it('before, during, after', () => {
    expect(countdown(t.start - (2 * 3600 + 14 * 60) * 1000, t)).toBe('starts in 2 h 14 m');
    expect(countdown(t.stop - 38 * 60_000, t)).toBe('ends in 38 m');
    expect(countdown(t.stop + 1, t)).toBe('over');
    expect(countdown(t.stop + 1, { ...t, analysisStart: t.stop, analysisStop: t.stop + 3600_000 })).toBe('analysis open, closes in 59 m');
  });
});
