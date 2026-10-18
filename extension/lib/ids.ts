// Manuscript ID handling. ScholarOne IDs look like CACM-26-10-9003 or
// TMI-2026-0123, with ".R<n>" for revisions. Journals can override the
// pattern in their config if theirs differs.

export interface ManuscriptRef {
  /** The ID as shown, including any revision suffix. */
  id: string;
  /** The ID without the revision suffix; all revisions share one thread. */
  baseId: string;
  /** 0 for the original submission, n for ".Rn". */
  revision: number;
}

export const DEFAULT_ID_PATTERN =
  '\\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\\d{2,4}(?:-\\d{2})?-\\d{3,6})(?:\\.R(\\d{1,2}))?\\b';

export function idRegex(pattern = DEFAULT_ID_PATTERN): RegExp {
  return new RegExp(pattern, 'g');
}

export function parseManuscriptId(s: string, pattern = DEFAULT_ID_PATTERN): ManuscriptRef | null {
  const re = idRegex(pattern);
  const m = re.exec(s);
  if (!m || !m[1]) return null;
  const revision = m[2] ? Number(m[2]) : 0;
  return { id: revision ? `${m[1]}.R${revision}` : m[1], baseId: m[1], revision };
}

/** All distinct manuscript IDs in the text, in first-seen order, with counts. */
export function findManuscriptIds(
  text: string,
  pattern = DEFAULT_ID_PATTERN,
): Array<ManuscriptRef & { count: number }> {
  const seen = new Map<string, ManuscriptRef & { count: number }>();
  const re = idRegex(pattern);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[1]) continue;
    const revision = m[2] ? Number(m[2]) : 0;
    const id = revision ? `${m[1]}.R${revision}` : m[1];
    const prev = seen.get(id);
    if (prev) prev.count++;
    else seen.set(id, { id, baseId: m[1], revision, count: 1 });
  }
  return [...seen.values()];
}
