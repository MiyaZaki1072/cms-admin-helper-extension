import { useEffect, useState } from 'preact/hooks';
import type { Announcement } from '@/core/model';
import { parseAnnouncements } from '@/core/parsers';
import { formatDateTime } from '@/core/time';
import { postAnnouncement } from '@/features/shortcuts/actions';
import { type AnnouncementTemplate, getTemplates, saveTemplates } from '@/features/shortcuts/templates';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHelper } from '../context';

export function AnnouncementsCard() {
  const { client, contest, can } = useHelper();
  const [templates, setTemplates] = useState<AnnouncementTemplate[]>([]);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<Announcement[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadRecent = () => {
    if (!contest) return;
    void client.getPage(`contest/${contest.id}/announcements`).then(({ doc }) => setRecent(parseAnnouncements(doc).slice(0, 5)));
  };
  useEffect(() => {
    void getTemplates().then(setTemplates);
  }, []);
  useEffect(loadRecent, [client, contest?.id]);

  if (!contest) return null;
  const allowed = can('messaging');

  return (
    <div class="cah-card" data-testid="announcements-card">
      <h3>Announcements</h3>
      <div class="cah-templates">
        {templates.map((t) => (
          <span key={t.id} class="cah-template">
            <button
              type="button"
              onClick={() => {
                setSubject(t.subject);
                setText(t.text);
              }}
              title={t.text}
            >
              {t.subject}
            </button>
            <button
              type="button"
              class="cah-x"
              aria-label={`Delete template ${t.subject}`}
              onClick={() => {
                const next = templates.filter((x) => x.id !== t.id);
                setTemplates(next);
                void saveTemplates(next);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <label class="cah-field">
        Subject
        <input type="text" value={subject} onInput={(e) => setSubject(e.currentTarget.value)} aria-label="Announcement subject" />
      </label>
      <label class="cah-field">
        Text
        <textarea rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)} aria-label="Announcement text" />
      </label>
      <div class="cah-toolbar">
        <button type="button" class="cah-primary" disabled={!allowed || !subject.trim()} onClick={() => setConfirm(true)}>
          Post to all contestants
        </button>
        <button
          type="button"
          disabled={!subject.trim()}
          onClick={() => {
            const next = [...templates.filter((t) => t.subject !== subject.trim()), { id: `t${Date.now()}`, subject: subject.trim(), text }];
            setTemplates(next);
            void saveTemplates(next);
          }}
        >
          Save as template
        </button>
        {notice && <span class={notice.ok ? 'cah-ok-text' : 'cah-error-text'}>{notice.text}</span>}
      </div>
      {recent.length > 0 && (
        <details>
          <summary>Recent announcements</summary>
          <ul>
            {recent.map((a) => (
              <li key={`${a.timestamp}-${a.subject}`}>
                <span class="cah-muted">{formatDateTime(a.timestamp)}</span> <strong>{a.subject}</strong> {a.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {confirm && (
        <ConfirmDialog
          title="Post this announcement?"
          confirmLabel="Post"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            postAnnouncement(client, contest.id, subject, text).then(
              () => {
                setNotice({ ok: true, text: 'Posted.' });
                loadRecent();
              },
              (err: unknown) => setNotice({ ok: false, text: String(err) }),
            );
          }}
        >
          <p>Every contestant in {contest.name} sees:</p>
          <p>
            <strong>{subject}</strong>
          </p>
          <p class="cah-pre-line">{text}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
