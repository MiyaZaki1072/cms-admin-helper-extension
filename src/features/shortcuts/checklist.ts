/** Pre-contest checklist: things to fix before contestants arrive. */
import type { ContestSettings } from '@/core/parsers';
import { parseCmsDateTime } from '@/core/parsers';
import { formatDateTime } from '@/core/time';

export interface CheckItem {
  level: 'ok' | 'warn' | 'error';
  text: string;
}

export function contestChecks(input: { settings: ContestSettings; taskCount: number; participantCount: number; now: number }): CheckItem[] {
  const { settings, taskCount, participantCount, now } = input;
  const out: CheckItem[] = [];
  let start: number | null = null;
  let stop: number | null = null;
  try {
    start = parseCmsDateTime(settings.start);
    stop = parseCmsDateTime(settings.stop);
  } catch {
    out.push({ level: 'error', text: 'Start or end time is not set or not valid.' });
  }
  if (start !== null && stop !== null) {
    if (stop <= start) out.push({ level: 'error', text: 'The contest ends before it starts.' });
    else if (stop - start > 12 * 3600_000) out.push({ level: 'warn', text: `The contest lasts ${Math.round((stop - start) / 3600_000)} hours.` });
    else out.push({ level: 'ok', text: `Runs ${formatDateTime(start)} – ${formatDateTime(stop).slice(11)} (display time).` });
    if (now >= stop) out.push({ level: 'warn', text: 'The contest is already over.' });
    else if (now >= start) out.push({ level: 'warn', text: 'The contest is already running.' });
  }
  out.push(
    settings.timezone.trim()
      ? { level: 'ok', text: `Timezone: ${settings.timezone}.` }
      : { level: 'warn', text: 'The contest timezone is empty: contestants see UTC times.' },
  );
  const languages = settings.fields.filter(([k]) => k === 'languages').map(([, v]) => v);
  out.push(languages.length > 0 ? { level: 'ok', text: `Languages: ${languages.join(', ')}.` } : { level: 'error', text: 'No programming language is enabled.' });
  out.push(taskCount > 0 ? { level: 'ok', text: `${taskCount} task(s).` } : { level: 'error', text: 'The contest has no tasks.' });
  out.push(participantCount > 0 ? { level: 'ok', text: `${participantCount} contestant(s).` } : { level: 'warn', text: 'Nobody is in the contest yet.' });
  if (settings.perUserTime.trim()) out.push({ level: 'ok', text: `Per-user time: ${settings.perUserTime} s per contestant.` });
  if (settings.analysisEnabled && stop !== null) {
    try {
      if (parseCmsDateTime(settings.analysisStart) < stop) out.push({ level: 'warn', text: 'Analysis mode starts before the contest ends.' });
    } catch {
      out.push({ level: 'warn', text: 'Analysis mode times are not valid.' });
    }
  }
  return out;
}
