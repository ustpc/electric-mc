// Who is logged in to Manuscript Central. MC pages carry the person's
// account in an inline script that sets up its analytics:
//   PENDO_SERVICE.initializePendoMetadata({visitor: {id:"…", email:"…",
//   first_name:"…", last_name:"…", person_id:123, role_type_name:"…"},
//   account: {short_name:"…", …}})
// We read it as text, never run it. Notes are signed in this person's name.

export interface McIdentity {
  email: string;
  firstName?: string;
  lastName?: string;
  personId?: string;
  role?: string;
  /** The journal's short name ("xyzj"). */
  journal?: string;
}

const MARKER = 'initializePendoMetadata';

/** The logged-in person, or null when the page doesn't say. */
export function readIdentity(doc: Document): McIdentity | null {
  for (const s of Array.from(doc.querySelectorAll('script:not([src])'))) {
    const text = s.textContent ?? '';
    if (text.includes(MARKER)) return identityFromScript(text);
  }
  return null;
}

export function identityFromScript(text: string): McIdentity | null {
  const at = text.indexOf(MARKER);
  if (at < 0) return null;
  const visitor = block(text, 'visitor', at);
  if (!visitor) return null;
  const v = fields(visitor);
  const email = (v.email || v.id || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  const a = fields(block(text, 'account', at) ?? '');
  const out: McIdentity = { email };
  if (v.first_name) out.firstName = v.first_name;
  if (v.last_name) out.lastName = v.last_name;
  if (v.person_id) out.personId = v.person_id;
  if (v.role_type_name) out.role = v.role_type_name;
  if (a.short_name) out.journal = a.short_name;
  return out;
}

/** The name MC shows for this person ("First Last"). */
export function mcName(id: McIdentity): string {
  return [id.firstName, id.lastName].filter(Boolean).join(' ') || id.email;
}

/**
 * How a note's author is shown: the name they gave us, with MC's name in
 * parentheses when the two differ ("Pat Example (Opinions Co-Chair)").
 */
export function authorLabel(displayName: string | undefined, mc: string): string {
  const d = displayName?.trim();
  if (!d) return mc;
  return fold(d) === fold(mc) ? d : `${d} (${mc})`;
}

function fold(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The text between the braces of `name: {…}` (no nesting inside). */
function block(text: string, name: string, from: number): string | null {
  const m = new RegExp(`\\b${name}\\s*:\\s*\\{([^}]*)\\}`).exec(text.slice(from));
  return m ? m[1]! : null;
}

/** key:"value" and key:123 pairs, with backslash escapes undone. */
function fields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_]\w*)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+))/g;
  for (let m; (m = re.exec(body)); ) out[m[1]!] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\\(.)/g, '$1');
  return out;
}
