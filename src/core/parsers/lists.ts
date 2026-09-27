import type { Contest, RankingRow, Task, Team, User } from '../model';
import { HREF, LISTS, RANKING } from './selectors';
import { ParseError, cells, expectHeaders, findTable, headers, idFrom, num, text } from './util';

function rows(table: Element): Element[][] {
  return [...table.querySelectorAll(LISTS.rows)].map(cells);
}

function userRows(parser: string, doc: Document, expected: readonly string[], idRe: RegExp, group: number): User[] {
  const table = findTable(parser, doc, LISTS.table, expected);
  return rows(table).map((td, i) => {
    const link = td[1]?.querySelector('a');
    const id = idFrom(idRe, link?.getAttribute('href'), group);
    if (id === null) throw new ParseError(parser, `row ${i + 1}: no user link`);
    return { id, username: text(link), firstName: text(td[2]), lastName: text(td[3]) };
  });
}

/** /contest/{c}/users: participants, plus users not yet in the contest (the "add user" select). */
export function parseContestUsers(doc: Document): { participants: User[]; unassigned: Array<{ id: number; username: string }> } {
  const participants = userRows('contest users', doc, LISTS.contestUsersHeaders, HREF.participation, 2);
  const unassigned = [...doc.querySelectorAll(LISTS.addUserSelect)].flatMap((o) => {
    const id = num(o.getAttribute('value'));
    return id === null ? [] : [{ id, username: text(o) }];
  });
  return { participants, unassigned };
}

/** /users: every user on the server. */
export function parseUsers(doc: Document): User[] {
  return userRows('users', doc, LISTS.usersHeaders, HREF.user, 1);
}

/** /teams */
export function parseTeams(doc: Document): Team[] {
  const table = findTable('teams', doc, LISTS.table, LISTS.teamsHeaders);
  return rows(table).map((td, i) => {
    const link = td[0]?.querySelector('a');
    const id = idFrom(HREF.team, link?.getAttribute('href'));
    if (id === null) throw new ParseError('teams', `row ${i + 1}: no team link`);
    return { id, code: text(link), name: text(td[1]) };
  });
}

/** /contest/{c}/tasks */
export function parseContestTasks(doc: Document): Task[] {
  const table = findTable('contest tasks', doc, LISTS.table, LISTS.contestTasksHeaders);
  return rows(table).map((td, i) => {
    const link = td[1]?.querySelector('a');
    const id = idFrom(HREF.task, link?.getAttribute('href'));
    if (id === null) throw new ParseError('contest tasks', `row ${i + 1}: no task link`);
    return { id, name: text(link), title: text(td[2]) };
  });
}

/** /contests */
export function parseContests(doc: Document): Contest[] {
  const table = findTable('contests', doc, LISTS.table, LISTS.contestsHeaders);
  return rows(table).map((td, i) => {
    const link = td[1]?.querySelector('a');
    const id = idFrom(HREF.contest, link?.getAttribute('href'));
    if (id === null) throw new ParseError('contests', `row ${i + 1}: no contest link`);
    return { id, name: text(link), description: text(td[2]) };
  });
}

/** /contest/{c}/ranking: tasks in column order and one row per participant. */
export function parseRanking(doc: Document): { tasks: Array<{ id: number; name: string }>; rows: RankingRow[] } {
  const parser = 'ranking';
  const table = doc.querySelector(RANKING.table);
  if (!table) throw new ParseError(parser, 'ranking table not found');
  const head = headers(table);
  const taskHeaders = [...table.querySelectorAll(':scope > thead > tr > th')].slice(RANKING.fixedHeaders.length, -1);
  expectHeaders(parser, table, [...RANKING.fixedHeaders, ...head.slice(3, -1), RANKING.lastHeader]);
  const tasks = taskHeaders.map((th) => {
    const link = th.querySelector('a');
    const id = idFrom(HREF.task, link?.getAttribute('href'));
    if (id === null) throw new ParseError(parser, `task header "${text(th)}" has no task link`);
    return { id, name: text(link) };
  });
  return {
    tasks,
    rows: rows(table).map((td, i) => {
      const userLink = td[0]?.querySelector('a');
      const userId = idFrom(HREF.participation, userLink?.getAttribute('href'), 2);
      if (userId === null || td.length !== 3 + tasks.length + 1) {
        throw new ParseError(parser, `row ${i + 1} does not match the header`);
      }
      const teamLink = td[2]?.querySelector('a');
      const scores: Record<number, number> = {};
      tasks.forEach((task, t) => {
        scores[task.id] = num(text(td[3 + t])) ?? 0;
      });
      return {
        userId,
        username: text(userLink),
        fullName: text(td[1]),
        teamId: idFrom(HREF.team, teamLink?.getAttribute('href')),
        teamName: text(td[2]),
        scores,
        total: num(text(td[td.length - 1])) ?? 0,
      };
    }),
  };
}
