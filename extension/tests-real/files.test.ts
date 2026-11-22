// The editor's own files in var/ load with the extension's readers.
import { describe, expect, it } from 'vitest';
import { parseTeam } from '../lib/team';
import { parseRoster } from '../lib/roster';
import { parseAeMenu } from '../lib/aemenu';
import { files, HAVE_VAR, read } from './data';

const teams = files(/^team.*\.json$/);
const rosters = files(/^roster.*\.json$/);
const menus = files(/^ae-menu.*\.json$/);

// Only a yes/no comes out: the readers' errors can quote IDs and names from
// the file, so they are caught here and never passed on.
const ok = (p: string, check: (json: unknown) => boolean): boolean => {
  try {
    return check(JSON.parse(read(p)));
  } catch {
    return false;
  }
};

describe.skipIf(!HAVE_VAR || !(teams.length + rosters.length + menus.length))('the editor\'s files', () => {
  teams.forEach((p, i) =>
    it(`team file ${i + 1}`, () => {
      expect(ok(p, (j) => parseTeam(j).people.length > 0), `team file ${i + 1} doesn't load or has no people`).toBe(true);
    }),
  );
  rosters.forEach((p, i) =>
    it(`roster file ${i + 1}`, () => {
      expect(ok(p, (j) => parseRoster(j).people.length > 0), `roster file ${i + 1} doesn't load or has no people`).toBe(true);
    }),
  );
  menus.forEach((p, i) =>
    it(`AE menu file ${i + 1}`, () => {
      expect(ok(p, (j) => parseAeMenu(j).groups.length >= 0), `AE menu file ${i + 1} doesn't load`).toBe(true);
    }),
  );
});
