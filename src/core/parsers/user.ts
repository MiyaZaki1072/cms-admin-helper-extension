import type { PasswordMethod } from '../model';
import { type FormEntries, getField, serializeForm } from './form';
import { HREF, USER_PAGE } from './selectors';
import { ParseError, cells, expectHeaders, idFrom, text } from './util';

export interface UserPage {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  /** Plaintext password, or "" when hashed. */
  password: string;
  method: PasswordMethod;
  participations: Array<{ contestId: number; hidden: boolean; unrestricted: boolean }>;
  /** The user form as the browser would send it (for read-modify-write). */
  fields: FormEntries;
}

/** /user/{id}: the user's form and the contests they take part in. */
export function parseUserPage(doc: Document): UserPage {
  const parser = 'user page';
  const form = doc.querySelector<HTMLFormElement>(USER_PAGE.form);
  if (!form || !form.querySelector('[name="username"]')) throw new ParseError(parser, 'user form not found');
  const userId = idFrom(HREF.user, form.getAttribute('action'));
  if (userId === null) throw new ParseError(parser, 'user id not found in the form action');
  const fields = serializeForm(form);
  const method = getField(fields, 'method');
  if (method !== 'plaintext' && method !== 'bcrypt') throw new ParseError(parser, `unknown password method "${method}"`);

  const table = doc.querySelector(USER_PAGE.participations);
  const participations = table
    ? [...expectHeaders(parser, table, USER_PAGE.participationHeaders).querySelectorAll(':scope > tbody > tr')].flatMap((row) => {
        const td = cells(row);
        const contestId = idFrom(HREF.contest, td[4]?.querySelector('a')?.getAttribute('href'));
        return contestId === null ? [] : [{ contestId, hidden: text(td[2]) === 'True', unrestricted: text(td[3]) === 'True' }];
      })
    : [];

  return {
    userId,
    username: getField(fields, 'username') ?? '',
    firstName: getField(fields, 'first_name') ?? '',
    lastName: getField(fields, 'last_name') ?? '',
    password: getField(fields, 'password') ?? '',
    method,
    participations,
    fields,
  };
}
