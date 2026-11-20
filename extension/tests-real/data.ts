// Where the local real data is, and helpers that never reveal it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const VAR = resolve(__dirname, process.env.REAL_DATA_DIR ?? '../../var');
export const HAVE_VAR = existsSync(VAR);

/** Files in var/ (or a subdirectory) whose names match, sorted. */
export function files(re: RegExp, sub = ''): string[] {
  const dir = join(VAR, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => re.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => join(dir, f));
}

export const read = (p: string) => readFileSync(p, 'utf8');

const ID = /\b[A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6}\b/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** How many manuscript IDs and email addresses a text holds. */
export function leaks(text: string): { ids: number; emails: number } {
  return { ids: (text.match(ID) ?? []).length, emails: (text.match(EMAIL) ?? []).length };
}
