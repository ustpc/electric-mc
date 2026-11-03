// AE suggestions for a manuscript: which associate editors' published work
// is closest to it. Each AE's expertise profile is built on the co-chair's
// computer by tools/ae-profiles (public papers from OpenAlex and DBLP,
// embedded with the same model the extension bundles) and loaded from
// ae-profiles.json into this browser's chrome.storage.local. The manuscript
// is embedded on this device (lib/embed.ts) and never leaves it.
// See doc/planning/AE recruitment and matching.md §3.

import { fold } from './roster';

/** The bundled model; profiles built with any other model are refused. */
export const MODEL_ID = 'Xenova/bge-small-en-v1.5';
export const MODEL_DTYPE = 'q8';
export const DIMS = 384;

export interface ProfilePaper {
  title: string;
  year?: number;
}

export interface AeProfile {
  /** The roster id, so the matrix and the side panel agree on who is who. */
  id: string;
  name: string;
  /** Free-text expertise or keywords, from the roster or the co-chair. */
  keywords: string[];
  /** Recency-weighted mean of the paper vectors, unit length. */
  mean: Float32Array;
  /** Up to 20 recent paper vectors, unit length, in the order of `papers`. */
  paperVecs: Float32Array[];
  papers: ProfilePaper[];
  paperCount: number;
  sources: string[];
}

export interface AeProfiles {
  format: 'electric-mc-ae-profiles';
  version: 1;
  model: string;
  dims: number;
  builtAt: string;
  people: AeProfile[];
}

/** The file as written: vectors are base64 int8 (scale doesn't matter for cosine). */
export interface AeProfilesFile {
  format: 'electric-mc-ae-profiles';
  version: 1;
  model: string;
  dims: number;
  builtAt: string;
  people: Array<{
    id: string;
    name: string;
    keywords?: string[];
    mean: string;
    papers: Array<ProfilePaper & { vec: string }>;
    paperCount: number;
    sources?: string[];
  }>;
}

class Invalid extends Error {}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

/** A vector as base64 int8, scaled so its largest component is ±127. */
export function encodeVec(v: ArrayLike<number>): string {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]!));
  const q = new Int8Array(v.length);
  if (max > 0) for (let i = 0; i < v.length; i++) q[i] = Math.round((v[i]! / max) * 127);
  return bytesToB64(new Uint8Array(q.buffer));
}

/** A base64 int8 vector back to a unit-length Float32Array. */
export function decodeVec(s: string, dims = DIMS): Float32Array {
  const bytes = b64ToBytes(s);
  if (bytes.length !== dims) throw new Invalid(`a vector has ${bytes.length} numbers, not ${dims}`);
  const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  return normalize(Float32Array.from(q));
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** The profiles in a loaded file, or an Error saying what's wrong with it. */
export function parseProfiles(json: unknown): AeProfiles {
  const r = json as Partial<AeProfilesFile> | null;
  if (!r || typeof r !== 'object' || r.format !== 'electric-mc-ae-profiles') throw new Invalid('This is not an Electric MC AE profiles file (ae-profiles.json from tools/ae-profiles).');
  if (r.version !== 1) throw new Invalid(`Profiles version ${String(r.version)} is newer than this extension understands.`);
  if (r.model !== MODEL_ID) throw new Invalid(`These profiles were built with ${String(r.model)}, but this extension uses ${MODEL_ID}. Rebuild them.`);
  if (r.dims !== DIMS) throw new Invalid(`These profiles have ${String(r.dims)} dimensions, not ${DIMS}.`);
  if (!Array.isArray(r.people) || !r.people.length || r.people.length > 1000) throw new Invalid('The file has no people.');
  const people = r.people.map((p, i): AeProfile => {
    const at = `people[${i}]`;
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') throw new Invalid(`${at} needs an id and a name`);
    if (typeof p.mean !== 'string') throw new Invalid(`${at}.mean is missing`);
    const papers = Array.isArray(p.papers) ? p.papers.slice(0, 50) : [];
    try {
      return {
        id: p.id,
        name: p.name,
        keywords: Array.isArray(p.keywords) ? p.keywords.filter((k): k is string => typeof k === 'string').slice(0, 100) : [],
        mean: decodeVec(p.mean),
        paperVecs: papers.map((x) => decodeVec(x.vec)),
        papers: papers.map((x) => ({ title: String(x.title ?? '').slice(0, 500), year: typeof x.year === 'number' ? x.year : undefined })),
        paperCount: typeof p.paperCount === 'number' ? p.paperCount : papers.length,
        sources: Array.isArray(p.sources) ? p.sources.filter((s): s is string => typeof s === 'string') : [],
      };
    } catch (e) {
      throw new Invalid(`${at}: ${(e as Error).message}`);
    }
  });
  return { format: 'electric-mc-ae-profiles', version: 1, model: r.model, dims: r.dims, builtAt: String(r.builtAt ?? ''), people };
}

export interface AeMatch {
  id: string;
  name: string;
  /** 0.6 · cos(manuscript, mean) + 0.4 · best cos(manuscript, paper). */
  score: number;
  meanSim: number;
  bestSim: number;
  /** The AE's paper closest to the manuscript, to show why. */
  closest?: ProfilePaper;
  /** Share of the manuscript's keywords found in the AE's keywords (0–1). */
  keywordScore: number;
}

/** Words worth matching on: lowercase, no accents, no stop words or short words. */
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or our that the their this to using we with via toward towards based study paper approach new'.split(' '));
export function words(text: string): string[] {
  return fold(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * How many of the manuscript's keywords (a list, or words of its title when
 * it has none) appear in the AE's keywords, as a share. Phrases match when
 * all their words appear.
 */
export function keywordScore(msKeywords: string[], aeKeywords: string[]): number {
  const ms = msKeywords.map((k) => words(k)).filter((w) => w.length);
  if (!ms.length) return 0;
  const ae = new Set(aeKeywords.flatMap(words));
  const hit = ms.filter((phrase) => phrase.every((w) => ae.has(w))).length;
  return hit / ms.length;
}

/** Split MC's keywords field ("a; b, c") into keywords. */
export function splitKeywords(field: string | undefined): string[] {
  return (field ?? '').split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
}

/** Every AE ranked against the manuscript's vector, best first. */
export function rankAes(ms: Float32Array, profiles: AeProfile[], msKeywords: string[] = []): AeMatch[] {
  return profiles
    .map((p): AeMatch => {
      const meanSim = dot(ms, p.mean);
      let bestSim = -Infinity;
      let closest: ProfilePaper | undefined;
      p.paperVecs.forEach((v, i) => {
        const s = dot(ms, v);
        if (s > bestSim) {
          bestSim = s;
          closest = p.papers[i];
        }
      });
      if (!p.paperVecs.length) bestSim = meanSim;
      return { id: p.id, name: p.name, score: 0.6 * meanSim + 0.4 * bestSim, meanSim, bestSim, closest, keywordScore: keywordScore(msKeywords, p.keywords) };
    })
    .sort((a, b) => b.score - a.score);
}

/** The text of a manuscript that gets embedded: title, abstract and keywords. */
export function manuscriptText(title: string | undefined, abstract: string | undefined, keywords: string[]): string {
  return [title, abstract, keywords.length ? `Keywords: ${keywords.join(', ')}` : ''].filter(Boolean).join('\n\n');
}
