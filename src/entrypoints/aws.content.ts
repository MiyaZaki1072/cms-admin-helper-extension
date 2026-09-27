import { defineContentScript } from 'wxt/utils/define-content-script';
import { installBoost } from '@/content/boost';
import { installTimeBoost } from '@/content/time-boost';
import { AwsClient } from '@/core/aws-client';
import { parseCurrentContest } from '@/core/parsers';
import { getSettings } from '@/core/settings';
import { watchQuestions } from '@/features/shortcuts/questions-watch';
import { createHelperUi } from '@/ui/mount';

/**
 * Runs on AWS pages only: registered at runtime by the background for the
 * one origin the admin entered (see core/registration.ts).
 */
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  cssInjectionMode: 'manual',
  async main(ctx) {
    if (!isAwsPage(document)) return;
    const settings = await getSettings();
    if (!settings.awsBaseUrl) return;
    const client = new AwsClient({ baseUrl: settings.awsBaseUrl });
    const helper = createHelperUi(ctx, client);
    const link = addHelperMenuItem(document, () => helper.toggle());
    installBoost({ doc: document, client, openPerson: (userId) => helper.openPerson(userId) });
    void installTimeBoost(document);

    // Questions inbox: badge on the Helper item and desktop notifications.
    const contestId = parseCurrentContest(document)?.id ?? settings.lastContestId;
    if (link && contestId !== null && contestId !== undefined) {
      const stop = watchQuestions({
        client,
        contestId,
        onUpdate: (open) => {
          link.textContent = open.length > 0 ? `Helper (${open.length} ?)` : 'Helper';
          link.title = open.length > 0 ? `${open.length} unanswered question(s)` : 'CMS Admin Helper';
        },
      });
      ctx.onInvalidated(stop);
    }
  },
});

const MENU_ITEM_ID = 'cms-admin-helper-menu';

/** CMS v1.5 AWS pages have <body class="admin"> and a #sidebar. */
function isAwsPage(doc: Document): boolean {
  return doc.body.classList.contains('admin') && doc.getElementById('sidebar') !== null;
}

function addHelperMenuItem(doc: Document, onClick: () => void): HTMLAnchorElement | null {
  // Not logged in (login page): the sidebar has no menu.
  const menu = doc.querySelector('#sidebar ul.menu');
  if (!menu || doc.getElementById(MENU_ITEM_ID)) return null;

  const item = doc.createElement('li');
  item.className = 'menu_entry';
  item.id = MENU_ITEM_ID;
  const link = doc.createElement('a');
  link.className = 'menu_link bold';
  link.href = '#';
  link.textContent = 'Helper';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  item.append(link);
  menu.prepend(item);
  return link;
}
