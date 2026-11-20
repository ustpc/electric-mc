// Whether MC is showing an element: MC's pages carry hidden copies of some
// forms (another task's choices and Submit), which must never be taken for
// the one on screen. Works without layout (jsdom), from the hidden attribute
// and computed display and visibility up the tree.

export function isShown(el: Element | null): boolean {
  const view = el?.ownerDocument.defaultView;
  for (let e = el; e; e = e.parentElement) {
    if ((e as HTMLElement).hidden) return false;
    if (e instanceof HTMLInputElement && e.type === 'hidden') return false;
    const cs = view?.getComputedStyle(e);
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
  }
  return !!el;
}
