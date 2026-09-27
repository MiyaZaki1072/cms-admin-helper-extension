import type { AdminRow, PermissionLevel } from '../model';
import { HREF, LISTS, PAGE } from './selectors';
import { ParseError, cells, findTable, idFrom, text } from './util';

/** Display name of the logged-in admin ("Hello, <name>."), or null when logged out. */
export function parseCurrentAdminName(doc: Document): string | null {
  const link = doc.querySelector(PAGE.loginNoticeName);
  return link ? text(link) : null;
}

/** /admins */
export function parseAdmins(doc: Document): AdminRow[] {
  const table = findTable('admins', doc, LISTS.table, LISTS.adminsHeaders);
  return [...table.querySelectorAll(LISTS.rows)].map((row) => {
    const td = cells(row);
    const link = td[1]?.querySelector('a');
    return {
      id: idFrom(HREF.admin, link?.getAttribute('href')),
      username: text(td[1]),
      name: text(td[2]),
      enabled: text(td[0]) === 'True',
      permissionAll: text(td[3]) === 'True',
      permissionMessaging: text(td[4]) === 'True',
      linked: link !== null && link !== undefined,
    };
  });
}

/**
 * Permission level of the logged-in admin, from the /admins page. AWS links
 * every row for full admins but only the admin's own row otherwise; the name
 * in the sidebar breaks ties.
 */
export function detectPermission(adminsDoc: Document): PermissionLevel {
  const rows = parseAdmins(adminsDoc);
  const name = parseCurrentAdminName(adminsDoc);
  const linked = rows.filter((r) => r.linked);
  const self = linked.length === 1 ? linked[0] : rows.find((r) => r.name === name);
  if (!self) throw new ParseError('admins', 'could not find the logged-in admin in the list');
  if (self.permissionAll) return 'all';
  if (self.permissionMessaging) return 'messaging';
  return 'readonly';
}

/** Quick check on non-contest pages: "(create new ...)" links are only shown with permission_all. */
export function hasCreateLinks(doc: Document): boolean {
  return doc.querySelector(PAGE.createLinks) !== null;
}
