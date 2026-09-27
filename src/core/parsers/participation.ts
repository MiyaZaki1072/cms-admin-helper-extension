import type { Message, Participation, ParticipationForm, PasswordMethod, Question } from '../model';
import { getField, serializeForm } from './form';
import { HREF, PARTICIPATION } from './selectors';
import { parseSubmissionsTable } from './submissions';
import { ParseError, idFrom, multilineText, parseCmsDateTime, text } from './util';

const FIELDS = ['team', 'password', 'method', 'ip', 'starting_time', 'delay_time', 'extra_time'] as const;

/** The participation form alone, from a form element (read-modify-write needs only this). */
export function parseParticipationForm(form: HTMLFormElement): { form: ParticipationForm; fields: Array<[string, string]> } {
  const parser = 'participation form';
  for (const name of FIELDS) {
    if (!form.querySelector(`[name="${name}"]`)) throw new ParseError(parser, `field "${name}" not found`);
  }
  for (const name of ['hidden', 'unrestricted']) {
    if (!form.querySelector(`input[type="checkbox"][name="${name}"]`)) {
      throw new ParseError(parser, `checkbox "${name}" not found`);
    }
  }
  const fields = serializeForm(form);
  const seconds = (name: string) => {
    const value = Number(getField(fields, name) ?? '0');
    if (!Number.isFinite(value)) throw new ParseError(parser, `"${name}" is not a number`);
    return value;
  };
  const method = getField(fields, 'method');
  if (method !== 'plaintext' && method !== 'bcrypt') throw new ParseError(parser, `unknown password method "${method}"`);
  return {
    fields,
    form: {
      team: getField(fields, 'team') ?? '',
      password: getField(fields, 'password') ?? '',
      method: method as PasswordMethod,
      hidden: getField(fields, 'hidden') !== undefined,
      unrestricted: getField(fields, 'unrestricted') !== undefined,
      ip: getField(fields, 'ip') ?? '',
      startingTime: getField(fields, 'starting_time') ?? '',
      delayTime: seconds('delay_time'),
      extraTime: seconds('extra_time'),
    },
  };
}

function parseQuestion(el: Element, userId: number, username: string): Question {
  const subjects = [...el.querySelectorAll(PARTICIPATION.subject)];
  const texts = [...el.querySelectorAll(PARTICIPATION.text)];
  const replyHeading = text(subjects[1]);
  const answered = replyHeading.startsWith('Reply.');
  return {
    id: idFrom(HREF.question, el.querySelector(PARTICIPATION.replyForm)?.getAttribute('action')),
    userId,
    username,
    fullName: '',
    timestamp: parseCmsDateTime(text(el.querySelector(PARTICIPATION.timestamp))),
    subject: text(subjects[0]),
    text: multilineText(texts[0]),
    answered,
    ignored: false,
    replySubject: answered ? replyHeading.replace(/^Reply\.\s*/, '') : '',
    replyText: answered ? multilineText(texts[1]) : '',
  };
}

function parseMessage(el: Element): Message | null {
  const timestamp = el.querySelector(PARTICIPATION.timestamp);
  if (!timestamp) return null; // the "send message" form box
  return {
    timestamp: parseCmsDateTime(text(timestamp)),
    subject: text(el.querySelector(PARTICIPATION.subject)),
    text: multilineText(el.querySelector(PARTICIPATION.text)),
    author: text(el.querySelector(PARTICIPATION.owner)).replace(/^By:\s*/, ''),
  };
}

/** /contest/{c}/user/{u}/edit: form, submissions (one page), questions, messages. */
export function parseParticipationPage(doc: Document): Participation {
  const parser = 'participation page';
  const title = doc.querySelector(PARTICIPATION.title);
  const links = title ? [...title.querySelectorAll('a')] : [];
  const userId = idFrom(HREF.user, links[0]?.getAttribute('href'));
  const contestId = idFrom(HREF.contest, links[1]?.getAttribute('href'));
  if (!title || !text(title).startsWith('Participation of') || userId === null || contestId === null) {
    throw new ParseError(parser, 'title "Participation of <user> in <contest>" not found');
  }
  const formEl = doc.querySelector<HTMLFormElement>(PARTICIPATION.form);
  if (!formEl) throw new ParseError(parser, 'participation form not found');
  const { form, fields } = parseParticipationForm(formEl);
  const username = text(links[0]);
  const table = parseSubmissionsTable(doc);
  const reevaluate = doc.querySelector('#submissions > p button[onclick*="participation_id"]');
  return {
    participationId: idFrom(HREF.participationId, reevaluate?.getAttribute('onclick')),
    contestId,
    userId,
    username,
    form,
    fields,
    teamCodes: [...doc.querySelectorAll(PARTICIPATION.teamDatalist)].map((o) => o.getAttribute('value') ?? ''),
    submissionCount: table.total ?? table.submissions.length,
    submissions: table.submissions,
    submissionPages: table.pages,
    questions: [...doc.querySelectorAll(PARTICIPATION.questions)].map((q) => parseQuestion(q, userId, username)),
    messages: [...doc.querySelectorAll(PARTICIPATION.messages)].flatMap((m) => parseMessage(m) ?? []),
  };
}
