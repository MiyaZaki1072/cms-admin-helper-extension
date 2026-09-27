import type { Announcement, Question } from '../model';
import { ANNOUNCEMENTS, HREF, QUESTIONS } from './selectors';
import { ParseError, idFrom, multilineText, parseCmsDateTime, text } from './util';

/** /contest/{c}/questions, newest first as AWS lists them. */
export function parseQuestions(doc: Document): Question[] {
  if (!doc.querySelector('#paged_content_questions')) throw new ParseError('questions', 'question list not found');
  return [...doc.querySelectorAll(QUESTIONS.item)].map((el, i) => {
    const link = el.querySelector(QUESTIONS.userLink);
    const userId = idFrom(HREF.participation, link?.getAttribute('href'), 2);
    // "stu003 — 2026-09-27 08:14:51.248675"
    const stamp = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(text(el.querySelector(QUESTIONS.timestamp)));
    if (userId === null || !stamp?.[1]) throw new ParseError('questions', `question ${i + 1}: no user or time`);
    const subjects = [...el.querySelectorAll(QUESTIONS.subject)];
    const texts = [...el.querySelectorAll(QUESTIONS.text)];
    const answered = el.classList.contains('answered');
    return {
      id: idFrom(HREF.question, el.querySelector(QUESTIONS.idForm)?.getAttribute('action')),
      userId,
      username: text(link),
      fullName: link?.getAttribute('title') ?? '',
      timestamp: parseCmsDateTime(stamp[1]),
      subject: text(subjects[0]),
      text: multilineText(texts[0]),
      answered,
      ignored: el.classList.contains('ignored'),
      replySubject: answered ? text(subjects[1]).replace(/^Reply:\s*/, '') : '',
      replyText: answered ? multilineText(texts[1]) : '',
    };
  });
}

/** /contest/{c}/announcements, newest first. */
export function parseAnnouncements(doc: Document): Announcement[] {
  if (!doc.querySelector('#announcements')) throw new ParseError('announcements', 'announcement list not found');
  return [...doc.querySelectorAll(ANNOUNCEMENTS.item)].flatMap((el) => {
    const stamp = el.querySelector(ANNOUNCEMENTS.timestamp);
    if (!stamp) return []; // the "add announcement" form box
    return [
      {
        id: idFrom(HREF.announcement, el.querySelector(ANNOUNCEMENTS.remove)?.getAttribute('onclick')),
        timestamp: parseCmsDateTime(text(stamp)),
        subject: text(el.querySelector(ANNOUNCEMENTS.subject)),
        text: multilineText(el.querySelector(ANNOUNCEMENTS.text)),
        author: text(el.querySelector(ANNOUNCEMENTS.owner)).replace(/^By:\s*/, ''),
      },
    ];
  });
}
