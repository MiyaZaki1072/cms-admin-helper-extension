import type { Submission, SubmissionDetail, SubmissionFile, SubmissionStatus, Testcase } from '../model';
import { HREF, STATUS_TEXT, SUBMISSION_PAGE, SUBMISSIONS } from './selectors';
import { ParseError, cells, findTable, idFrom, num, ownText, parseCmsDateTime, text } from './util';

export interface SubmissionsPage {
  submissions: Submission[];
  /** Total submissions matching the page (all pages), when the page says it. */
  total: number | null;
  /** Number of pages (1 when there is no pager, 0 when empty). */
  pages: number;
}

export function parseStatus(statusText: string): Pick<Submission, 'status' | 'score' | 'maxScore'> {
  const scored = STATUS_TEXT.scored.exec(statusText);
  if (scored) return { status: 'scored', score: num(scored[1]), maxScore: num(scored[2]) };
  const map: Record<string, SubmissionStatus> = {
    [STATUS_TEXT.compiling]: 'compiling',
    [STATUS_TEXT.compilationFailed]: 'compilation_failed',
    [STATUS_TEXT.evaluating]: 'evaluating',
    [STATUS_TEXT.scoring]: 'scoring',
  };
  return { status: map[statusText] ?? 'unknown', score: null, maxScore: null };
}

function parseFiles(cell: Element | undefined): SubmissionFile[] {
  if (!cell) return [];
  return [...cell.querySelectorAll('a[onclick]')].flatMap((a) => {
    const m = HREF.showFile.exec(a.getAttribute('onclick') ?? '');
    return m?.[1] !== undefined && m[2] ? [{ name: m[1], fileId: Number(m[2]) }] : [];
  });
}

function parseRow(row: Element, index: number): Submission {
  const parser = 'submissions table';
  const td = cells(row);
  if (td.length !== SUBMISSIONS.headers.length) {
    throw new ParseError(parser, `row ${index + 1} has ${td.length} cells, expected ${SUBMISSIONS.headers.length}`);
  }
  const [timeCell, userCell, taskCell, statusCell, filesCell, tokenCell, officialCell, commentCell, reevalCell] = td as [
    Element, Element, Element, Element, Element, Element, Element, Element, Element,
  ];
  const timeLink = timeCell.querySelector('a');
  const userLink = userCell.querySelector('a');
  const taskLink = taskCell.querySelector('a');
  const id = idFrom(HREF.submission, timeLink?.getAttribute('href'));
  const participation = HREF.participation.exec(userLink?.getAttribute('href') ?? '');
  const taskId = idFrom(HREF.task, taskLink?.getAttribute('href'));
  if (id === null || !participation || taskId === null) {
    throw new ParseError(parser, `row ${index + 1}: missing submission, user or task link`);
  }
  const statusTitle = statusCell.querySelector(SUBMISSIONS.statusTitle);
  const statusText = statusTitle ? ownText(statusTitle) : text(statusCell);
  let timestamp: number;
  try {
    timestamp = parseCmsDateTime(text(timeLink));
  } catch (err) {
    throw new ParseError(parser, `row ${index + 1}: ${(err as Error).message}`);
  }
  return {
    id,
    timestamp,
    contestId: Number(participation[1]),
    userId: Number(participation[2]),
    username: text(userLink),
    taskId,
    taskName: text(taskLink),
    statusText,
    ...parseStatus(statusText),
    files: parseFiles(filesCell),
    token: text(tokenCell) === 'Yes',
    official: text(officialCell) === 'Yes',
    comment: text(commentCell),
    datasetId: idFrom(HREF.datasetId, reevalCell.querySelector('button')?.getAttribute('onclick')),
  };
}

function parsePages(root: ParentNode): number {
  let pages = 1;
  for (const div of root.querySelectorAll(SUBMISSIONS.pager)) {
    if (!text(div).startsWith('Pages:')) continue;
    for (const a of div.querySelectorAll('a[href]')) {
      const page = idFrom(HREF.page, a.getAttribute('href'));
      if (page !== null) pages = Math.max(pages, page + 1);
    }
    for (const n of text(div).match(/\d+/g) ?? []) pages = Math.max(pages, Number(n));
  }
  return pages;
}

