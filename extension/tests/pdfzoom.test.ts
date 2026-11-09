import { describe, expect, it, vi } from 'vitest';
import { PdfZoom, PDF_ZOOM_WINDOW_MS } from '../lib/pdfzoom';

const manual = { mode: 'manual', scope: 'per-tab' } as chrome.tabs.ZoomSettings;
const auto = { mode: 'automatic', scope: 'per-origin' } as chrome.tabs.ZoomSettings;

describe('PdfZoom', () => {
  it("puts the zoom back after the viewer's own fit, only for a few seconds", async () => {
    let t = 0;
    const api = { setZoom: vi.fn(async () => {}), getZoomSettings: vi.fn(async () => manual) };
    const z = new PdfZoom(api, () => t);
    await z.opened(7, 150);
    expect(api.setZoom).toHaveBeenLastCalledWith(7, 1.5);
    z.changed({ tabId: 7, newZoomFactor: 0.73, zoomSettings: manual });
    expect(api.setZoom).toHaveBeenCalledTimes(2);
    z.changed({ tabId: 7, newZoomFactor: 1.5, zoomSettings: manual });
    expect(api.setZoom).toHaveBeenCalledTimes(2);
    t = PDF_ZOOM_WINDOW_MS + 1;
    z.changed({ tabId: 7, newZoomFactor: 2, zoomSettings: manual });
    expect(api.setZoom).toHaveBeenCalledTimes(2);
  });

  it('never changes an origin-wide zoom, and does nothing when off', async () => {
    const api = { setZoom: vi.fn(async () => {}), getZoomSettings: vi.fn(async () => auto) };
    const z = new PdfZoom(api, () => 0);
    await z.opened(7, 150);
    z.changed({ tabId: 7, newZoomFactor: 1, zoomSettings: auto });
    expect(api.setZoom).not.toHaveBeenCalled();
    await z.opened(8, 0);
    z.changed({ tabId: 8, newZoomFactor: 0.7, zoomSettings: manual });
    expect(api.setZoom).not.toHaveBeenCalled();
  });
});
