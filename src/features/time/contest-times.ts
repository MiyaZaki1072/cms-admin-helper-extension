/**
 * Contest times entered in local time (Bangkok by default), converted to
 * the UTC values the AWS contest form stores, plus the checks shown before
 * saving.
 */
import { parseDuration } from '@/core/duration';
import { formatCmsDateTime, parseCmsDateTime } from '@/core/parsers';
import { zonedToUtc } from '@/core/time';

export interface QuickSetupInput {
  /** "2026-10-04" in `zone`. */
  date: string;
  /** "09:00" in `zone`. */
  start: string;
  /** "5h", "4h30m", ... */
  length: string;
  /** Analysis mode: starts `after` the end, lasts `length`. */
  analysis?: { after: string; length: string } | null;
  /** USACO-style: time each contestant gets inside the window. */
  perUser?: { length: string } | null;
}

export interface QuickSetupResult {
  /** ms since epoch */
  start: number;
  stop: number;
  analysisStart: number | null;
  analysisStop: number | null;
  /** seconds, or null when not a per-user-time contest */
  perUserTime: number | null;
  /** AWS form values, UTC. */
  form: {
    start: string;
    stop: string;
    analysis_start: string | null;
    analysis_stop: string | null;
    per_user_time: string;
  };
}

export function computeQuickSetup(input: QuickSetupInput, zone: string): { ok: true; value: QuickSetupResult } | { ok: false; error: string } {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date.trim());
  if (!date) return { ok: false, error: 'Pick a date.' };
  const time = /^(\d{1,2}):(\d{2})$/.exec(input.start.trim());
  if (!time || Number(time[1]) > 23) return { ok: false, error: 'Enter the start time as HH:MM, e.g. 09:00.' };
  const length = parseDuration(input.length);
  if (!length || length <= 0) return { ok: false, error: 'Enter the length, e.g. 5h or 4h30m.' };

  const start = zonedToUtc(
    { year: Number(date[1]), month: Number(date[2]), day: Number(date[3]), hour: Number(time[1]), minute: Number(time[2]) },
    zone,
  );
  const stop = start + length * 1000;

  let analysisStart: number | null = null;
  let analysisStop: number | null = null;
  if (input.analysis) {
    const after = parseDuration(input.analysis.after || '0');
    const aLength = parseDuration(input.analysis.length);
    if (after === null || after < 0) return { ok: false, error: 'Enter when analysis starts after the end, e.g. 30m.' };
    if (!aLength || aLength <= 0) return { ok: false, error: 'Enter how long analysis lasts, e.g. 1d.' };
    analysisStart = stop + after * 1000;
    analysisStop = analysisStart + aLength * 1000;
  }

  let perUserTime: number | null = null;
  if (input.perUser) {
    perUserTime = parseDuration(input.perUser.length);
    if (!perUserTime || perUserTime <= 0) return { ok: false, error: 'Enter the time per contestant, e.g. 3h.' };
    if (perUserTime > length) return { ok: false, error: 'The time per contestant is longer than the window.' };
  }

  return {
    ok: true,
    value: {
      start,
      stop,
      analysisStart,
      analysisStop,
      perUserTime,
      form: {
        start: formatCmsDateTime(start),
        stop: formatCmsDateTime(stop),
        analysis_start: analysisStart === null ? null : formatCmsDateTime(analysisStart),
        analysis_stop: analysisStop === null ? null : formatCmsDateTime(analysisStop),
        per_user_time: perUserTime === null ? '' : String(perUserTime),
      },
    },
  };
}

/** The time-related fields of the AWS contest form, as strings. */
export interface ContestFormTimes {
  start: string;
  stop: string;
  timezone: string;
  analysisEnabled: boolean;
  analysisStart: string;
  analysisStop: string;
}

export const MAX_REASONABLE_LENGTH_H = 12;

/**
 * Problems to confirm before saving the contest form. `saved` is the form as
 * loaded, so "start already passed" is only raised when the start changes.
 */
export function saveWarnings(form: ContestFormTimes, saved: ContestFormTimes | null, now: number): string[] {
  const out: string[] = [];
  const at = (v: string, what: string): number | null => {
    try {
      return parseCmsDateTime(v);
    } catch {
      out.push(`${what} "${v}" is not a valid time (use YYYY-MM-DD HH:MM:SS, UTC).`);
      return null;
    }
  };
  const start = at(form.start, 'Start');
  const stop = at(form.stop, 'End');
  if (start !== null && stop !== null) {
    if (stop <= start) out.push('The contest ends before it starts.');
    else if (stop - start > MAX_REASONABLE_LENGTH_H * 3600_000) {
      out.push(`The contest lasts ${Math.round((stop - start) / 3600_000)} hours; more than ${MAX_REASONABLE_LENGTH_H} is probably a typo.`);
    }
  }
  if (start !== null && start < now && form.start !== saved?.start) out.push('The new start time has already passed.');
  if (form.analysisEnabled) {
    const aStart = at(form.analysisStart, 'Analysis start');
    const aStop = at(form.analysisStop, 'Analysis end');
    if (aStart !== null && aStop !== null && aStop <= aStart) out.push('Analysis mode ends before it starts.');
    if (aStart !== null && stop !== null && aStart < stop) out.push('Analysis mode starts before the contest ends.');
  }
  if (!form.timezone.trim()) out.push('The contest timezone is empty, so contestants see times in UTC. Asia/Bangkok is usual.');
  return out;
}
