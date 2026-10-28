// AE suggestions: profile file loading and ranking. Made-up people and vectors only.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { DIMS, MODEL_ID, decodeVec, dot, encodeVec, keywordScore, manuscriptText, parseProfiles, rankAes, splitKeywords, type AeProfilesFile } from '../lib/match';
import { abstractAndKeywords } from '../parsers/extract';

/** A unit vector pointing mostly along axis `i`, with a little of axis `j`. */
function vec(i: number, j = (i + 1) % DIMS, mix = 0.1): Float32Array {
  const v = new Float32Array(DIMS);
  v[i] = 1;
  v[j] = mix;
  const n = Math.hypot(1, mix);
  return v.map((x) => x / n);
}

const file = (): AeProfilesFile => ({
  format: 'electric-mc-ae-profiles',
  version: 1,
  model: MODEL_ID,
  dims: DIMS,
  builtAt: '2026-10-28T00:00:00Z',
  people: [
    { id: 'pat-editor', name: 'Pat Editor', keywords: ['synthetic privacy', 'made-up systems'], mean: encodeVec(vec(0)), papers: [{ title: 'A Synthetic Paper About Privacy', year: 2025, vec: encodeVec(vec(0)) }], paperCount: 1 },
    {
      id: 'robin-editor', name: 'Robin Editor', keywords: ['imaginary networks'], mean: encodeVec(vec(5)), paperCount: 2,
      papers: [
        { title: 'An Invented Study of Networks', year: 2024, vec: encodeVec(vec(5)) },
        { title: 'A Niche Synthetic Paper', year: 2020, vec: encodeVec(vec(9)) },
      ],
    },
  ],
});

describe('vectors', () => {
  it('survive int8 encoding with cosine intact', () => {
    const v = vec(3, 7, 0.4);
    const back = decodeVec(encodeVec(v));
    expect(dot(v, back)).toBeGreaterThan(0.999);
  });
  it('reject the wrong length', () => {
    expect(() => decodeVec(encodeVec(new Float32Array(10)))).toThrow(/10 numbers/);
  });
});

describe('parseProfiles', () => {
  it('loads a good file', () => {
    const p = parseProfiles(file());
    expect(p.people.map((x) => x.id)).toEqual(['pat-editor', 'robin-editor']);
    expect(p.people[1]!.paperVecs).toHaveLength(2);
  });
  it('refuses other files and other models', () => {
    expect(() => parseProfiles({})).toThrow(/not an Electric MC AE profiles/);
    expect(() => parseProfiles({ ...file(), model: 'some/other-model' })).toThrow(/Rebuild/);
    expect(() => parseProfiles({ ...file(), version: 2 })).toThrow(/newer/);
    expect(() => parseProfiles({ ...file(), people: [] })).toThrow(/no people/);
  });
});

describe('rankAes', () => {
  const people = parseProfiles(file()).people;
  it('puts the closest profile first', () => {
    const r = rankAes(vec(0), people);
    expect(r.map((m) => m.id)).toEqual(['pat-editor', 'robin-editor']);
    expect(r[0]!.closest?.title).toBe('A Synthetic Paper About Privacy');
  });
  it('lets one close paper lift a broad AE (max-sim)', () => {
    const r = rankAes(vec(9), people);
    expect(r[0]!.id).toBe('robin-editor');
    expect(r[0]!.closest?.title).toBe('A Niche Synthetic Paper');
    expect(r[0]!.bestSim).toBeGreaterThan(r[0]!.meanSim);
  });
  it('reports keyword overlap', () => {
    const r = rankAes(vec(0), people, ['Synthetic Privacy', 'quantum stuff']);
    expect(r.find((m) => m.id === 'pat-editor')!.keywordScore).toBe(0.5);
  });
});

describe('keywords', () => {
  it('match phrases word by word, ignoring case and accents', () => {
    expect(keywordScore(['Privacy, Synthetic'], ['synthetic privacy'])).toBe(1);
    expect(keywordScore(['Résumé parsing'], ['resume parsing tools'])).toBe(1);
    expect(keywordScore([], ['anything'])).toBe(0);
  });
  it('split MC keyword fields', () => {
    expect(splitKeywords('made-up systems; synthetic privacy, imaginary networks')).toEqual(['made-up systems', 'synthetic privacy', 'imaginary networks']);
    expect(manuscriptText('A Title', undefined, ['k1'])).toBe('A Title\n\nKeywords: k1');
  });
});

describe('abstractAndKeywords', () => {
  it('reads the whole abstract and the keywords', () => {
    const long = 'This is a synthetic abstract. '.repeat(30).trim();
    const doc = new JSDOM(`<table><tr><td>Abstract:</td><td>${long}</td></tr><tr><td>Keywords:</td><td>synthetic privacy; made-up systems</td></tr></table>`).window.document;
    const got = abstractAndKeywords(doc);
    expect(got.abstract).toBe(long);
    expect(got.keywords).toBe('synthetic privacy; made-up systems');
  });
});
