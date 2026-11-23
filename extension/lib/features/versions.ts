// Versions of a manuscript (lib/milestones.ts, lib/versions.ts). Every
// manuscript page records its own version's AE and dates, and any Audit
// Trail on screen when decisions were sent. On a revision, the Version
// History table shows each earlier version's AE and Peer Review Milestones
// gets the previous version's dates, from what was recorded when those
// versions were viewed. Earlier versions are never looked up in the
// background: loading MC pages beside the person's tab logged them out
// (0.0.26 to 0.0.33).

import { KEY, type SeenManuscript } from '../messages';
import { addMilestoneRows, versionInfoFrom, type VersionInfo } from '../milestones';
import { annotateVersionRow, findVersionLinks } from '../versions';
import type { Feature, PageContext } from './feature';

const ROWS = 'tr[data-electric-mc="milestones"]';
const NOTES = '[data-electric-mc="version-ae"]';

export function versionHistory(): Feature {
  let recorded = '';
  const sentLetters = new Map<string, string>();
  const looked = new Set<string>();
  // What each earlier version's row says, kept so a redrawn Version History
  // is annotated again without another read; `gen` drops a read still
  // pending when E-MC or the setting is turned off.
  let notes: { on: string; text: Map<string, string> } | null = null;
  let gen = 0;
  let milestones: { on: string; info: VersionInfo } | null = null;
  let noLinksLogged = false;

  const recordLetters = ({ doc, result: r, send, letters }: PageContext) => {
    const bases = new Set(r.manuscriptIds.map((m) => m.baseId));
    for (const [id, responded] of letters()) {
      const baseId = id.replace(/\.R\d+$/, '');
      if (!bases.has(baseId) || sentLetters.get(id) === responded) continue;
      sentLetters.set(id, responded);
      send({ type: 'version-info', baseId, id, info: { id, responded }, source: 'page' });
      if (milestones?.info.id === id && milestones.info.responded !== responded) {
        milestones.info = { ...milestones.info, responded };
        addMilestoneRows(doc, milestones.info);
      }
    }
  };

  const recordThisVersion = ({ doc, result: r, send, letters }: PageContext) => {
    const m = r.manuscript;
    if (!m) return;
    const read = versionInfoFrom(doc, m.id);
    // "AE: Not Assigned" means unknown, never a name to remember.
    const named = m.handlingEditor && !/not assigned/i.test(m.handlingEditor) ? m.handlingEditor : undefined;
    const info: VersionInfo = { ...read, ae: read.ae ?? named, responded: letters().get(m.id) ?? read.responded };
    const key = JSON.stringify(info);
    if (key === recorded) return;
    recorded = key;
    send({ type: 'version-info', baseId: m.baseId, id: m.id, ae: info.ae, info, source: 'page' });
  };

  // Once per manuscript per page.
  const idColOf = (baseId: string) => (row: HTMLTableRowElement) => Array.from(row.cells).findIndex((c) => c.textContent?.includes(baseId));

  const earlierVersions = async ({ doc, result: r, settings, send, letters, get }: PageContext) => {
    const m = r.manuscript!;
    if (looked.has(m.id)) {
      // Rows MC drew again lose their notes: put them back from what was read.
      if (notes?.on !== m.id) return;
      const idCol = idColOf(m.baseId);
      for (const v of findVersionLinks(doc, m, settings.idPattern)) {
        const text = notes.text.get(v.ref.id);
        if (text && !v.row.querySelector('[data-electric-mc="version-ae"]')) annotateVersionRow(v.row, idCol(v.row), text);
      }
      return;
    }
    const links = findVersionLinks(doc, m, settings.idPattern);
    if (!links.length) {
      // MC may draw Version History later; the next run tries again.
      if (!noLinksLogged) send({ type: 'log', level: 'debug', event: 'no version links found', data: m.id });
      noLinksLogged = true;
      return;
    }
    looked.add(m.id);
    const idCol = idColOf(m.baseId);
    const mine = gen;
    const known = (await get<Record<string, SeenManuscript>>(KEY.seen))?.[m.baseId];
    if (mine !== gen) return;
    notes = { on: m.id, text: new Map() };
    links.forEach((v, i) => {
      const info: VersionInfo = { id: v.ref.id, ...known?.versionInfo?.[v.ref.id] };
      info.ae ??= known?.aeByVersion?.[v.ref.id];
      info.submitted ??= v.submitted;
      info.responded ??= letters().get(v.ref.id);
      const text = info.ae ? `AE: ${info.ae}` : 'AE: open this version once to record it';
      notes!.text.set(v.ref.id, text);
      annotateVersionRow(v.row, idCol(v.row), text);
      if (i === 0) {
        milestones = { on: m.id, info };
        if (!addMilestoneRows(doc, info)) send({ type: 'log', level: 'warn', event: 'peer review milestones table not found', data: m.id });
      }
    });
  };

  const clear = (doc: Document) => {
    doc.querySelectorAll(`${ROWS}, ${NOTES}`).forEach((e) => e.remove());
    looked.clear();
    notes = null;
    milestones = null;
    gen++;
  };

  return {
    id: 'versions',
    onPage(ctx) {
      recordLetters(ctx);
      recordThisVersion(ctx);
      const { doc, result: r, settings } = ctx;
      if (r.manuscript && r.manuscript.revision > 0 && settings.lookupEarlierVersions) {
        void earlierVersions(ctx);
        // MC sometimes redraws the section; put our rows back.
        if (milestones?.on === r.manuscript.id && !doc.querySelector(ROWS)) addMilestoneRows(doc, milestones.info);
      } else if (looked.size || doc.querySelector(`${ROWS}, ${NOTES}`)) {
        // The setting is off (or this isn't a revision): take everything away,
        // and start over if it's turned on again.
        clear(doc);
      }
    },
    off(doc) {
      clear(doc);
    },
  };
}
