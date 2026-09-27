import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { clearTracker, loadTracker, saveTracker, trackerDbName } from '@/background/tracker-db';
import { readXlsx, writeXlsx } from '@/background/xlsx';
import { appendAuditEntry } from '@/core/audit';
import { handleRequests } from '@/core/messaging';
import { syncContentScript } from '@/core/registration';
import { onSettingsChanged } from '@/core/settings';

export default defineBackground(() => {
  const sync = () => {
    syncContentScript().catch((err: unknown) => console.error('CMS Admin Helper: content script sync failed', err));
  };

  // Firefox does not keep dynamically registered scripts across restarts.
  browser.runtime.onStartup.addListener(sync);
  browser.runtime.onInstalled.addListener(sync);
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);
  onSettingsChanged(sync);

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  // Audit writes from all tabs, one at a time.
  let auditChain: Promise<unknown> = Promise.resolve();

  handleRequests({
    'audit:add': async ({ entry }) => {
      auditChain = auditChain.then(() => appendAuditEntry(entry));
      await auditChain;
      return null;
    },
    'tracker:load': ({ contestId }, { origin }) => loadTracker(trackerDbName(origin, contestId)),
    'tracker:save': async ({ contestId, put, remove, meta }, { origin }) => {
      await saveTracker(trackerDbName(origin, contestId), put, remove, meta);
      return null;
    },
    'tracker:clear': async ({ contestId }, { origin }) => {
      await clearTracker(trackerDbName(origin, contestId));
      return null;
    },
    'xlsx:write': async ({ sheets }) => ({ base64: writeXlsx(sheets) }),
    'xlsx:read': async ({ base64, sheet }) => readXlsx(base64, sheet),
    notify: async ({ title, message }) => {
      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: title.slice(0, 100),
        message: message.slice(0, 300),
      });
      return null;
    },
  });
});
