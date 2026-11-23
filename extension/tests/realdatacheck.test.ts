// The real-data guard (tools/privacy/check-no-real-data.mjs). Everything
// here is synthetic: the "real" data is written to a temporary var/.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localSecrets, scanText, syntheticNumber } from '../../tools/privacy/check-no-real-data.mjs';

// Built from pieces so this file doesn't trip the check itself.
const id = (n: string) => ['XYZJ', '26', '01', n].join('-');
const mail = (user: string) => `${user}@${'university'}.edu`;

describe('check-no-real-data', () => {
  it('knows the synthetic manuscript numbers', () => {
    expect(syntheticNumber('1000')).toBe(true);
    expect(syntheticNumber('9999')).toBe(true);
    expect(syntheticNumber('6303')).toBe(false);
  });
  it('flags IDs and emails by shape, and never says what matched', () => {
    const text = `ok ${id('1234')}.R1 and pat@example.org\nbad ${id('5555')} and ${mail('someone')}`;
    const found = scanText(text);
    expect(found).toEqual([
      { line: 2, kind: 'manuscript ID outside the synthetic ranges' },
      { line: 2, kind: 'email address outside example.org' },
    ]);
    expect(JSON.stringify(found)).not.toContain('5555');
  });
  it('lets allowlisted examples through', () => {
    expect(scanText(id('5555'), new Set([id('5555')]))).toEqual([]);
  });
  it('finds names, emails and IDs from a local var/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'emc-var-'));
    try {
      writeFileSync(join(dir, 'team.json'), JSON.stringify({ people: [{ name: 'Robin Synthetic', email: mail('robin') }, { name: 'Testperson, Avery' }] }));
      writeFileSync(join(dir, 'electric-mc.log'), `{"data":"${id('4321')}"}\n`);
      const s = localSecrets(dir);
      expect(s.emails.has(mail('robin'))).toBe(true);
      expect(s.ids.has(id('4321'))).toBe(true);
      expect(scanText('Thanks to Robin Synthetic', new Set(), s)).toEqual([{ line: 1, kind: 'a person named in var/' }]);
      expect(scanText('Avery Testperson wrote', new Set(), s)).toEqual([{ line: 1, kind: 'a person named in var/' }]);
      expect(scanText(`see ${id('4321')}.R1`, new Set([id('4321')]), s)).toEqual([{ line: 1, kind: 'a manuscript ID from var/' }]);
      expect(scanText('nothing here', new Set(), s)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
