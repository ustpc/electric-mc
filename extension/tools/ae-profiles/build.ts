// Builds ae-profiles.json: one expertise profile per AE, for the side panel's
// "Suggested AEs" (lib/match.ts). For each person in the roster it finds their
// recent papers in OpenAlex (titles and abstracts) and, when a DBLP pid is
// given, DBLP (titles), embeds them on this computer with the same model the
// extension bundles, and writes the vectors. Only public bibliographic data is
// fetched; no manuscript data is read or sent anywhere.
//
//   npx tsx tools/ae-profiles/build.ts ROSTER.json [--ids ids.json] [--out FILE] [--all]
//
// See tools/ae-profiles/README.md.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoster, fold, type RosterPerson } from '../../lib/roster';
import { DIMS, MODEL_DTYPE, MODEL_ID, encodeVec, normalize, words, type AeProfilesFile } from '../../lib/match';

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..', '..');
const repoVar = resolve(extDir, '..', 'var');

interface Ids {
  orcid?: string;
  openalex?: string;
  dblp?: string;
  keywords?: string[];
  skip?: boolean;
}

interface Work {
  title: string;
  abstract?: string;
  year?: number;
  source: string;
}

const MAX_PAPERS = 60;
const KEEP_VECS = 20;
const HALF_LIFE_YEARS = 5;

function args() {
  const a = process.argv.slice(2);
  const opt = (name: string) => {
    const i = a.indexOf(name);
    if (i < 0) return undefined;
    const v = a[i + 1];
    a.splice(i, 2);
    return v;
  };
  const flag = (name: string) => {
    const i = a.indexOf(name);
    if (i >= 0) a.splice(i, 1);
    return i >= 0;
  };
  const ids = opt('--ids');
  const out = opt('--out') ?? join(repoVar, 'ae-profiles.json');
  const cache = opt('--cache') ?? join(repoVar, 'ae-profiles-cache');
  const mailto = opt('--mailto') ?? process.env.OPENALEX_MAILTO;
  const all = flag('--all');
  const only = opt('--only');
  if (a.length !== 1) {
    console.error('usage: tsx tools/ae-profiles/build.ts ROSTER.json [--ids ids.json] [--out FILE] [--cache DIR] [--mailto EMAIL] [--all] [--only ID]');
    process.exit(2);
  }
  return { roster: a[0]!, ids, out, cache, mailto, all, only };
}

// ---- polite, cached fetching ----

let cacheDir = '';
let last = 0;
async function getText(url: string): Promise<string | null> {
  const file = join(cacheDir, createHash('sha1').update(url).digest('hex'));
  try {
    return await readFile(file, 'utf8');
  } catch {
    // not cached
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + 250 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': 'electric-mc-ae-profiles (https://github.com/ustpc/electric-mc)' } });
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    const body = await r.text();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, body);
    return body;
  }
  throw new Error(`${url}: gave up after retries`);
}

async function getJson<T>(url: string): Promise<T | null> {
  const t = await getText(url);
  return t === null ? null : (JSON.parse(t) as T);
}

// ---- OpenAlex ----

let mailto = '';
const oa = (path: string) => `https://api.openalex.org/${path}${path.includes('?') ? '&' : '?'}${mailto ? `mailto=${encodeURIComponent(mailto)}` : ''}`;

interface OaAuthor {
  id: string;
  display_name: string;
  works_count: number;
  cited_by_count: number;
  orcid?: string | null;
  last_known_institutions?: Array<{ display_name: string }>;
  affiliations?: Array<{ institution: { display_name: string } }>;
}

