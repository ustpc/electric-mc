// @vitest-environment jsdom
// The developer trace: what a click and a page load record, and that typed
// text never is. Synthetic markup only.
import { describe, expect, it } from 'vitest';
import { describeClick, describePage, describeRequest, watchClicks } from '../lib/devtrace';

const PAGE = `<form><input type="hidden" name="XIK_TAGACT" value="xik_synthetic"><input type="hidden" name="CURRENT_PAGE" value="ASSOCIATE_EDITOR_DASHBOARD">
  <table><tbody><tr><th>Co-Chair Recommends</th></tr>
  <tr><td><input type="radio" name="rec" id="rej" value="4"></td><td>Reject</td></tr>
  <tr><td><textarea name="comments">secret words</textarea> <input type="text" name="q" value="typed text"></td></tr>
  <tr><td><a href="javascript:setDataAndNextPage('X')" id="submit"><img src="s.gif" alt="Submit"></a></td></tr></tbody></table></form>
  <script type="application/json">{"page":"synthetic"}</script>
  <script>PENDO_SERVICE.initializePendoMetadata({visitor: {id:"editor@example.org", role_type_name:"Co-Chair"}, account: {short_name:"xyzj"}});</script>`;

describe('describeClick', () => {
  it('records the control, its label, section and action', () => {
    document.body.innerHTML = PAGE;
    expect(describeClick(document.querySelector('#submit img'))).toEqual({
      tag: 'a', id: 'submit', label: 'Submit', section: 'Co-Chair Recommends', href: "javascript:setDataAndNextPage('X')",
    });
    const rej = document.getElementById('rej') as HTMLInputElement;
    rej.checked = true;
    expect(describeClick(rej)).toMatchObject({ tag: 'input', type: 'radio', name: 'rec', checked: true, section: 'Co-Chair Recommends' });
  });
  it('never records typed text', () => {
    document.body.innerHTML = PAGE;
    const area = describeClick(document.querySelector('textarea'))!;
    const box = describeClick(document.querySelector('input[name=q]'))!;
    expect(JSON.stringify([area, box])).not.toMatch(/secret|typed/);
    expect(area.name).toBe('comments');
  });
});

describe('describePage', () => {
  it('records the address, MC action, hidden fields and embedded JSON', () => {
    document.body.innerHTML = PAGE;
    const p = describePage(document);
    expect(p.action).toBe('xik_synthetic');
    expect(p.hidden).toEqual({ XIK_TAGACT: 'xik_synthetic', CURRENT_PAGE: 'ASSOCIATE_EDITOR_DASHBOARD' });
    expect(p.json).toEqual(['{"page":"synthetic"}']);
    expect(p.pendo).toMatch(/^initializePendoMetadata\(\{visitor: \{id:"editor@example.org", role_type_name:"Co-Chair"\}/);
  });
});

describe('watchClicks', () => {
  it('logs only while enabled', () => {
    document.body.innerHTML = PAGE;
    const seen: string[] = [];
    let on = true;
    const stop = watchClicks(document, () => on, (c) => seen.push(c.label ?? c.tag));
    document.getElementById('rej')!.click();
    on = false;
    document.getElementById('rej')!.click();
    stop();
    expect(seen).toHaveLength(1);
  });
});

describe('describeRequest', () => {
  const here = 'https://mc.manuscriptcentral.com/xyzj';
  it("records the page's scripted requests by path and parameter names only", () => {
    expect(describeRequest({ name: 'https://mc.manuscriptcentral.com/xyzj/scholaroneAJAXServlet?b=2&a=XYZJ-26-09-9011&a=3', initiatorType: 'xmlhttprequest', duration: 12.6, transferSize: 300, responseStatus: 200 }, here)).toEqual({
      kind: 'xmlhttprequest', path: '/xyzj/scholaroneAJAXServlet', params: ['a', 'b'], ms: 13, bytes: 300, status: 200,
    });
    expect(describeRequest({ name: 'https://metrics.example.org/v1/data?k=1', initiatorType: 'beacon', duration: 1 }, here)).toMatchObject({ path: 'metrics.example.org/v1/data', params: ['k'] });
  });
  it('leaves out what the page itself loads', () => {
    expect(describeRequest({ name: 'https://mc.manuscriptcentral.com/images/x.gif', initiatorType: 'img', duration: 1 }, here)).toBeNull();
    expect(describeRequest({ name: 'https://mc.manuscriptcentral.com/a.js', initiatorType: 'script', duration: 1 }, here)).toBeNull();
  });
});
