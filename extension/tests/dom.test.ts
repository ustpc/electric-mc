// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { freeze, labeledValues } from '../parsers/dom';

describe('labeledValues on the parser copy', () => {
  it('reads a frozen root once and hands out copies', () => {
    const root = document.createElement('div');
    root.innerHTML = '<table><tr><td>Status:</td><td>Awaiting AE</td></tr></table>';
    freeze(root);
    const a = labeledValues(root);
    expect(a.get('status')).toBe('Awaiting AE');
    a.set('status', 'changed by a caller');
    root.querySelector('td + td')!.textContent = 'changed in the page';
    expect(labeledValues(root).get('status')).toBe('Awaiting AE');
  });

  it('reads a live root afresh every time', () => {
    const root = document.createElement('div');
    root.innerHTML = '<table><tr><td>Status:</td><td>Awaiting AE</td></tr></table>';
    expect(labeledValues(root).get('status')).toBe('Awaiting AE');
    root.querySelector('td + td')!.textContent = 'Accepted';
    expect(labeledValues(root).get('status')).toBe('Accepted');
  });
});
