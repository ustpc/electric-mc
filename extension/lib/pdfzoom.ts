// Open MC's PDFs at a chosen zoom. Chrome's PDF viewer can't be scripted,
// and a #zoom= fragment only counts on the first load, but the viewer's zoom
// is its tab's zoom (manual, per tab), so the background sets that. The
// viewer sets its own fit-to-width zoom once the file has loaded, so for a
// few seconds after a PDF opens any zoom it sets is put back to ours; after
// that the person's own zooming is left alone. Only a per-tab zoom is ever
// changed: an origin-wide zoom would enlarge every MC page.

/** How long after a PDF opens the viewer's own zoom is overridden. */
export const PDF_ZOOM_WINDOW_MS = 4000;

export interface ZoomApi {
  setZoom(tabId: number, factor: number): Promise<void>;
  getZoomSettings(tabId: number): Promise<chrome.tabs.ZoomSettings>;
}

const perTab = (s: chrome.tabs.ZoomSettings | undefined) => s?.mode === 'manual' && s?.scope === 'per-tab';

export class PdfZoom {
  private until = new Map<number, { at: number; factor: number }>();
  constructor(
    private api: ZoomApi,
    private now: () => number = Date.now,
    private note: (event: string, data: unknown) => void = () => {},
  ) {}

  /** A PDF opened in this tab; percent is the zoom wanted (0: leave Chrome's). */
  async opened(tabId: number, percent: number): Promise<void> {
    if (!percent) return this.note('PDF opened', { pdfZoom: 0 });
    const factor = percent / 100;
    this.until.set(tabId, { at: this.now() + PDF_ZOOM_WINDOW_MS, factor });
    const s = await this.api.getZoomSettings(tabId).catch(() => undefined);
    const set = perTab(s) ? await this.api.setZoom(tabId, factor).then(() => 'set', (e: unknown) => String(e)) : 'waiting for the viewer';
    this.note('PDF opened', { pdfZoom: percent, mode: s?.mode, scope: s?.scope, set });
  }

  /** chrome.tabs.onZoomChange. */
  changed(z: { tabId: number; newZoomFactor: number; zoomSettings: chrome.tabs.ZoomSettings }): void {
    const want = this.until.get(z.tabId);
    if (!want) return;
    if (this.now() > want.at) {
      this.until.delete(z.tabId);
      return;
    }
    if (!perTab(z.zoomSettings) || Math.abs(z.newZoomFactor - want.factor) < 0.005) return;
    void this.api.setZoom(z.tabId, want.factor).then(
      () => this.note('PDF zoom set', { from: Math.round(z.newZoomFactor * 100), to: Math.round(want.factor * 100) }),
      (e: unknown) => this.note('PDF zoom failed', String(e)),
    );
  }

  closed(tabId: number): void {
    this.until.delete(tabId);
  }
}
