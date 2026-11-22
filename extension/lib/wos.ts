// MC's "Web of Science Reviewer Locator" box on a manuscript's Reviewer
// selection page. MC shows it open, which pushes everything under it a
// screen down. The setting (lib/messages.ts webOfScience) leaves it open,
// closes it (E-MC's default) or removes it; the "View full interactive
// search on reviewerlocator.webofscience.com" line shows only while the box
// is open, also when the person opens or closes it by hand.
//
// MC's markup: a div holding a table whose header cell
// (td.detailsheaderWOSbg) has the WoS_logo.png image and MC's own toggle,
// img#tgl<n> (minus.gif when open, plus.gif when closed) with
// onclick="toggleBranch(n)". Opening and closing presses that toggle, so MC's
// page script does it the way a click would; it only shows or hides rows.
// The setting is applied once per page and per change of setting, so a box
// the person opens again by hand stays open.

export type WosMode = 'open' | 'closed' | 'removed';

const MARK = 'data-emc-wos';
const ON = 'data-emc-wos-on';
const APPLIED = 'data-emc-wos-applied';
const WATCHED = 'data-emc-wos-watched';
const STYLE_ID = 'emc-wos-style';

const CSS = `html[${ON}] [${MARK}="gone"] { display: none !important; }`;

/** The Web of Science box: its outer element, MC's toggle, and the link line. */
export function findWos(doc: Document): { box: HTMLElement; toggle: HTMLImageElement | null; linkLine: HTMLElement | null } | null {
  const logo = doc.querySelector<HTMLImageElement>('img[src*="WoS_logo"]');
  if (!logo) return null;
  const header = logo.closest<HTMLElement>('td.detailsheaderWOSbg') ?? logo.closest<HTMLElement>('table');
  if (!header) return null;
  // The div that holds this box and no other section; else the outermost
  // table around the header.
  let box: HTMLElement | null = null;
  const div = header.closest<HTMLElement>('div');
  if (div && !div.querySelector('.reviewer-suggestions-widget') && div.querySelectorAll('img[id^="tgl"]').length <= 1 && div.querySelectorAll('img[src*="WoS_logo"]').length === 1) box = div;
  if (!box) {
    let t = header.closest<HTMLElement>('table');
    while (t?.parentElement?.closest('table') && t.parentElement.closest('table')!.querySelectorAll('img[id^="tgl"]').length <= 1) t = t.parentElement.closest<HTMLElement>('table');
    box = t;
  }
  if (!box) return null;
  const toggle = box.querySelector<HTMLImageElement>('img[id^="tgl"][onclick*="toggleBranch"]');
  const link = Array.from(box.querySelectorAll<HTMLAnchorElement>('a')).find((a) => /reviewerlocator\.webofscience/i.test(`${a.getAttribute('href') ?? ''} ${a.textContent ?? ''}`));
  let linkLine: HTMLElement | null = null;
  if (link) {
    const row = link.closest<HTMLElement>('tr');
    linkLine = row && box.contains(row) && !(toggle && row.contains(toggle)) && !row.querySelector('img[src*="WoS_logo"]') ? row : link;
  }
  return { box, toggle, linkLine };
}

/** Whether MC shows the box open (its toggle is the minus sign). */
export function wosOpen(toggle: HTMLImageElement): boolean {
  // The sign image first: MC may leave the title as it was when it toggles.
  const src = toggle.getAttribute('src') ?? '';
  if (/minus|plus/i.test(src)) return /minus/i.test(src);
  return /collapse/i.test(toggle.getAttribute('title') ?? '');
}

export function applyWos(doc: Document, mode: WosMode | null): { found: boolean; pressed: boolean } {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-electric-mc', 'wos');
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  const html = doc.documentElement;
  const wos = findWos(doc);
  for (const el of Array.from(doc.querySelectorAll(`[${MARK}]`))) el.removeAttribute(MARK);
  if (!mode) {
    html.removeAttribute(ON);
    return { found: !!wos, pressed: false };
  }
  html.setAttribute(ON, '');
  if (!wos) return { found: false, pressed: false };
  if (mode === 'removed') {
    wos.box.setAttribute(MARK, 'gone');
    return { found: true, pressed: false };
  }
  let pressed = false;
  const t = wos.toggle;
  let open = t ? wosOpen(t) : mode === 'open';
  if (t && t.getAttribute(APPLIED) !== mode) {
    t.setAttribute(APPLIED, mode);
    if (open !== (mode === 'open')) {
      t.click();
      pressed = true;
      open = mode === 'open';
    }
  }
  // The link line goes while the box is closed, following MC's toggle when
  // the person opens or closes the box by hand.
  const line = wos.linkLine;
  const showLine = (isOpen: boolean) => {
    if (!line) return;
    if (isOpen) line.removeAttribute(MARK);
    else line.setAttribute(MARK, 'gone');
  };
  showLine(open);
  if (t && line && !t.hasAttribute(WATCHED)) {
    t.setAttribute(WATCHED, '');
    t.addEventListener('click', () => setTimeout(() => showLine(wosOpen(t)), 0));
  }
  return { found: true, pressed };
}
