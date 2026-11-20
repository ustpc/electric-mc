// @vitest-environment jsdom
// The Web of Science box setting, on a synthetic box shaped like MC's.
import { afterEach, describe, expect, it } from 'vitest';
import { applyWos, findWos } from '../lib/wos';

const BOX = (open: boolean) => `
<div id="other"><table><tr><td><img id="tgl1" src="/images/common/minus.gif" onclick="toggleBranch(1)">Author's Recommended</td></tr></table></div>
<div id="wos"><table id="outer"><tbody>
  <tr><td class="detailsheaderWOSbg"><table><tbody><tr><td class="WoSpadding"><p class="pagecontents">
    <img id="tgl2" src="/images/common/${open ? 'minus' : 'plus'}.gif" onclick="toggleBranch(2)" title="${open ? 'Collapse' : 'Expand'} Table">
    <a onclick="toggleBranch(2)"><img src="/images/common/WoS_logo.png"></a></p></td><td class="WoSpadding">Search 5 Years</td></tr></tbody></table></td></tr>
  <tr id="link-row"><td><a href="https://reviewerlocator.webofscience.com/x">View full interactive search on reviewerlocator.webofscience.com</a></td></tr>
  <tr id="results"><td>Potential Reviewer Details</td></tr>
</tbody></table></div>
<div class="reviewer-suggestions-widget">Prophy</div>`;

const gone = (id: string) => document.getElementById(id)!.getAttribute('data-emc-wos') === 'gone';

/** MC's toggleBranch, enough of it: swap the sign and hide the results. */
function wireToggle() {
  const t = document.getElementById('tgl2') as HTMLImageElement;
  t.addEventListener('click', () => {
    const open = /minus/.test(t.getAttribute('src')!);
    t.setAttribute('src', `/images/common/${open ? 'plus' : 'minus'}.gif`);
    document.getElementById('results')!.hidden = open;
  });
  return t;
}

afterEach(() => {
  applyWos(document, null);
  document.body.innerHTML = '';
});

describe('Web of Science box', () => {
  it('finds the box itself, not its neighbours', () => {
    document.body.innerHTML = BOX(true);
    const w = findWos(document)!;
    expect(w.box.id).toBe('wos');
    expect(w.toggle!.id).toBe('tgl2');
    expect(w.linkLine!.id).toBe('link-row');
  });

  it('closed: presses MC\'s toggle once and drops the link line; a box opened by hand stays open', () => {
    document.body.innerHTML = BOX(true);
    const t = wireToggle();
    expect(applyWos(document, 'closed')).toEqual({ found: true, pressed: true });
    expect(t.getAttribute('src')).toContain('plus');
    expect(gone('link-row')).toBe(true);
    t.click(); // the person opens it again
    expect(applyWos(document, 'closed').pressed).toBe(false);
    expect(t.getAttribute('src')).toContain('minus');
  });

  it('open: opens a closed box and keeps the link line', () => {
    document.body.innerHTML = BOX(false);
    const t = wireToggle();
    expect(applyWos(document, 'open').pressed).toBe(true);
    expect(t.getAttribute('src')).toContain('minus');
    expect(gone('link-row')).toBe(false);
  });

  it('removed: hides the whole box only, without pressing anything', () => {
    document.body.innerHTML = BOX(true);
    expect(applyWos(document, 'removed').pressed).toBe(false);
    expect(gone('wos')).toBe(true);
    expect(document.getElementById('other')!.hasAttribute('data-emc-wos')).toBe(false);
    expect(document.documentElement.hasAttribute('data-emc-wos-on')).toBe(true);
    applyWos(document, null);
    expect(document.documentElement.hasAttribute('data-emc-wos-on') || gone('wos')).toBe(false);
  });

  it('does nothing on a page without the box', () => {
    document.body.innerHTML = '<p>No box</p>';
    expect(applyWos(document, 'closed')).toEqual({ found: false, pressed: false });
  });
});
