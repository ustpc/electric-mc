// Whether MC is showing an element: MC's pages carry hidden copies of some
// forms (another task's choices and Submit), which must never be taken for
// the one on screen. In Chrome this is Element.checkVisibility() (Baseline
// 2024), which also sees content-visibility and every display:none ancestor;
// visibility:hidden counts as hidden too. Where it is missing (jsdom in the
// tests) the same answer comes from the hidden attribute and computed
// display and visibility up the tree.

type Checkable = Element & { checkVisibility?: (o?: { visibilityProperty?: boolean }) => boolean };

export function isShown(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  const check = (el as Checkable).checkVisibility;
  if (typeof check === 'function') return check.call(el, { visibilityProperty: true });
  const view = el.ownerDocument.defaultView;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if ((e as HTMLElement).hidden) return false;
    const cs = view?.getComputedStyle(e);
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
  }
  return true;
}
