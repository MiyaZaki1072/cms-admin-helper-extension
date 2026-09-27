/**
 * Bangkok-time (display zone) helpers on AWS pages. AWS stores and prints
 * every time in UTC; these add the local view next to it:
 * - a clock in the sidebar: local time, UTC, contest countdown, clock-skew warning;
 * - timestamps in the page shown in local time (UTC on hover), with a toggle;
 * - on the contest page: the Quick setup card, local pickers beside the UTC
 *   fields, a timezone dropdown, duration fields that accept "1h 30m", and
 *   warnings before saving;
 * - on participation pages: a picker for "time of first login" and duration
 *   helpers for delay and extra time.
 * DOM calls and textContent only; no server string is inserted as HTML.
 */
import { formatDuration, parseDuration } from '@/core/duration';
import { formatCmsDateTime, parseCmsDateTime, parseContestTimes } from '@/core/parsers';
import { getSettings, onSettingsChanged, saveSettings } from '@/core/settings';
import {
  allZones,
  countdown,
  formatDateTime,
  fromLocalInput,
  getDisplayZone,
  humanDateTime,
  setDisplayZone,
  toLocalInput,
  zoneLabel,
  zoneOffsetMs,
} from '@/core/time';
import { type ContestFormTimes, type QuickSetupResult, computeQuickSetup, saveWarnings } from '@/features/time/contest-times';

const STAMP = /\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)?\b/g;
const SKEW_WARN_MS = 60_000;

export async function installTimeBoost(doc: Document): Promise<void> {
  const settings = await getSettings();
  setDisplayZone(settings.displayZone);
  const stamps = convertTimestamps(doc, settings.pageTimesUtc);
  addClock(doc, stamps);
  const contestForm = doc.querySelector<HTMLFormElement>('form[name="edit_contest"]');
  if (contestForm) enhanceContestForm(doc, contestForm);
  const participationForm = doc.querySelector<HTMLFormElement>('#participation_info form');
  if (participationForm) enhanceParticipationForm(doc, participationForm);
  onSettingsChanged((s) => {
    setDisplayZone(s.displayZone);
    stamps.render(s.pageTimesUtc);
  });
}

/* ---------- small DOM helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function field(form: HTMLFormElement, name: string): HTMLInputElement | null {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const HINT = 'font-size:85%;color:#555;margin-left:6px';
const BAD = 'font-size:85%;color:#b3261e;margin-left:6px';

/* ---------- timestamps ---------- */

function convertTimestamps(doc: Document, initialUtc: boolean): { render: (utc: boolean) => void; utc: () => boolean } {
  const core = doc.getElementById('core');
  const nodes: Array<{ node: Text; original: string; parent: HTMLElement | null; title: string | null }> = [];
  if (core) {
    const walker = doc.createTreeWalker(core, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const parent = n.parentElement;
        if (!parent || parent.closest('script, style, pre, textarea, select, option, #cah-quick-setup, .cah-local-picker')) {
          return NodeFilter.FILTER_REJECT;
        }
        STAMP.lastIndex = 0;
        return STAMP.test(n.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      nodes.push({ node: n as Text, original: n.textContent ?? '', parent, title: parent?.getAttribute('title') ?? null });
    }
  }
  let utc = initialUtc;
  const render = (showUtc: boolean) => {
    utc = showUtc;
    for (const item of nodes) {
      if (showUtc) {
        item.node.textContent = item.original;
        if (item.parent) {
          if (item.title === null) item.parent.removeAttribute('title');
          else item.parent.setAttribute('title', item.title);
        }
        continue;
      }
      const utcTexts: string[] = [];
      item.node.textContent = item.original.replace(STAMP, (_all, stamp: string) => {
        try {
          const ms = parseCmsDateTime(stamp);
          utcTexts.push(stamp);
          return formatDateTime(ms);
        } catch {
          return stamp;
        }
      });
      if (item.parent && utcTexts.length > 0) {
        item.parent.setAttribute('title', `${zoneLabel()} time. UTC: ${utcTexts.join(', ')}`);
      }
    }
  };
  render(utc);
  return { render, utc: () => utc };
}

/* ---------- sidebar clock ---------- */

function addClock(doc: Document, stamps: { render: (utc: boolean) => void; utc: () => boolean }): void {
  const sidebar = doc.getElementById('sidebar');
  if (!sidebar || doc.getElementById('cah-clock')) return;
  const times = parseContestTimes(doc);
  // AWS printed its own time into the page; the difference is this computer's clock error.
  const skew = times ? times.serverNow * 1000 - Date.now() : 0;

  const local = el(doc, 'div');
  const utcLine = el(doc, 'div', { style: 'opacity:.75' });
  const phase = el(doc, 'div', { style: 'font-weight:bold' });
  const warn = el(doc, 'div', { style: 'color:#b3261e' });
  const toggle = el(doc, 'a', { href: '#', style: 'font-size:90%' });
  const box = el(doc, 'div', { id: 'cah-clock', style: 'margin:8px 12px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;line-height:1.5' }, local, utcLine, phase, warn, toggle);

  const tick = () => {
    const now = Date.now() + skew;
    local.textContent = `${zoneLabel()}: ${formatDateTime(now)}`;
    utcLine.textContent = `UTC: ${formatCmsDateTime(now)}`;
    if (times && times.start > 0) {
      phase.textContent = `Contest ${countdown(now, {
        start: times.start * 1000,
        stop: times.stop * 1000,
        analysisStart: times.analysisStart * 1000,
        analysisStop: times.analysisStop * 1000,
      })}`;
    }
    toggle.textContent = stamps.utc() ? `Show page times in ${zoneLabel()}` : 'Show page times in UTC';
  };
  if (Math.abs(skew) > SKEW_WARN_MS) {
    warn.textContent = `This computer's clock is ${Math.round(Math.abs(skew) / 1000)} s ${skew > 0 ? 'behind' : 'ahead of'} the CMS server.`;
  }
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    const next = !stamps.utc();
    stamps.render(next);
    void saveSettings({ pageTimesUtc: next });
    tick();
  });
  tick();
  setInterval(tick, 1000);
  (sidebar.querySelector('.footer') ?? sidebar.querySelector('.hr') ?? sidebar.lastElementChild)?.after(box);
}

