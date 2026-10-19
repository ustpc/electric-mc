// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { findSearchForm, openManuscript, singleResultAction, takePending } from '../lib/search';

// Synthetic markup shaped like MC's breadcrumb bar and search bar (2026-10-18).
const BAR = `
  <div class="breadcrumb-bar"><ol class="breadcrumb"><li>Co-Chair Dashboard</li><li>Search Results</li></ol>
    <a class="btn" href="#" id="toggle"><i class="fa fa-plus"></i> Search</a></div>
  <form id="f" onsubmit="return false"><div class="search-bar">
    <div class="dropdown"><button type="button" class="btn dropdown-toggle" data-toggle="dropdown">Title</button>
      <ul class="dropdown-menu"><li><a href="#" id="by-id">Manuscript ID</a></li><li><a href="#">Title</a></li></ul></div>
    <input type="text" id="q"><button type="button" class="btn" id="go"><i class="fa fa-search"></i> Search</button>
  </div></form>`;

const RESULTS = (ids: string[]) => `<table>
  <tr><td>Manuscript ID</td><td>Manuscript Title</td><td rowspan="2">Date Submitted</td><td rowspan="2">Status</td><td rowspan="2">Take Action</td></tr>
  <tr><td>Manuscript Type</td><td>Submitting Author</td></tr>
  ${ids.map((id) => `<tr><td>${id}</td><td>A title</td><td rowspan="2">13-Oct-2026</td><td rowspan="2">AE: Not Assigned</td>
     <td rowspan="2"><a href="#" class="act" data-id="${id}"><img src="/check_off.gif"></a></td></tr>
     <tr><td>Opinion</td><td>Author, Test</td></tr>`).join('')}
</table>`;

beforeEach(() => {
  sessionStorage.clear();
});

describe('MC search', () => {
  it('finds the search box, not the breadcrumb toggle', () => {
    document.body.innerHTML = BAR;
    const f = findSearchForm(document)!;
    expect(f.input.id).toBe('q');
    expect(f.button.id).toBe('go');
  });

  it('chooses Manuscript ID, types the ID, presses Search and remembers it', () => {
    document.body.innerHTML = BAR;
    const clicks: string[] = [];
    document.getElementById('by-id')!.addEventListener('click', () => clicks.push('by-id'));
    document.getElementById('go')!.addEventListener('click', () => clicks.push('go'));
    expect(openManuscript(document, 'TEST-26-09-9005.R1')).toBe(true);
    expect((document.getElementById('q') as HTMLInputElement).value).toBe('TEST-26-09-9005.R1');
    expect(clicks).toEqual(['by-id', 'go']);
    expect(takePending(document)).toBe('TEST-26-09-9005.R1');
    expect(takePending(document)).toBeNull();
  });

  it('acts only on a single result', () => {
    document.body.innerHTML = RESULTS(['TEST-26-09-9005.R1']);
    const hit = singleResultAction(document)!;
    expect(hit.id).toBe('TEST-26-09-9005.R1');
    expect(hit.action.getAttribute('data-id')).toBe('TEST-26-09-9005.R1');
    document.body.innerHTML = RESULTS(['TEST-26-09-9005.R1', 'TEST-26-10-9007']);
    expect(singleResultAction(document)).toBeNull();
  });

  it('ignores the Search Criteria line that quotes the ID above the header', () => {
    document.body.innerHTML = RESULTS(['TEST-26-10-9009']).replace(
      '<table>',
      '<table><tr><td colspan="5">Search Criteria: Manuscript ID = "TEST-26-10-9009"</td></tr>',
    );
    expect(singleResultAction(document)?.action.getAttribute('data-id')).toBe('TEST-26-10-9009');
  });

  it('acts on nothing in a real-shaped queue of many', () => {
    const html = readFileSync(join(__dirname, 'fixtures', 'queue-status-tables.html'), 'utf8');
    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html>/, '').replace(/<\/html>\s*$/, '');
    expect(singleResultAction(document)).toBeNull();
  });
});
