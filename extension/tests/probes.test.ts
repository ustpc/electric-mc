// @vitest-environment jsdom
// Probes on the synthetic fixtures (so a change that breaks one fails CI),
// and the rule that learns them per MC page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { applyProbes, blockedBy, brokenProbes, BROKEN_AFTER, ESTABLISHED, runProbes, type ProbeStore } from '../lib/probes';

const page = (name: string) => new JSDOM(readFileSync(join(__dirname, 'fixtures', name), 'utf8'), { url: 'https://mc.manuscriptcentral.com/cacm' }).window.document;
const found = (name: string) => Object.entries(runProbes(page(name))).filter(([, v]) => v).map(([k]) => k).sort();

describe('probes on the fixtures', () => {
  it('find what each kind of page has', () => {
    expect(found('manuscript-modern.html')).toEqual(['editorBlock', 'recommendsForm', 'searchToggle', 'taskLinks']);
    expect(found('search-results.html')).toEqual(expect.arrayContaining(['takeActionGrid']));
    expect(found('login.html')).toEqual([]);
  });
});

describe('learning probes per page', () => {
  const load = (store: ProbeStore, ok: boolean) => applyProbes(store, 'ASSOCIATE_EDITOR_ASSIGN', { aeSelect: ok, identity: true });

  it('says MC changed only after an established probe fails several loads in a row, and when it is back', () => {
    let store: ProbeStore = {};
    for (let i = 0; i < ESTABLISHED; i++) store = load(store, true).store;
    let broke: string[] = [];
    for (let i = 0; i < BROKEN_AFTER; i++) ({ store, broke } = load(store, false));
    expect(broke).toEqual(['aeSelect']);
    expect(brokenProbes(store)).toEqual([{ page: 'ASSOCIATE_EDITOR_ASSIGN', probe: 'aeSelect' }]);
    expect(blockedBy(store, 'ASSOCIATE_EDITOR_ASSIGN', 'oneButtonReject')).toEqual(['aeSelect']);
    expect(blockedBy(store, 'OTHER_PAGE', 'oneButtonReject')).toEqual([]);
    const back = load(store, true);
    expect(back.recovered).toEqual(['aeSelect']);
    expect(brokenProbes(back.store)).toEqual([]);
  });

  it('never calls a probe broken that was never established', () => {
    let store: ProbeStore = {};
    for (let i = 0; i < 50; i++) store = load(store, false).store;
    expect(brokenProbes(store)).toEqual([]);
  });
});