/* ---------- pickers and durations ---------- */

/** A local-time picker beside a UTC "YYYY-MM-DD HH:MM:SS" input, kept in sync both ways. */
function attachPicker(doc: Document, input: HTMLInputElement): void {
  const picker = el(doc, 'input', { type: 'datetime-local', 'aria-label': `${input.name} in ${zoneLabel()} time` });
  const utc = el(doc, 'span', { style: HINT });
  const wrap = el(doc, 'span', { class: 'cah-local-picker', style: 'margin-left:8px;white-space:nowrap' }, picker, el(doc, 'span', { style: HINT, text: zoneLabel() }), utc);
  const fromInput = () => {
    const v = input.value.trim();
    if (!v) {
      picker.value = '';
      utc.textContent = '';
      return;
    }
    try {
      const ms = parseCmsDateTime(v);
      picker.value = toLocalInput(ms);
      utc.textContent = '';
      utc.style.cssText = HINT;
    } catch {
      utc.textContent = 'not a valid UTC time';
      utc.style.cssText = BAD;
    }
  };
  picker.addEventListener('input', () => {
    const ms = fromLocalInput(picker.value);
    if (ms === null) return;
    input.value = formatCmsDateTime(ms);
    utc.textContent = `= ${input.value} UTC`;
    utc.style.cssText = HINT;
  });
  input.addEventListener('input', fromInput);
  fromInput();
  input.after(wrap);
}

/** Lets a seconds field take "1h 30m"; shows the value in words and converts to seconds on blur. */
function attachDuration(doc: Document, input: HTMLInputElement): () => void {
  const hint = el(doc, 'span', { class: 'cah-duration-hint', style: HINT });
  const show = () => {
    const raw = input.value.trim();
    if (!raw) {
      hint.textContent = '';
      return;
    }
    const seconds = parseDuration(raw);
    if (seconds === null) {
      hint.textContent = 'not a duration (e.g. 90m, 1h 30m, 5400)';
      hint.style.cssText = BAD;
    } else {
      hint.textContent = /^\d+(\.\d+)?$/.test(raw) ? `= ${formatDuration(seconds)}` : `= ${seconds} seconds`;
      hint.style.cssText = HINT;
    }
  };
  const convert = () => {
    const raw = input.value.trim();
    const seconds = parseDuration(raw);
    if (seconds !== null && !/^\d+(\.\d+)?$/.test(raw)) {
      input.value = String(seconds);
      show();
    }
  };
  input.addEventListener('input', show);
  input.addEventListener('blur', convert);
  input.after(hint);
  show();
  return convert;
}

/* ---------- contest page ---------- */

function readTimes(form: HTMLFormElement): ContestFormTimes {
  return {
    start: field(form, 'start')?.value.trim() ?? '',
    stop: field(form, 'stop')?.value.trim() ?? '',
    timezone: field(form, 'timezone')?.value.trim() ?? '',
    analysisEnabled: field(form, 'analysis_enabled')?.checked ?? false,
    analysisStart: field(form, 'analysis_start')?.value.trim() ?? '',
    analysisStop: field(form, 'analysis_stop')?.value.trim() ?? '',
  };
}

