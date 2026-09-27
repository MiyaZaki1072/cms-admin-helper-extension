/**
 * Read a form the way the browser would submit it, and change single fields.
 * Used for read-modify-write edits: every field goes back as AWS rendered it,
 * except the one we mean to change.
 */

export type FormEntries = Array<[string, string]>;

const SKIPPED_INPUT_TYPES = new Set(['submit', 'reset', 'button', 'image', 'file']);

/** Successful controls of `form`, in document order (HTML form submission rules). */
export function serializeForm(form: HTMLFormElement): FormEntries {
  const out: FormEntries = [];
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const name = el.getAttribute('name');
    if (!name || el.hasAttribute('disabled')) continue;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (SKIPPED_INPUT_TYPES.has(type)) continue;
      if (type === 'checkbox' || type === 'radio') {
        if (el.hasAttribute('checked')) out.push([name, el.getAttribute('value') ?? 'on']);
        continue;
      }
      out.push([name, el.getAttribute('value') ?? '']);
    } else if (tag === 'SELECT') {
      const options = [...el.querySelectorAll('option')];
      const multiple = el.hasAttribute('multiple');
      const selected = options.filter((o) => o.hasAttribute('selected'));
      const chosen = selected.length > 0 ? (multiple ? selected : [selected.at(-1)!]) : multiple ? [] : options.slice(0, 1);
      for (const option of chosen) out.push([name, option.getAttribute('value') ?? (option.textContent ?? '').trim()]);
    } else if (tag === 'TEXTAREA') {
      // A leading newline right after <textarea> is dropped by the HTML parser.
      out.push([name, el.textContent ?? '']);
    }
  }
  return out;
}

export function getField(entries: FormEntries, name: string): string | undefined {
  return entries.find(([k]) => k === name)?.[1];
}

/** Replace the value of `name` (first occurrence), or append it. Returns a new list. */
export function setField(entries: FormEntries, name: string, value: string): FormEntries {
  let done = false;
  const out: FormEntries = [];
  for (const [k, v] of entries) {
    if (k !== name) out.push([k, v]);
    else if (!done) {
      out.push([k, value]);
      done = true;
    }
  }
  if (!done) out.push([name, value]);
  return out;
}

/** Tick or untick a checkbox field. */
export function setCheckbox(entries: FormEntries, name: string, checked: boolean): FormEntries {
  if (!checked) return entries.filter(([k]) => k !== name);
  if (entries.some(([k]) => k === name)) return [...entries];
  return [...entries, [name, 'on']];
}

/** Names whose values differ between two serializations (for audit and verification). */
export function changedFields(before: FormEntries, after: FormEntries): string[] {
  const names = new Set([...before, ...after].map(([k]) => k));
  const values = (entries: FormEntries, name: string) =>
    entries
      .filter(([k]) => k === name)
      .map(([, v]) => v)
      .join('\u0000');
  return [...names].filter((n) => n !== '_xsrf' && values(before, n) !== values(after, n));
}
