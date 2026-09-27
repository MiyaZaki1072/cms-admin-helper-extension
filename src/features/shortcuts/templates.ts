/** Saved announcement texts and {placeholder} filling for bulk messages. */
import { browser } from 'wxt/browser';

export interface AnnouncementTemplate {
  id: string;
  subject: string;
  text: string;
}

const KEY = 'announcementTemplates';

export const DEFAULT_TEMPLATES: AnnouncementTemplate[] = [
  { id: 'thirty', subject: '30 minutes left', text: 'The contest ends in 30 minutes. Make sure your final solutions are submitted.' },
  { id: 'ten', subject: '10 minutes left', text: 'The contest ends in 10 minutes.' },
  { id: 'clarify', subject: 'Clarification', text: '' },
  { id: 'extended', subject: 'Contest extended', text: 'The contest has been extended by 10 minutes.' },
];

export async function getTemplates(): Promise<AnnouncementTemplate[]> {
  const stored = (await browser.storage.local.get(KEY))[KEY];
  return Array.isArray(stored) ? (stored as AnnouncementTemplate[]) : DEFAULT_TEMPLATES;
}

export async function saveTemplates(templates: AnnouncementTemplate[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: templates });
}

export interface PlaceholderValues {
  username: string;
  firstName: string;
  lastName: string;
  teamCode: string;
}

export const PLACEHOLDERS = ['{username}', '{first_name}', '{last_name}', '{team}'] as const;

export function fillPlaceholders(text: string, v: PlaceholderValues): string {
  return text
    .replace(/\{username\}/g, v.username)
    .replace(/\{first_name\}/g, v.firstName)
    .replace(/\{last_name\}/g, v.lastName)
    .replace(/\{team\}/g, v.teamCode);
}

/** Placeholders in `text` that fillPlaceholders does not know (likely typos). */
export function unknownPlaceholders(text: string): string[] {
  return [...new Set(text.match(/\{[a-z_]+\}/gi) ?? [])].filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
}
