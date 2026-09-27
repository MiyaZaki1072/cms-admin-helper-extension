import type { ContestTimes } from '../model';
import { getField, serializeForm } from './form';
import { AWS_UTILS_CALL, CONTEST_FORM, HREF, PAGE } from './selectors';
import { ParseError, idFrom, text } from './util';

export interface ContestSettings {
  fields: Array<[string, string]>;
  name: string;
  description: string;
  /** UTC "YYYY-MM-DD HH:MM:SS" as in the form. */
  start: string;
  stop: string;
  timezone: string;
  /** Seconds, or "" when not a per-user-time contest. */
  perUserTime: string;
  analysisEnabled: boolean;
  analysisStart: string;
  analysisStop: string;
}

/** /contest/{c}: the contest settings form. */
export function parseContestForm(doc: Document): ContestSettings {
  const form = doc.querySelector<HTMLFormElement>(CONTEST_FORM.form);
  if (!form) throw new ParseError('contest form', 'form "edit_contest" not found');
  for (const name of ['name', 'start', 'stop', 'timezone', 'analysis_start', 'analysis_stop']) {
    if (!form.querySelector(`[name="${name}"]`)) throw new ParseError('contest form', `field "${name}" not found`);
  }
  const fields = serializeForm(form);
  return {
    fields,
    name: getField(fields, 'name') ?? '',
    description: getField(fields, 'description') ?? '',
    start: getField(fields, 'start') ?? '',
    stop: getField(fields, 'stop') ?? '',
    timezone: getField(fields, 'timezone') ?? '',
    perUserTime: getField(fields, 'per_user_time') ?? '',
    analysisEnabled: getField(fields, 'analysis_enabled') !== undefined,
    analysisStart: getField(fields, 'analysis_start') ?? '',
    analysisStop: getField(fields, 'analysis_stop') ?? '',
  };
}

/** Contest and server times from the AWSUtils(...) call in the page head. Null if absent. */
export function parseContestTimes(doc: Document): ContestTimes | null {
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const m = AWS_UTILS_CALL.exec(script.textContent ?? '');
    if (m) {
      const [, now, start, stop, aStart, aStop, phase] = m.map(Number) as number[];
      return {
        serverNow: now!,
        start: start!,
        stop: stop!,
        analysisStart: aStart!,
        analysisStop: aStop!,
        phase: phase!,
      };
    }
  }
  return null;
}

/** The contest this page belongs to (from the sidebar), or null on non-contest pages. */
export function parseCurrentContest(doc: Document): { id: number; name: string } | null {
  const name = doc.querySelector(PAGE.contestName);
  if (!name) return null;
  for (const a of doc.querySelectorAll(`${PAGE.sidebarMenu} a.menu_link`)) {
    const id = idFrom(HREF.contest, a.getAttribute('href'));
    if (id !== null) return { id, name: text(name) };
  }
  return null;
}
