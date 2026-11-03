// The person's MC roles (privileges), learned by watching the pages they
// visit: the role switcher in MC's top bar, its menu of other roles, and
// the breadcrumb's center ("Co-Chair Dashboard", "Associate Editor Center").
// Roles only ever accumulate, so switching to the Author center doesn't
// forget that the person is also a co-chair. Kept per site in
// chrome.storage.local; features such as the "To EIC" list depend on them.

import { textOf } from './text';

export type Role = 'eic' | 'coChair' | 'ae' | 'reviewer' | 'author';
export type KnownRoles = Partial<Record<Role, string>>;

const PATTERNS: Array<[Role, RegExp]> = [
  ['eic', /\beditor[- ]in[- ]chief\b|\bEIC\b/i],
  ['coChair', /\bco-?chair\b/i],
  ['ae', /\bassociate editor\b|\bAE (center|dashboard)\b/i],
  ['reviewer', /\breviewer (center|dashboard)\b/i],
  ['author', /\bauthor (center|dashboard)\b/i],
];

/** Roles named in some role labels ("Opinions Co-Chair", "Associate Editor Center"). */
export function rolesIn(labels: string[]): Role[] {
  const out = new Set<Role>();
  for (const l of labels) for (const [role, re] of PATTERNS) if (re.test(l)) out.add(role);
  return [...out];
}

/** A bare role name, as the switcher's menu lists them ("Reviewer", "Author"). */
const BARE = /^([\w&.-]+ )?(co-?chair|associate editor|editor[- ]in[- ]chief|reviewer|author|admin)$/i;

/**
 * Role labels on this page: the role switcher and its menu, and the first
 * breadcrumb. The switcher is a dropdown whose own text is a role name.
 */
export function roleLabels(doc: Document, breadcrumb: string[]): string[] {
  const out: string[] = [];
  if (breadcrumb[0]) out.push(breadcrumb[0]);
  for (const toggle of Array.from(doc.querySelectorAll<HTMLElement>('.dropdown-toggle, [data-toggle=dropdown], [data-bs-toggle=dropdown]'))) {
    const label = textOf(toggle);
    if (!BARE.test(label)) continue;
    out.push(label);
    const menu = toggle.parentElement?.querySelector('.dropdown-menu');
    for (const item of Array.from(menu?.querySelectorAll('a, li') ?? [])) {
      const t = textOf(item);
      // Bare names in the menu are roles; "Reviewer" alone is the Reviewer center.
      if (BARE.test(t)) out.push(/^(reviewer|author)$/i.test(t) ? `${t} Center` : t);
    }
  }
  return out;
}

/** Known roles with any new ones added, each with the date it was first seen. */
export function addRoles(known: KnownRoles, found: Role[], today: string): KnownRoles {
  const next = { ...known };
  for (const r of found) next[r] ??= today;
  return next;
}
