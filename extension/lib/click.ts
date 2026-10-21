// Click an element of MC's page as the page itself would. See
// entrypoints/page-click.content.ts for why this can't be el.click().

export const CLICK_ATTR = 'data-emc-click';
export const CLICK_EVENT = 'electric-mc:click';

export function pageClick(el: HTMLElement): void {
  const token = Math.random().toString(36).slice(2);
  el.setAttribute(CLICK_ATTR, token);
  // Dispatch is synchronous: when it returns, the page world has clicked
  // and removed the mark. A mark still there means no page-world script
  // (tests, or a page it didn't load on), so click from here.
  el.ownerDocument.dispatchEvent(new CustomEvent(CLICK_EVENT, { detail: token }));
  if (el.getAttribute(CLICK_ATTR) === token) {
    el.removeAttribute(CLICK_ATTR);
    el.click();
  }
}
