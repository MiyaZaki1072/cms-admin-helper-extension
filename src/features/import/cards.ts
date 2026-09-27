/**
 * Printable login cards (A4, 8 or 10 per page) in a new window. Built with
 * DOM calls and textContent; the window has a Print button.
 */

export interface LoginCard {
  username: string;
  password: string;
  fullName: string;
}

export interface CardOptions {
  contestName: string;
  /** Contest site address shown on each card. */
  url: string;
  perPage: 8 | 10;
}

const CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.35 system-ui, sans-serif; color: #000; }
  .bar { padding: 10px; background: #eef; }
  .page { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 4mm; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .card { border: 1px dashed #666; border-radius: 3mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 1.5mm; }
  .per-8 .card { height: 64mm; }
  .per-10 .card { height: 51mm; }
  .contest { font-weight: 700; font-size: 15px; }
  .url { font-size: 12px; color: #333; word-break: break-all; }
  .name { color: #333; }
  .row { display: flex; gap: 3mm; align-items: baseline; }
  .label { width: 22mm; color: #555; font-size: 12px; }
  .value { font: 600 17px/1.2 ui-monospace, Consolas, monospace; letter-spacing: .5px; }
  @media print { .bar { display: none; } }
`;

/** Opens the cards; returns false if the browser blocked the new window. */
export function openLoginCards(cards: readonly LoginCard[], options: CardOptions): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  const doc = win.document;
  doc.title = `Login cards — ${options.contestName}`;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);

  const bar = doc.createElement('div');
  bar.className = 'bar';
  const print = doc.createElement('button');
  print.textContent = `Print ${cards.length} cards`;
  print.addEventListener('click', () => win.print());
  bar.append(print, doc.createTextNode(` ${options.perPage} cards per A4 page. Cut along the dashed lines.`));
  doc.body.append(bar);

  const line = (label: string, value: string) => {
    const row = doc.createElement('div');
    row.className = 'row';
    const l = doc.createElement('span');
    l.className = 'label';
    l.textContent = label;
    const v = doc.createElement('span');
    v.className = 'value';
    v.textContent = value;
    row.append(l, v);
    return row;
  };

  for (let i = 0; i < cards.length; i += options.perPage) {
    const page = doc.createElement('div');
    page.className = `page per-${options.perPage}`;
    for (const card of cards.slice(i, i + options.perPage)) {
      const el = doc.createElement('div');
      el.className = 'card';
      const contest = doc.createElement('div');
      contest.className = 'contest';
      contest.textContent = options.contestName;
      const url = doc.createElement('div');
      url.className = 'url';
      url.textContent = options.url;
      const name = doc.createElement('div');
      name.className = 'name';
      name.textContent = card.fullName;
      el.append(contest, url, name, line('Username', card.username), line('Password', card.password));
      page.append(el);
    }
    doc.body.append(page);
  }
  return true;
}

/** Best guess of the contest site: same host, port 8888, contest name as path. */
export function guessContestUrl(awsBase: string, contestName: string): string {
  const u = new URL(awsBase);
  const port = u.port === '8889' ? ':8888' : u.port ? `:${u.port}` : '';
  return `${u.protocol}//${u.hostname}${port}/${encodeURIComponent(contestName)}`;
}
