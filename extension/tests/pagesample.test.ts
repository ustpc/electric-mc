import { describe, expect, it } from 'vitest';
import { SAMPLE_MS, sampleDue, sampleFileName } from '../lib/pagesample';

describe('weekly page samples', () => {
  it('takes one sample per MC page name per week', () => {
    const now = 10 * SAMPLE_MS;
    expect(sampleDue(undefined, 'ASSOCIATE_EDITOR_DASHBOARD', now)).toBe(true);
    expect(sampleDue({ ASSOCIATE_EDITOR_DASHBOARD: now - 1000 }, 'ASSOCIATE_EDITOR_DASHBOARD', now)).toBe(false);
    expect(sampleDue({ ASSOCIATE_EDITOR_DASHBOARD: now - SAMPLE_MS }, 'ASSOCIATE_EDITOR_DASHBOARD', now)).toBe(true);
    expect(sampleDue({ ASSOCIATE_EDITOR_DASHBOARD: now }, 'LOGIN', now)).toBe(true);
    expect(sampleDue({}, null, now)).toBe(false);
  });
  it('only makes file names from MC page names', () => {
    expect(sampleFileName('ASSOCIATE_EDITOR_DASHBOARD')).toBe('ASSOCIATE_EDITOR_DASHBOARD.html');
    expect(sampleFileName('../etc/passwd')).toBeNull();
    expect(sampleFileName('lower')).toBeNull();
  });
});

describe('Clear all data', () => {
  it('clears every storage.local key except the settings', async () => {
    const { KEY, LOCAL_DATA_KEYS } = await import('../lib/messages');
    const kept = new Set<string>([KEY.settings]);
    const all: string[] = Object.values(KEY).filter((v) => typeof v === 'string');
    expect(all.filter((k) => !kept.has(k) && !LOCAL_DATA_KEYS.includes(k))).toEqual([]);
    expect(LOCAL_DATA_KEYS).not.toContain(KEY.settings);
  });
});