const shortId = (id: string) => id.replace(/^https:\/\/openalex\.org\//, '');

function institutions(a: OaAuthor): string[] {
  return [...(a.last_known_institutions ?? []).map((i) => i.display_name), ...(a.affiliations ?? []).map((x) => x.institution.display_name)];
}

/** Whether any of the roster's affiliations names one of the author's institutions. */
function sharesInstitution(a: OaAuthor, affiliations: string[]): boolean {
  const theirs = institutions(a).map((s) => words(s).join(' '));
  return affiliations.some((aff) => {
    const mine = words(aff).join(' ');
    return !!mine && theirs.some((t) => t && (t.includes(mine) || mine.includes(t)));
  });
}

async function findAuthor(p: RosterPerson, ids: Ids): Promise<{ author: OaAuthor | null; how: string }> {
  if (ids.openalex) return { author: await getJson<OaAuthor>(oa(`authors/${ids.openalex}`)), how: 'OpenAlex id from ids.json' };
  if (ids.orcid) return { author: await getJson<OaAuthor>(oa(`authors/orcid:${ids.orcid}`)), how: 'ORCID from ids.json' };
  const found = await getJson<{ results: OaAuthor[] }>(oa(`authors?search=${encodeURIComponent(p.name)}&per_page=25`));
  const name = fold(p.name).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  const surname = name[name.length - 1] ?? '';
  const candidates = (found?.results ?? []).filter((a) => fold(a.display_name).includes(surname));
  const affs = [...p.affiliations, p.mastheadAffiliation ?? ''].filter(Boolean);
  const byAff = candidates.filter((a) => sharesInstitution(a, affs));
  const pool = byAff.length ? byAff : candidates;
  const best = [...pool].sort((a, b) => b.works_count - a.works_count)[0] ?? null;
  const how = byAff.length ? `name search, matched affiliation (${byAff.length} candidate${byAff.length > 1 ? 's' : ''})` : `name search, NO affiliation match among ${candidates.length}: CHECK and add to ids.json`;
  return { author: best, how };
}

interface OaWork {
  title: string | null;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  type?: string;
}

function abstractOf(inv: Record<string, number[]> | null | undefined): string | undefined {
  if (!inv) return undefined;
  const at: string[] = [];
  for (const [w, pos] of Object.entries(inv)) for (const i of pos) at[i] = w;
  const s = at.filter(Boolean).join(' ');
  return s || undefined;
}

async function openAlexWorks(authorId: string): Promise<Work[]> {
  const url = oa(`works?filter=author.id:${shortId(authorId)}&sort=publication_date:desc&per_page=100&select=title,publication_year,abstract_inverted_index,type`);
  const got = await getJson<{ results: OaWork[] }>(url);
  return (got?.results ?? [])
    .filter((w) => w.title && w.type !== 'paratext' && w.type !== 'erratum')
    .map((w) => ({ title: w.title!, abstract: abstractOf(w.abstract_inverted_index), year: w.publication_year, source: 'OpenAlex' }));
}

// ---- DBLP ----

async function dblpWorks(pid: string): Promise<Work[]> {
  const xml = await getText(`https://dblp.org/pid/${pid}.xml`);
  if (!xml) return [];
  const out: Work[] = [];
  for (const m of xml.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
    const rec = m[1]!;
    const title = /<title>([\s\S]*?)<\/title>/.exec(rec)?.[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    const year = Number(/<year>(\d{4})<\/year>/.exec(rec)?.[1]);
    if (title) out.push({ title, year: year || undefined, source: 'DBLP' });
  }
  return out;
}

// ---- embedding ----

type Extractor = (texts: string[], opts: { pooling: 'cls'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

async function loadModel(): Promise<Extractor> {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = join(extDir, 'public', 'models') + '/';
  return (await pipeline('feature-extraction', MODEL_ID, { dtype: MODEL_DTYPE })) as unknown as Extractor;
}

async function embedAll(extract: Extractor, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16);
    const t = await extract(batch, { pooling: 'cls', normalize: true });
    for (let j = 0; j < batch.length; j++) out.push(normalize(t.data.slice(j * DIMS, (j + 1) * DIMS)));
  }
  return out;
}

const paperText = (w: Work) => (w.abstract ? `${w.title}. ${w.abstract}` : w.title).slice(0, 3000);

function dedupe(works: Work[]): Work[] {
  const seen = new Map<string, Work>();
  for (const w of works) {
    const k = words(w.title).join(' ');
    if (!k) continue;
    const prev = seen.get(k);
    // Keep the copy with an abstract.
    if (!prev || (!prev.abstract && w.abstract)) seen.set(k, { ...w, year: w.year ?? prev?.year });
  }
  return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

async function main() {
  const o = args();
  cacheDir = o.cache;
  mailto = o.mailto ?? '';
  if (!mailto) console.warn('Tip: set OPENALEX_MAILTO=you@example.org (or --mailto) to use OpenAlex\'s faster polite pool.');
  const roster = parseRoster(JSON.parse(await readFile(o.roster, 'utf8')));
  const ids: Record<string, Ids> = o.ids ? JSON.parse(await readFile(o.ids, 'utf8')) : {};
  const people = roster.people.filter((p) => (o.only ? p.id === o.only : o.all || p.assignable) && !ids[p.id]?.skip);
  console.log(`${people.length} people from ${o.roster}; loading ${MODEL_ID} (${MODEL_DTYPE})…`);
  const extract = await loadModel();
  const now = new Date().getFullYear();
  const file: AeProfilesFile = { format: 'electric-mc-ae-profiles', version: 1, model: MODEL_ID, dims: DIMS, builtAt: new Date().toISOString(), people: [] };
  const report: string[] = [];

  for (const p of people) {
    const id = ids[p.id] ?? {};
    const { author, how } = await findAuthor(p, id);
    const works: Work[] = [];
    const sources: string[] = [];
    if (author) {
      works.push(...(await openAlexWorks(author.id)));
      sources.push(`https://openalex.org/${shortId(author.id)}`);
    }
    if (id.dblp) {
      works.push(...(await dblpWorks(id.dblp)));
      sources.push(`https://dblp.org/pid/${id.dblp}`);
    }
    const papers = dedupe(works).slice(0, MAX_PAPERS);
    const line = `${p.id}: ${author ? `${author.display_name} [${institutions(author)[0] ?? 'no institution'}] ${sources[0]} via ${how}` : 'NOT FOUND in OpenAlex'}; ${papers.length} papers (${papers.filter((w) => w.abstract).length} with abstracts)`;
    console.log(line);
    report.push(line);
    if (!papers.length) continue;
    const vecs = await embedAll(extract, papers.map(paperText));
    const mean = new Float32Array(DIMS);
    vecs.forEach((v, i) => {
      const age = Math.max(0, now - (papers[i]!.year ?? now - 10));
      const w = 0.5 ** (age / HALF_LIFE_YEARS);
      for (let d = 0; d < DIMS; d++) mean[d]! += w * v[d]!;
    });
    normalize(mean);
    const keywords = [...p.expertise.split(/[;,\n]/), ...(id.keywords ?? [])].map((s) => s.trim()).filter(Boolean);
    file.people.push({
      id: p.id,
      name: p.name,
      keywords,
      mean: encodeVec(mean),
      papers: papers.slice(0, KEEP_VECS).map((w, i) => ({ title: w.title, year: w.year, vec: encodeVec(vecs[i]!) })),
      paperCount: papers.length,
      sources,
    });
  }

  await mkdir(dirname(o.out), { recursive: true });
  await writeFile(o.out, JSON.stringify(file));
  await writeFile(o.out.replace(/\.json$/, '') + '-report.txt', report.join('\n') + '\n');
  console.log(`\nWrote ${file.people.length} profiles to ${o.out}\nCheck ${o.out.replace(/\.json$/, '')}-report.txt for wrong matches, fix them in ids.json, and run again (fetches are cached).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
