/**
 * Questions inbox in the background of the AWS tab: polls the contest's
 * questions page (one request a minute), reports the unanswered count, and
 * asks the background to show a desktop notification for new questions.
 */
import { browser } from 'wxt/browser';
import type { AwsClient } from '@/core/aws-client';
import { request } from '@/core/messaging';
import type { Question } from '@/core/model';
import { parseQuestions } from '@/core/parsers';

export const QUESTION_POLL_MS = 60_000;
const MAX_REMEMBERED = 500;

export function unanswered(questions: readonly Question[]): Question[] {
  return questions.filter((q) => !q.answered && !q.ignored);
}

export function watchQuestions(options: {
  client: AwsClient;
  contestId: number;
  onUpdate: (open: Question[]) => void;
  intervalMs?: number;
}): () => void {
  const { client, contestId, onUpdate } = options;
  const key = `questions:notified:${new URL(client.baseUrl).origin}|${contestId}`;
  let stopped = false;

  const check = async () => {
    try {
      const { doc } = await client.getPage(`contest/${contestId}/questions`);
      const open = unanswered(parseQuestions(doc));
      onUpdate(open);
      const seen = new Set(((await browser.storage.local.get(key))[key] as number[] | undefined) ?? []);
      const fresh = open.filter((q) => q.id !== null && !seen.has(q.id));
      if (fresh.length > 0) {
        for (const q of fresh) seen.add(q.id!);
        await browser.storage.local.set({ [key]: [...seen].slice(-MAX_REMEMBERED) });
        const first = fresh[0]!;
        await request({
          type: 'notify',
          title: fresh.length === 1 ? `Question from ${first.username}` : `${fresh.length} new questions`,
          message: fresh.length === 1 ? `${first.subject}\n${first.text}`.slice(0, 200) : fresh.map((q) => `${q.username}: ${q.subject}`).join('\n').slice(0, 200),
        }).catch(() => undefined);
      }
    } catch {
      // Logged out or AWS busy: try again next time.
    }
  };

  void check();
  const timer = setInterval(() => {
    if (!stopped) void check();
  }, options.intervalMs ?? QUESTION_POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