/**
 * A page of submissions, newest first: /contest/{c}/submissions?page=N, or the
 * submissions part of a participation page.
 */
export function parseSubmissionsTable(doc: ParentNode): SubmissionsPage {
  const root = doc.querySelector(SUBMISSIONS.container);
  if (!root) throw new ParseError('submissions table', `${SUBMISSIONS.container} not found`);
  const count = SUBMISSIONS.countText.exec(text(root));
  const total = count?.[1] ? Number(count[1]) : null;
  if (text(root).includes(SUBMISSIONS.empty) && !root.querySelector(SUBMISSIONS.table)) {
    return { submissions: [], total: total ?? 0, pages: 0 };
  }
  const table = findTable('submissions table', root, SUBMISSIONS.table, SUBMISSIONS.headers);
  const rows = [...table.querySelectorAll(SUBMISSIONS.rows)];
  return { submissions: rows.map(parseRow), total, pages: parsePages(root) };
}

function detailValue(doc: Document, label: string): Element | null {
  for (const row of doc.querySelectorAll(SUBMISSION_PAGE.details)) {
    const [key, value] = cells(row);
    if (key && text(key) === label) return value ?? null;
  }
  return null;
}

/** /submission/{id}: details, testcase outcomes and compilation output. */
export function parseSubmissionPage(doc: Document): SubmissionDetail {
  const parser = 'submission page';
  const idCell = detailValue(doc, 'Id');
  const timeCell = detailValue(doc, 'Submission time');
  const taskLink = detailValue(doc, 'Task')?.querySelector('a');
  const userLink = detailValue(doc, 'User')?.querySelector('a');
  const statusCell = doc.querySelector(SUBMISSION_PAGE.status);
  const participation = HREF.participation.exec(userLink?.getAttribute('href') ?? '');
  const taskId = idFrom(HREF.task, taskLink?.getAttribute('href'));
  if (!idCell || !timeCell || !participation || taskId === null || !statusCell) {
    throw new ParseError(parser, 'missing Id, time, task, user or status');
  }
  const statusText = text(statusCell);
  const officialCell = detailValue(doc, 'Official');
  const evaluation = doc.querySelector(SUBMISSION_PAGE.adminEvaluation);
  const evaluationTable = evaluation?.querySelector(':scope > table.bordered') ?? null;
  const testcases: Testcase[] = evaluationTable
    ? [...findTable(parser, evaluation!, ':scope > table.bordered', SUBMISSION_PAGE.adminEvaluationHeaders).querySelectorAll(':scope > tbody > tr')]
        .map(cells)
        .filter((td) => td.length === SUBMISSION_PAGE.adminEvaluationHeaders.length)
        .map((td) => {
          const outcome = text(td[2]);
          const value = num(outcome);
          return {
            index: Number(text(td[0])),
            codename: text(td[1]),
            outcome,
            details: text(td[4]),
            resources: text(td[6]),
            verdict: value === null ? 'unknown' : value >= 1 ? 'correct' : value <= 0 ? 'wrong' : 'partial',
          };
        })
    : [];
  const compilation = doc.querySelector(SUBMISSION_PAGE.compilation);
  const pre = (heading: string) => {
    for (const h3 of compilation?.querySelectorAll('h3') ?? []) {
      if (text(h3) === heading) {
        const next = h3.nextElementSibling;
        return next?.tagName === 'PRE' ? (next.textContent ?? '') : '';
      }
    }
    return '';
  };
  return {
    id: Number(text(idCell)),
    timestamp: parseCmsDateTime(text(timeCell)),
    taskId,
    taskName: text(taskLink),
    contestId: Number(participation[1]),
    userId: Number(participation[2]),
    username: text(userLink),
    language: text(detailValue(doc, 'Language')),
    files: parseFiles(detailValue(doc, 'Files') ?? undefined),
    statusText,
    ...parseStatus(statusText),
    official: officialCell ? /\bYes\b/.test(ownTextDeep(officialCell)) : false,
    testcases,
    compilationOutcome: pre('Outcome').trim(),
    compilationStdout: pre('Standard output'),
    compilationStderr: pre('Standard error'),
  };
}

/** Text of an element, skipping form controls (the Official cell holds a form). */
function ownTextDeep(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const input of clone.querySelectorAll('input, button')) input.remove();
  return text(clone);
}
