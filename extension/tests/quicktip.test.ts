// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installQuickTips } from '../lib/quicktip';

afterEach(() => vi.useRealTimers());

describe('quick tooltips', () => {
  it('shows the title after a short pause and puts the title back on leave', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<a id="a" title="Edit their details">Pat Editor</a><p id="b">x</p>';
    const stop = installQuickTips(document, 200);
    const a = document.getElementById('a')!;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(a.hasAttribute('title')).toBe(false);
    const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tip.style.display).toBe('none');
    vi.advanceTimersByTime(200);
    expect(tip.style.display).toBe('block');
    expect(tip.textContent).toBe('Edit their details');
    a.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.getElementById('b') }));
    expect(tip.style.display).toBe('none');
    expect(a.getAttribute('title')).toBe('Edit their details');
    stop();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
