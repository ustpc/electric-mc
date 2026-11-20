// How Electric MC marks what it adds to MC's pages: bold, in the E-MC color
// (a rich brown, the icon's background). One place, so every module draws
// the same.

export const EMC_COLOR = '#b45309';
export const EMC_STYLE = `color:${EMC_COLOR} !important;font-weight:700 !important`;

/** A short brown note at the bottom right of the page, for a few seconds. */
export function toast(doc: Document, text: string): void {
  const el = doc.createElement('div');
  el.setAttribute('data-electric-mc', 'toast');
  el.textContent = text;
  el.style.cssText = `position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;border:2px solid ${EMC_COLOR};padding:6px 10px;border-radius:6px;${EMC_STYLE}`;
  doc.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