function enhanceContestForm(doc: Document, form: HTMLFormElement): void {
  const saved = readTimes(form);
  for (const name of ['start', 'stop', 'analysis_start', 'analysis_stop']) {
    const input = field(form, name);
    if (input) attachPicker(doc, input);
  }
  const converters = ['per_user_time', 'min_submission_interval', 'min_user_test_interval', 'token_min_interval']
    .map((name) => field(form, name))
    .filter((i): i is HTMLInputElement => i !== null)
    .map((i) => attachDuration(doc, i));
  addTimezoneSelect(doc, form);
  form.before(quickSetupCard(doc, form));
  guardSave(doc, form, saved, converters);
}

function addTimezoneSelect(doc: Document, form: HTMLFormElement): void {
  const input = field(form, 'timezone');
  if (!input) return;
  const select = el(doc, 'select', { 'aria-label': 'Choose timezone', style: 'margin-left:8px;max-width:14em' });
  select.append(el(doc, 'option', { value: '', text: 'Choose…' }));
  for (const zone of allZones()) select.append(el(doc, 'option', { value: zone, text: zone }));
  const warn = el(doc, 'span', { style: BAD });
  const sync = () => {
    select.value = allZones().includes(input.value.trim()) ? input.value.trim() : '';
    warn.textContent = input.value.trim() ? '' : 'Empty: contestants will see UTC times.';
  };
  select.addEventListener('change', () => {
    if (select.value) setValue(input, select.value);
    sync();
  });
  input.addEventListener('input', sync);
  sync();
  input.after(select, warn);
}

