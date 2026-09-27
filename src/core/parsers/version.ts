import { AWS_UTILS_CALL, PAGE } from './selectors';

export interface VersionCheck {
  /** True when the page looks like CMS v1.5 AWS. */
  ok: boolean;
  /** One line per marker that did not match. */
  failures: string[];
}

/**
 * Check a page against markers every CMS v1.5 AWS page has (base.html). When
 * this fails the extension switches to read-only mode and shows the failures.
 */
export function detectVersion(doc: Document): VersionCheck {
  const failures: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) failures.push(what);
  };
  need(doc.querySelector(PAGE.body) !== null, '<body class="admin"> not found');
  need(doc.querySelector(PAGE.stylesheet) !== null, 'aws_style.css not linked');
  // The login page is standalone (login.html does not extend base.html).
  if (doc.querySelector(PAGE.loginForm) !== null && doc.querySelector(PAGE.sidebar) === null) {
    return { ok: failures.length === 0, failures };
  }
  need(doc.querySelector(PAGE.sidebar) !== null, '#sidebar not found');
  need(doc.querySelector(PAGE.core) !== null, '#core not found');
  need(doc.querySelector(PAGE.utilsScript) !== null, 'aws_utils.js not loaded');
  const scripts = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent ?? '');
  need(scripts.some((s) => AWS_UTILS_CALL.test(s)), 'CMS.AWSUtils(...) call not found');
  need(
    doc.querySelector(PAGE.loginNotice) !== null || doc.querySelector(PAGE.loginForm) !== null,
    'neither the "Hello, admin" notice nor the login form was found',
  );
  return { ok: failures.length === 0, failures };
}
