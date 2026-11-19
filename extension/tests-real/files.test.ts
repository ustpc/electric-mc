// The editor's own files in var/ load with the extension's readers.
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTeam } from '../lib/team';
import { parseRoster } from '../lib/roster';
import { parseAeMenu } from '../lib/aemenu';
import { files, HAVE_VAR, read } from './data';

const teams = files(/^team.*\.json$/);
const rosters = files(/^roster.*\.json$/);
const menus = files(/^ae-menu.*\.json$/);

describe.skipIf(!HAVE_VAR || !(teams.length + rosters.length + menus.length))('the editor\'s files', () => {
  teams.forEach((p, i) =>
    it(`team file ${i + 1}`, () => {
      const t = parseTeam(JSON.parse(read(p)));
      expect(t.people.length > 0, `team file ${i + 1} has no people`).toBe(true);
    }),
  );
  rosters.forEach((p, i) =>
    it(`roster file ${i + 1}`, () => {
      expect(parseRoster(JSON.parse(read(p))).people.length > 0, `roster file ${i + 1} has no people`).toBe(true);
    }),
  );
  menus.forEach((p) =>
    it(basename(p).replace(/[^a-z-]/gi, '').slice(0, 40), () => {
      expect(parseAeMenu(JSON.parse(read(p))).groups.length >= 0).toBe(true);
    }),
  );
});
