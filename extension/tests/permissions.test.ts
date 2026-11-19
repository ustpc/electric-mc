// The permission guard (scripts/check-permissions.mjs) and its allowlist.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asks, extra, flavor } from '../scripts/check-permissions.mjs';

const allow = JSON.parse(readFileSync(join(__dirname, '../permissions.json'), 'utf8')) as Record<string, Record<string, string[]>>;
const base = {
  name: 'Electric MC',
  permissions: ['storage', 'sidePanel', 'downloads', 'tabs', 'contextMenus'],
  host_permissions: ['https://*.manuscriptcentral.com/*'],
  content_scripts: [{ matches: ['https://*.manuscriptcentral.com/*'] }],
  web_accessible_resources: [{ resources: ['pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs'], matches: ['https://*.manuscriptcentral.com/*'] }],
};

describe('check-permissions', () => {
  it('passes the store manifest as it is today', () => {
    expect(flavor(base)).toBe('store');
    expect(extra(base, allow.store!)).toEqual([]);
  });
  it('flags a new permission, host, optional permission or resource', () => {
    expect(extra({ ...base, permissions: [...base.permissions, 'identity'] }, allow.store!)).toEqual(['permissions: identity']);
    expect(extra({ ...base, host_permissions: [...base.host_permissions, 'https://sheets.googleapis.com/*'] }, allow.store!)).toEqual(['host_permissions: https://sheets.googleapis.com/*']);
    expect(extra({ ...base, optional_permissions: ['alarms'] }, allow.store!)).toEqual(['optional_permissions: alarms']);
    expect(extra({ ...base, externally_connectable: { matches: ['https://example.org/*'] } }, allow.store!)).toEqual(['externally_connectable: https://example.org/*']);
  });
  it('keeps test-build-only permissions out of the store build', () => {
    const test = { ...base, name: 'Electric MC (test build v0.0.1)', permissions: [...base.permissions, 'nativeMessaging'] };
    expect(flavor(test)).toBe('test');
    expect(extra(test, allow.test!)).toEqual([]);
    expect(extra({ ...test, name: 'Electric MC' }, allow.store!)).toEqual(['permissions: nativeMessaging']);
  });
  it('lists what a manifest asks for, sorted', () => {
    expect(asks(base).permissions).toEqual(['contextMenus', 'downloads', 'sidePanel', 'storage', 'tabs']);
  });
});
