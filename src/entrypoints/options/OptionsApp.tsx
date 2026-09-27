import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { isPrivateHost, parseAwsUrl } from '@/core/origin';
import { getSettings, saveSettings } from '@/core/settings';

type Status = { kind: 'idle' } | { kind: 'ok' | 'error' | 'warn'; text: string };

export function OptionsApp() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    void getSettings().then(async (s) => {
      setSaved(s.awsBaseUrl);
      setUrl(s.awsBaseUrl ?? '');
      if (s.awsBaseUrl) {
        const { permissionPattern } = parseAwsUrl(s.awsBaseUrl);
        setGranted(await browser.permissions.contains({ origins: [permissionPattern] }));
      }
    });
  }, []);

  const onSave = (event: Event) => {
    event.preventDefault();
    let location;
    try {
      location = parseAwsUrl(url);
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message });
      return;
    }
    // permissions.request must run straight from the click, before any await.
    browser.permissions.request({ origins: [location.permissionPattern] }).then(
      async (ok) => {
        if (!ok) {
          setStatus({ kind: 'error', text: 'Permission was not granted, so the helper cannot run on that address.' });
          return;
        }
        // Drop access to a previous AWS origin we no longer use.
        if (saved && saved !== location.base) {
          const old = parseAwsUrl(saved).permissionPattern;
          if (old !== location.permissionPattern) await browser.permissions.remove({ origins: [old] });
        }
        await saveSettings({ awsBaseUrl: location.base });
        setSaved(location.base);
        setUrl(location.base);
        setGranted(true);
        const host = new URL(location.base).hostname;
        if (location.base.startsWith('http://') && !isPrivateHost(host)) {
          setStatus({
            kind: 'warn',
            text: `Saved. Warning: ${host} is a public address over plain http://, so your admin session is not encrypted.`,
          });
        } else {
          setStatus({ kind: 'ok', text: 'Saved. Reload the AWS tab to see the Helper menu item.' });
        }
      },
      (err: unknown) => setStatus({ kind: 'error', text: String(err) }),
    );
  };

  const onRemove = async () => {
    if (saved) await browser.permissions.remove({ origins: [parseAwsUrl(saved).permissionPattern] });
    await saveSettings({ awsBaseUrl: null });
    setSaved(null);
    setGranted(false);
    setUrl('');
    setStatus({ kind: 'ok', text: 'Removed. The helper no longer runs on any site.' });
  };

  return (
    <main>
      <h1>CMS Admin Helper</h1>
      <p>
        Enter the address of your CMS v1.5 admin site (AdminWebServer). The helper runs only on that address and only
        talks to that server.
      </p>
      <form onSubmit={onSave}>
        <label for="aws-url">AWS address</label>
        <div class="row">
          <input
            id="aws-url"
            type="text"
            placeholder="http://localhost:8889"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
            autoComplete="off"
            spellcheck={false}
          />
          <button type="submit">Save</button>
        </div>
      </form>
      {status.kind !== 'idle' && <p class={`status ${status.kind}`}>{status.text}</p>}
      {saved && (
        <section>
          <p>
            Active on <code>{saved}</code> — {granted ? 'permission granted' : 'permission missing, press Save again'}.
          </p>
          <button type="button" class="secondary" onClick={onRemove}>
            Remove
          </button>
        </section>
      )}
    </main>
  );
}