function quickSetupCard(doc: Document, form: HTMLFormElement): HTMLElement {
  const zone = getDisplayZone();
  const label = zoneLabel(zone);
  const current = readTimes(form);
  let startMs: number | null = null;
  let stopMs: number | null = null;
  try {
    startMs = parseCmsDateTime(current.start);
    stopMs = parseCmsDateTime(current.stop);
  } catch {
    // leave the card empty
  }
  const initial = startMs !== null ? toLocalInput(startMs, zone) : '';
  const date = el(doc, 'input', { type: 'date', 'aria-label': 'Contest date', value: initial.slice(0, 10) });
  const start = el(doc, 'input', { type: 'time', 'aria-label': 'Start time', value: initial.slice(11, 16) });
  const length = el(doc, 'input', {
    type: 'text',
    size: '8',
    placeholder: '5h',
    'aria-label': 'Length',
    value: startMs !== null && stopMs !== null && stopMs > startMs ? formatDuration((stopMs - startMs) / 1000).replace(/ /g, '') : '',
  });
  const analysis = el(doc, 'input', { type: 'checkbox', 'aria-label': 'Analysis mode' });
  const after = el(doc, 'input', { type: 'text', size: '6', value: '30m', 'aria-label': 'Analysis starts after' });
  const lasts = el(doc, 'input', { type: 'text', size: '6', value: '1d', 'aria-label': 'Analysis lasts' });
  const perUser = el(doc, 'input', { type: 'checkbox', 'aria-label': 'Per-user time' });
  const perLength = el(doc, 'input', { type: 'text', size: '6', placeholder: '3h', 'aria-label': 'Time per contestant' });
  const fill = el(doc, 'button', { type: 'button', text: 'Fill the form' });
  const out = el(doc, 'div', { 'data-testid': 'quick-setup-result' });

  const row = (...children: Array<Node | string>) => el(doc, 'div', { style: 'margin:4px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, ...children);
  const card = el(
    doc,
    'div',
    { id: 'cah-quick-setup', style: 'border:1px solid #9ab;border-radius:8px;padding:10px 14px;margin:0 0 14px;max-width:46em;background:#f7fbff' },
    el(doc, 'strong', { text: `Quick setup (${label} time)` }),
    el(doc, 'div', { style: 'font-size:90%;color:#555', text: `Enter the contest in ${label} time; the helper fills the UTC fields below. Then press Update to save.` }),
    row('Date', date, 'Start', start, 'Length', length),
    row(analysis, 'Analysis mode, starting', after, 'after the end, lasting', lasts),
    row(perUser, 'Per-user time (USACO style): each contestant gets', perLength, 'inside the window'),
    row(fill),
    out,
  );

  fill.addEventListener('click', () => {
    const result = computeQuickSetup(
      {
        date: date.value,
        start: start.value,
        length: length.value,
        analysis: analysis.checked ? { after: after.value, length: lasts.value } : null,
        perUser: perUser.checked ? { length: perLength.value } : null,
      },
      zone,
    );
    out.replaceChildren();
    if (!result.ok) {
      out.append(el(doc, 'p', { style: 'color:#b3261e', text: result.error }));
      return;
    }
    applyQuickSetup(form, result.value, zone);
    out.append(summaryTable(doc, result.value, label));
  });
  return card;
}

function applyQuickSetup(form: HTMLFormElement, value: QuickSetupResult, zone: string): void {
  const set = (name: string, v: string) => {
    const input = field(form, name);
    if (input) setValue(input, v);
  };
  set('start', value.form.start);
  set('stop', value.form.stop);
  set('timezone', zone);
  set('per_user_time', value.form.per_user_time);
  const enabled = field(form, 'analysis_enabled');
  if (value.form.analysis_start && value.form.analysis_stop) {
    set('analysis_start', value.form.analysis_start);
    set('analysis_stop', value.form.analysis_stop);
    if (enabled) enabled.checked = true;
  } else if (enabled) {
    enabled.checked = false;
  }
}

function summaryTable(doc: Document, v: QuickSetupResult, label: string): HTMLElement {
  const table = el(doc, 'table', { style: 'border-collapse:collapse;margin-top:6px' });
  const add = (cells: string[], head = false) => {
    const tr = table.insertRow();
    for (const c of cells) {
      const cell = el(doc, head ? 'th' : 'td', { style: 'border:1px solid #ccc;padding:2px 8px;text-align:left', text: c });
      tr.append(cell);
    }
  };
  add(['', `${label} (${zoneOffsetLabel(v.start)})`, 'Goes into CMS (UTC)'], true);
  add(['Start', humanDateTime(v.start), v.form.start]);
  add(['End', humanDateTime(v.stop), v.form.stop]);
  add(['Length', formatDuration((v.stop - v.start) / 1000), '—']);
  if (v.analysisStart !== null && v.analysisStop !== null) {
    add(['Analysis start', humanDateTime(v.analysisStart), v.form.analysis_start ?? '']);
    add(['Analysis end', humanDateTime(v.analysisStop), v.form.analysis_stop ?? '']);
  }
  if (v.perUserTime !== null) add(['Time per contestant', formatDuration(v.perUserTime), `${v.perUserTime} s`]);
  const note = el(doc, 'p', { style: 'color:#1a7f37;margin:6px 0 0', text: 'Form filled. Check the table, then press Update below to save.' });
  return el(doc, 'div', {}, table, note);
}

function zoneOffsetLabel(ms: number): string {
  const offsetMin = Math.round(zoneOffsetMs(ms) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
}

/** Converts duration fields, then asks for confirmation if the times look wrong. */
function guardSave(doc: Document, form: HTMLFormElement, saved: ContestFormTimes, converters: Array<() => void>): void {
  let acknowledged = false;
  const box = el(doc, 'div', {
    id: 'cah-save-warnings',
    role: 'alert',
    style: 'display:none;border:1px solid #b3261e;background:#fdecea;border-radius:6px;padding:8px 12px;margin:8px 0;max-width:46em',
  });
  form.addEventListener('submit', (event) => {
    for (const convert of converters) convert();
    if (acknowledged) return;
    const warnings = saveWarnings(readTimes(form), saved, Date.now());
    if (warnings.length === 0) return;
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const list = el(doc, 'ul', { style: 'margin:4px 0 8px 18px;padding:0' });
    for (const w of warnings) list.append(el(doc, 'li', { text: w }));
    const saveAnyway = el(doc, 'button', { type: 'button', text: 'Save anyway' });
    const cancel = el(doc, 'button', { type: 'button', text: 'Cancel', style: 'margin-left:6px' });
    saveAnyway.addEventListener('click', () => {
      acknowledged = true;
      box.style.display = 'none';
      form.requestSubmit(submitter instanceof HTMLInputElement || submitter instanceof HTMLButtonElement ? submitter : undefined);
    });
    cancel.addEventListener('click', () => {
      box.style.display = 'none';
    });
    box.replaceChildren(el(doc, 'strong', { text: 'Check before saving:' }), list, saveAnyway, cancel);
    box.style.display = 'block';
    box.scrollIntoView({ block: 'center' });
  });
  (form.querySelector('input[type="submit"]') ?? form.lastElementChild)?.before(box);
}

/* ---------- participation page ---------- */

function enhanceParticipationForm(doc: Document, form: HTMLFormElement): void {
  const starting = field(form, 'starting_time');
  if (starting) attachPicker(doc, starting);
  const converters = ['delay_time', 'extra_time']
    .map((name) => field(form, name))
    .filter((i): i is HTMLInputElement => i !== null)
    .map((i) => attachDuration(doc, i));
  form.addEventListener('submit', () => {
    for (const convert of converters) convert();
  });
}
