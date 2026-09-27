import { browser } from 'wxt/browser';
import { parseAwsUrl } from './origin';
import { getSettings } from './settings';

const SCRIPT_ID = 'aws';
const SCRIPT_FILE = 'content-scripts/aws.js';

/**
 * Make the registered content script match the saved AWS URL: registered for
 * exactly that origin + path when host permission is granted, and not
 * registered at all otherwise. Safe to call any number of times.
 */
export async function syncContentScript(): Promise<'registered' | 'unregistered'> {
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (registered.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }

  const { awsBaseUrl } = await getSettings();
  if (!awsBaseUrl) return 'unregistered';
  const location = parseAwsUrl(awsBaseUrl);
  const granted = await browser.permissions.contains({ origins: [location.permissionPattern] });
  if (!granted) return 'unregistered';

  await browser.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: [location.matchPattern],
      js: [SCRIPT_FILE],
      runAt: 'document_idle',
    },
  ]);
  return 'registered';
}
