// The AE-assignment pull-down. MC shows each editor's current number of
// manuscripts there (kept for the Opinions matrix, lib/aeload.ts); we style
// it from the menu layout and roster (lib/aemenu.ts), and on a revision
// mark and group the AEs of its earlier versions (lib/earlierae.ts).

import { findAeSelect, journalKey, parseOption, readAeLoad } from '../aeload';
import { activeAeMenu, aeMenuStatus, clearAeMenu, plainAeMenu, type AeMenuStore, type FirstGroup } from '../aemenu';
import { earlierIds, markAeList, type EarlierAe } from '../earlierae';
import { KEY, type SeenManuscript } from '../messages';
import type { Team } from '../team';
import type { Feature, PageContext } from './feature';

export function aeAssignMenu(): Feature {
  let menu: AeMenuStore | undefined;
  let team: Team | null = null;
  let loadKey = '';
  // Logged once per page that has an AE pull-down: whether it was styled, or why not.
  let logged = '';
  let earlier: { on: string; list: EarlierAe[] } | null = null;
  let last: PageContext | null = null;

  const firstGroup = (): FirstGroup | undefined => {
    if (!earlier || earlier.on !== last?.result.manuscript?.id) return undefined;
    const names = [...new Set(earlier.list.map((v) => v.ae).filter((n): n is string => !!n))];
    if (!names.length) return undefined;
    return { label: names.length === 1 && earlier.list.length === 1 ? 'Original AE' : 'Earlier AEs', names };
  };

  const style = ({ doc, send }: PageContext) => {
    const c = activeAeMenu(menu);
    const first = firstGroup();
    let status: string;
    if (c) status = aeMenuStatus(doc, c, team, first);
    else if (first) {
      status = aeMenuStatus(doc, plainAeMenu(), team, first);
      if (status === 'styled') status = 'styled (earlier AE only)';
    } else {
      clearAeMenu(doc);
      const cfg = menu?.source === 'server' ? menu.server : menu?.local;
      status = !cfg ? `off: no ${menu?.source === 'server' ? 'server' : 'browser'} config` : 'off: config not enabled';
    }
    if (status === 'no AE pull-down' || (!c && !findAeSelect(doc))) {
      // A pull-down full of "Name (3)" options that wasn't recognized: say so once.
      const counted = Array.from(doc.querySelectorAll('select')).some((sel) => Array.from(sel.options).filter((o) => parseOption(o.text)).length >= 5);
      if (!counted) return;
      status = 'not recognized as the AE pull-down';
    }
    const key = `${doc.location?.href ?? ''}|${status}`;
    if (key === logged) return;
    logged = key;
    send({ type: 'log', level: 'info', event: 'AE menu', data: { status, source: menu?.source ?? 'none', groups: c?.groups.length ?? 0, teamPeople: team?.people.length ?? 0, earlierAes: first?.names.length ?? 0 } });
  };

  const recordLoad = ({ doc, send }: PageContext) => {
    const entries = readAeLoad(doc);
    if (!entries) return;
    const key = JSON.stringify(entries);
    if (key === loadKey) return;
    loadKey = key;
    send({ type: 'ae-load', journal: journalKey(doc.location?.href ?? ''), entries });
  };

  const loadEarlier = async (ctx: PageContext) => {
    const m = ctx.result.manuscript;
    if (!m || m.revision < 1 || !ctx.settings.lookupEarlierVersions) {
      earlier = null;
      return;
    }
    if (earlier?.on === m.id) return;
    earlier = { on: m.id, list: [] };
    const known = (await ctx.get<Record<string, SeenManuscript>>(KEY.seen))?.[m.baseId];
    const list = earlierIds(m.baseId, m.revision).map((id) => ({ id, ae: known?.versionInfo?.[id]?.ae ?? known?.aeByVersion?.[id] }));
    if (earlier?.on !== m.id) return;
    earlier = { on: m.id, list };
    markAeList(ctx.doc, list);
    style(last ?? ctx);
  };

  return {
    id: 'ae-menu',
    watches: [KEY.aeMenu, KEY.team],
    onStored(key, value, ctx) {
      if (key === KEY.aeMenu) menu = value as AeMenuStore | undefined;
      else team = (value as Team | undefined) ?? null;
      if (ctx) style(ctx);
    },
    onPage(ctx) {
      last = ctx;
      recordLoad(ctx);
      void loadEarlier(ctx);
      markAeList(ctx.doc, earlier?.on === ctx.result.manuscript?.id ? (earlier?.list ?? []) : []);
      style(ctx);
    },
    off(doc) {
      clearAeMenu(doc);
      last = null;
    },
  };
}
