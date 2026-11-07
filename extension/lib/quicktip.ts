// Fast tooltips for the extension's own pages (matrix, team, side panel).
// Chrome waits about a second before showing a `title` tooltip and the delay
// can't be changed, so this shows the same text after a short pause instead.
// The title is moved to data-emc-tip while the pointer is over the element,
// so Chrome's own tooltip doesn't show too, and put back when it leaves.

const TIP = 'data-emc-tip';
export const TIP_DELAY_MS = 200;

export function installQuickTips(doc: Document = document, delay = TIP_DELAY_MS): () => void {
  const box = doc.createElement('div');
  box.setAttribute('role', 'tooltip');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;display:none;max-width:320px;padding:4px 8px;border-radius:4px;background:#1f2937;color:#fff;font:12px/1.35 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:pre-line;';
  doc.body.appendChild(box);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: HTMLElement | null = null;

  const hide = () => {
    clearTimeout(timer);
    box.style.display = 'none';
    if (current?.hasAttribute(TIP)) {
      current.setAttribute('title', current.getAttribute(TIP)!);
      current.removeAttribute(TIP);
    }
    current = null;
  };
  const over = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title]:not([title=""])');
    if (!el || el === current) return;
    hide();
    current = el;
    const text = el.getAttribute('title')!;
    el.setAttribute(TIP, text);
    el.removeAttribute('title');
    timer = setTimeout(() => {
      box.textContent = text;
      box.style.display = 'block';
      const r = el.getBoundingClientRect();
      const view = doc.documentElement.clientWidth;
      const w = box.offsetWidth;
      box.style.left = `${Math.max(4, Math.min(r.left, view - w - 4))}px`;
      const below = r.bottom + 6;
      box.style.top = `${below + box.offsetHeight > doc.documentElement.clientHeight ? r.top - box.offsetHeight - 6 : below}px`;
    }, delay);
  };
  const out = (e: Event) => {
    if (current && !current.contains((e as MouseEvent).relatedTarget as Node | null)) hide();
  };
  doc.addEventListener('mouseover', over);
  doc.addEventListener('mouseout', out);
  doc.addEventListener('scroll', hide, true);
  doc.addEventListener('mousedown', hide, true);
  return () => {
    hide();
    doc.removeEventListener('mouseover', over);
    doc.removeEventListener('mouseout', out);
    doc.removeEventListener('scroll', hide, true);
    doc.removeEventListener('mousedown', hide, true);
    box.remove();
  };
}
