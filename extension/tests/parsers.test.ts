import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parsePage } from '../parsers';
import type { PageType, ParseResult } from '../parsers/types';
import { MUTATIONS } from './mutate';

const DIR = join(__dirname, 'fixtures');
const URL = 'https://mc.manuscriptcentral.com/cacm';

function load(name: string, mutate?: (d: Document) => void): ParseResult {
  const dom = new JSDOM(readFileSync(join(DIR, name), 'utf8'), { url: URL });
  mutate?.(dom.window.document);
  return parsePage(dom.window.document, URL);
}

const CHECKS: Record<string, { pageType: PageType; check: (r: ParseResult) => void }> = {
  'login.html': { pageType: 'login', check: () => {} },
  'main-menu.html': { pageType: 'main-menu', check: () => {} },
  'role-center.html': {
    pageType: 'role-center',
    check: (r) => {
      const names = (r.queues ?? []).map((q) => q.name.toLowerCase());
      expect(names).toContain('awaiting reviewer scores');
      expect(r.queues?.find((q) => /awaiting reviewer scores/i.test(q.name))?.count).toBe(3);
    },
  },
  'queue-list.html': {
    pageType: 'queue-list',
    check: (r) => {
      expect(r.rows?.map((x) => x.id).sort()).toEqual(['CACM-26-03-9002.R2', 'CACM-26-09-9004', 'CACM-26-10-9003']);
      const rev = r.rows?.find((x) => x.baseId === 'CACM-26-03-9002');
      expect(rev?.revision).toBe(2);
      expect(rev?.title?.toLowerCase()).toContain('software supply chains');
    },
  },
  // Status cells hold small tables; those rows are still data rows.
  'queue-status-tables.html': {
    pageType: 'queue-list',
    check: (r) => {
      expect(r.rows?.map((x) => x.id)).toEqual(['TEST-26-10-9007', 'TEST-26-10-9008', 'TEST-26-03-1111.R2']);
    },
  },
  // Search results: the table is framed by another row; read its own columns.
  'search-results.html': {
    pageType: 'queue-list',
    check: (r) => {
      expect(r.rows).toHaveLength(1);
      const row = r.rows![0]!;
      expect(row.id).toBe('TEST-26-10-9009');
      expect(row.title).toBe('A Synthetic Search Title');
      // (One mutation drops colons, so compare without them.)
      expect(row.status?.replace(/:/g, '').split('\n')).toEqual([
        'AE Not Assigned',
        'CC Chair, Test',
        'EIC Chief, Test',
        'ADM Admin, Test',
        '• Make Immediate Decision',
        '• Assign AE (Due 20-Oct-2026)',
      ]);
    },
  },
  'manuscript.html': {
    pageType: 'manuscript',
    check: (r) => {
      const m = r.manuscript!;
      expect(m.id).toBe('CACM-26-03-9002.R2');
      expect(m.baseId).toBe('CACM-26-03-9002');
      expect(m.title?.toLowerCase()).toContain('software supply chains');
      expect(m.status?.toLowerCase()).toContain('awaiting ae recommendation');
      expect(m.type?.toLowerCase()).toBe('opinion');
      expect(m.reviewers.length).toBe(2);
    },
  },
  'manuscript-modern.html': {
    pageType: 'manuscript',
    check: (r) => {
      const m = r.manuscript!;
      expect(m.id).toBe('XYZJ-26-07-1234.R1');
      expect(m.title).toBe('An Invented Essay on Synthetic Machines');
      expect(m.submitted).toBe('09-Sep-2026');
      expect(m.handlingEditor).toBe('Editor, Pat');
      expect(m.reviewers.map((p) => p.name)).toEqual(['Reviewer, Alpha', 'Reviewer, Beta']);
      expect(r.heading ?? '').not.toMatch(/privacy/i);
      expect(r.breadcrumb.slice(0, 2)).toEqual(['Co-Chair Dashboard', 'Awaiting Co-Chair Recommendation']);
    },
  },
  'queue-rowspan.html': {
    pageType: 'queue-list',
    check: (r) => {
      expect(r.rows?.map((x) => x.id)).toEqual(['XYZJ-26-03-1111.R2', 'XYZJ-26-09-9005', 'XYZJ-26-08-9006.R1']);
    },
  },
  'popup.html': {
    pageType: 'popup',
    check: (r) => expect(r.manuscript?.id).toBe('CACM-26-10-9003'),
  },
};

describe('synthetic fixtures', () => {
  it('covers every fixture file', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.html')).sort()).toEqual(Object.keys(CHECKS).sort());
  });
  for (const [file, c] of Object.entries(CHECKS)) {
    it(`${file} → ${c.pageType}`, () => {
      const r = load(file);
      expect(r.pageType, JSON.stringify(r.alternatives)).toBe(c.pageType);
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
      c.check(r);
    });
  }
});

describe('robust to template changes', () => {
  for (const [mname, mutate] of Object.entries(MUTATIONS)) {
    for (const [file, c] of Object.entries(CHECKS)) {
      it(`${mname}: ${file}`, () => {
        const r = load(file, mutate);
        expect(r.pageType, JSON.stringify({ alt: r.alternatives, sig: r.signals })).toBe(c.pageType);
        c.check(r);
      });
    }
  }
  for (const [file, c] of Object.entries(CHECKS)) {
    it(`all mutations at once: ${file}`, () => {
      const r = load(file, (d) => Object.values(MUTATIONS).forEach((m) => m(d)));
      expect(r.pageType, JSON.stringify({ alt: r.alternatives, sig: r.signals })).toBe(c.pageType);
      c.check(r);
    });
  }
});

describe('fingerprint', () => {
  it('ignores text but changes with structure', () => {
    const a = load('manuscript.html');
    const b = load('manuscript.html', (d) => {
      const w = d.createTreeWalker(d.body, 4);
      for (let n = w.nextNode(); n; n = w.nextNode()) n.textContent = 'x';
    });
    const c = load('manuscript.html', MUTATIONS['wrap in divs']);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

describe('never throws', () => {
  it('handles an empty page', () => {
    const dom = new JSDOM('<html><body></body></html>', { url: URL });
    const r = parsePage(dom.window.document, URL);
    expect(r.pageType).toBe('unknown');
  });
  it('handles a bad ID pattern', () => {
    const dom = new JSDOM(readFileSync(join(DIR, 'manuscript.html'), 'utf8'), { url: URL });
    const r = parsePage(dom.window.document, URL, { idPattern: '([' });
    expect(r.warnings.some((w) => /failed/.test(w))).toBe(true);
  });
});

describe('titles are never field names', () => {
  it('skips a "Title | Date Submitted" header row', () => {
    const html = `<html><body><a href="#">Log Out</a>
      <ol><li>Co-Chair Dashboard</li><li>/ Details for XYZJ-26-10-9007</li></ol>
      <table><tr><th>Manuscript ID</th><th>Title</th><th>Date Submitted</th></tr>
      <tr><td>XYZJ-26-10-9007</td><td>A Made-Up Paper Title Here</td><td>01-Oct-2026</td></tr></table>
      <p>Make Recommendation</p></body></html>`;
    const dom = new JSDOM(html, { url: URL });
    const r = parsePage(dom.window.document, URL);
    expect(r.pageType).toBe('manuscript');
    expect(r.manuscript?.title ?? '').not.toMatch(/date submitted/i);
  });
});
