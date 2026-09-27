import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type AwsClient, NotLoggedInError } from '@/core/aws-client';
import { type Connection, PERMISSION_LABEL, allows, connect } from '@/core/connection';
import { isPrivateHost } from '@/core/origin';
import { parseCurrentContest } from '@/core/parsers';
import { getSettings, saveSettings } from '@/core/settings';
import { getTracker } from '@/features/tracker/registry';
import type { TrackerStore } from '@/features/tracker/store';
import { HelperContext, type HelperContextValue, type PersonRequest } from './context';
import { ImportTab } from './tabs/ImportTab';
import { LogTab } from './tabs/LogTab';
import { TimeTab } from './tabs/TimeTab';
import { ToolsTab } from './tabs/ToolsTab';
import { TrackerTab } from './tabs/TrackerTab';
import { StatusBar } from './tools/StatusBar';

const TABS = ['Tracker', 'Time', 'Import', 'Tools', 'Log'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  client: AwsClient;
  visible: boolean;
  onClose: () => void;
  /** Open the tracker on this contestant. */
  intent?: PersonRequest | null;
}

export function App({ client, visible, onClose, intent = null }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Tracker');
  const [contestId, setContestId] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = () => {
    setError(null);
    connect(client, document).then(
      async (c) => {
        setConnection(c);
        const fromPage = parseCurrentContest(document)?.id;
        const { lastContestId } = await getSettings();
        const known = (id: number | null | undefined) => (id != null && c.contests.some((x) => x.id === id) ? id : null);
        setContestId(known(fromPage) ?? known(lastContestId) ?? c.contests[0]?.id ?? null);
      },
      (err: unknown) => setError(err instanceof NotLoggedInError ? err.message : `Could not load AWS: ${String(err)}`),
    );
  };

  useEffect(load, [client]);

  useEffect(() => {
    if (visible) root.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (intent) setTab('Tracker');
  }, [intent?.nonce]);

  const value = useMemo<HelperContextValue | null>(() => {
    if (!connection) return null;
    const tracker: TrackerStore | null = contestId === null ? null : getTracker(client, contestId);
    return {
      client,
      connection,
      tracker,
      visible,
      personRequest: intent,
      contest: connection.contests.find((c) => c.id === contestId) ?? null,
      setContestId: (id: number) => {
        setContestId(id);
        void saveSettings({ lastContestId: id });
      },
      can: (need) => allows(connection.permission, need),
    };
  }, [client, connection, contestId, visible, intent]);

  const base = new URL(client.baseUrl);
  const insecure = base.protocol === 'http:' && !isPrivateHost(base.hostname);

  return (
    <div
      class="cah-overlay"
      hidden={!visible}
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target as Element).closest('.cah-dialog')) onClose();
      }}
    >
      <header class="cah-header">
        <strong class="cah-title">CMS Admin Helper</strong>
        {value && (
          <>
            <label class="cah-contest-picker">
              Contest
              <select
                value={contestId ?? ''}
                onChange={(e) => value.setContestId(Number(e.currentTarget.value))}
                aria-label="Contest"
              >
                {value.connection.contests.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.description}
                  </option>
                ))}
              </select>
            </label>
            <span class={`cah-badge cah-badge-${value.connection.permission}`} data-testid="permission">
              {PERMISSION_LABEL[value.connection.permission]}
            </span>
          </>
        )}
        <span class="cah-spacer" />
        <button type="button" class="cah-close" onClick={onClose} aria-label="Close helper" title="Close (Esc)">
          ×
        </button>
      </header>

      {error && (
        <div class="cah-banner cah-banner-error">
          {error}{' '}
          <button type="button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {!error && !value && <p class="cah-muted cah-pad">Connecting to AWS…</p>}

      {value && (
        <HelperContext.Provider value={value}>
          {!value.connection.version.ok && (
            <div class="cah-banner cah-banner-error" role="alert">
              This does not look like CMS v1.5, so the helper is read-only. What did not match:
              <ul>
                {value.connection.version.failures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {insecure && (
            <div class="cah-banner cah-banner-error" role="alert">
              AWS is on plain http:// at a public address: your admin session and contestants' passwords cross the network
              unencrypted. Use https:// or a LAN address.
            </div>
          )}
          {value.connection.version.ok && value.connection.permission !== 'all' && (
            <div class="cah-banner cah-banner-info" role="status">
              {value.connection.permission === 'readonly'
                ? 'Your admin account is read-only: actions that change CMS are disabled.'
                : 'Your admin account has messaging permission only: other actions that change CMS are disabled.'}
            </div>
          )}
          <StatusBar />
          <nav class="cah-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                class={tab === t ? 'cah-tab cah-tab-active' : 'cah-tab'}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          <main class="cah-main">
            {tab === 'Tracker' && <TrackerTab />}
            {tab === 'Time' && <TimeTab />}
            {tab === 'Import' && <ImportTab />}
            {tab === 'Tools' && <ToolsTab />}
            {tab === 'Log' && <LogTab />}
          </main>
        </HelperContext.Provider>
      )}
    </div>
  );
}
