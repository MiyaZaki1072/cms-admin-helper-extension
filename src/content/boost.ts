/**
 * Small additions to AWS's own pages:
 * - a filter bar above submission tables (filters the rows on the page)
 *   and an "only" link next to each username that opens the tracker on
 *   that contestant;
 * - a hover card on every participation link with the contestant's score
 *   summary from the tracker index (no extra requests).
 * Everything is built with DOM calls and textContent; no server string is
 * inserted as HTML.
 */
import type { AwsClient } from '@/core/aws-client';
import { parseCurrentContest } from '@/core/parsers';
import { HREF, SUBMISSIONS } from '@/core/parsers/selectors';
import { formatDateTime } from '@/core/time';
import { summarizePerson } from '@/features/tracker/analysis';
import { getTracker } from '@/features/tracker/registry';

interface Options {
  doc: Document;
  client: AwsClient;
  openPerson: (userId: number) => void;
}

export function installBoost({ doc, client, openPerson }: Options): void {
  const contest = parseCurrentContest(doc);
  if (!contest) return;
  addSubmissionsFilter(doc, contest.id, openPerson);
  addHoverCards(doc, client, contest.id);
}

function submissionsTable(doc: Document): HTMLTableElement | null {
  for (const table of doc.querySelectorAll<HTMLTableElement>(`${SUBMISSIONS.container} ${SUBMISSIONS.table}`)) {
    const heads = [...table.querySelectorAll(':scope > thead > tr > th')].map((th) => th.textContent?.trim());
    if (heads[0] === 'Time' && heads[1] === 'User') return table;
  }
  return null;
}

function addSubmissionsFilter(doc: Document, contestId: number, openPerson: (userId: number) => void): void {
  const table = submissionsTable(doc);
  if (!table || doc.getElementById('cah-inline-filter')) return;
  const rows = [...table.querySelectorAll<HTMLTableRowElement>(SUBMISSIONS.rows)];

  // "only" links next to usernames.
  for (const row of rows) {
    const link = row.cells[1]?.querySelector('a');
    const m = HREF.participation.exec(link?.getAttribute('href') ?? '');
    if (!link || !m || Number(m[1]) !== contestId) continue;
    const only = doc.createElement('a');
    only.href = '#';
    only.className = 'cah-only';
    only.textContent = 'only';
    only.title = 'Open this contestant in the helper';
    only.style.cssText = 'margin-left:6px;font-size:85%;opacity:.75';
    only.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPerson(Number(m[2]));
    });
    link.after(only);
  }

  const bar = doc.createElement('div');
  bar.id = 'cah-inline-filter';
  bar.style.cssText = 'margin:6px 0;display:flex;gap:8px;align-items:center';
  const input = doc.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter this page: user, task or status';
  input.setAttribute('aria-label', 'Filter submissions on this page');
  input.style.cssText = 'width:22em;padding:2px 6px';
  const count = doc.createElement('span');
  count.style.opacity = '0.7';
  const update = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of rows) {
      const text = [1, 2, 3].map((i) => row.cells[i]?.querySelector('a, div')?.firstChild?.textContent ?? row.cells[i]?.textContent ?? '').join(' ').toLowerCase();
      const ok = words.every((w) => text.includes(w));
      row.style.display = ok ? '' : 'none';
      if (ok) shown++;
    }
    count.textContent = words.length ? `${shown} of ${rows.length} rows` : '';
  };
  input.addEventListener('input', update);
  bar.append(input, count);
  table.before(bar);
}

function addHoverCards(doc: Document, client: AwsClient, contestId: number): void {
  const store = getTracker(client, contestId);
  let loaded: Promise<void> | null = null;
  const host = doc.createElement('div');
  host.id = 'cah-hover-card';
  host.style.cssText = 'position:absolute;z-index:2147482000;display:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    .card { font: 13px/1.4 system-ui, sans-serif; background: #fff; color: #1f2328; border: 1px solid #d0d7de;
      border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / .2); padding: 8px 10px; min-width: 14em; }
    .name { font-weight: 600; } .muted { color: #656d76; } table { border-collapse: collapse; margin-top: 4px; }
    td { padding: 1px 8px 1px 0; } td.n { text-align: right; font-variant-numeric: tabular-nums; }`;
  const card = doc.createElement('div');
  card.className = 'card';
  shadow.append(style, card);
  doc.body.append(host);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    clearTimeout(timer);
    host.style.display = 'none';
  };

  const show = async (link: HTMLAnchorElement, userId: number) => {
    loaded ??= store.load().catch(() => undefined);
    await loaded;
    const own = [...store.submissions.values()].filter((s) => s.userId === userId);
    card.replaceChildren();
    const name = doc.createElement('div');
    name.className = 'name';
    name.textContent = link.textContent?.trim() ?? '';
    card.append(name);
    if (store.meta.lastSyncAt === null) {
      const p = doc.createElement('div');
      p.className = 'muted';
      p.textContent = 'Not synced yet: open Helper → Tracker.';
      card.append(p);
    } else {
      const summary = summarizePerson(userId, own, []);
      const line = doc.createElement('div');
      line.className = 'muted';
      line.textContent = `Total ${summary.total} · ${summary.submissions} submissions · ${summary.compileErrors} compile errors`;
      const table = doc.createElement('table');
      for (const t of summary.tasks) {
        const tr = table.insertRow();
        tr.insertCell().textContent = t.taskName;
        const best = tr.insertCell();
        best.className = 'n';
        best.textContent = t.best === null ? '–' : String(t.best);
        const tries = tr.insertCell();
        tries.className = 'n muted';
        tries.textContent = `${t.attempts} tries`;
      }
      const last = doc.createElement('div');
      last.className = 'muted';
      last.textContent = summary.lastActivity === null ? 'No submissions' : `Last: ${formatDateTime(summary.lastActivity)} (Bangkok)`;
      card.append(line, table, last);
    }
    const rect = link.getBoundingClientRect();
    host.style.left = `${rect.left + window.scrollX}px`;
    host.style.top = `${rect.bottom + window.scrollY + 4}px`;
    host.style.display = 'block';
  };

  doc.addEventListener('mouseover', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    const m = link ? HREF.participation.exec(link.getAttribute('href') ?? '') : null;
    if (!link || !m || Number(m[1]) !== contestId) return;
    clearTimeout(timer);
    timer = setTimeout(() => void show(link, Number(m[2])), 350);
    link.addEventListener('mouseleave', hide, { once: true });
  });
}
