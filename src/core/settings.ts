import { browser } from 'wxt/browser';

/** Extension settings, kept in storage.local. Never holds passwords. */
export interface Settings {
  /** AWS base URL with trailing slash, from parseAwsUrl().base; null until set up. */
  awsBaseUrl: string | null;
  /** Contest the helper opens on when the page is not a contest page. */
  lastContestId: number | null;
  /** IANA zone the helper shows times in. */
  displayZone: string;
  /** Show AWS page timestamps as AWS prints them (UTC) instead of converting. */
  pageTimesUtc: boolean;
}

const KEY = 'settings';
const DEFAULTS: Settings = { awsBaseUrl: null, lastContestId: null, displayZone: 'Asia/Bangkok', pageTimesUtc: false };

export async function getSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(listener: (settings: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) {
      listener({ ...DEFAULTS, ...(changes[KEY]?.newValue as Partial<Settings> | undefined) });
    }
  });
}
