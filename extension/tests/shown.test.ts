// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isShown } from '../lib/shown';

afterEach(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

describe('isShown', () => {
  it('without checkVisibility, reads hidden, display and visibility up the tree', () => {
    document.body.innerHTML = '<div id="a"><input id="v"></div><div style="display:none"><input id="d"></div><div hidden><input id="h"></div><div style="visibility:hidden"><input id="s"></div><input type="hidden" id="t">';
    const s = (id: string) => isShown(document.getElementById(id));
    expect([s('v'), s('d'), s('h'), s('s'), s('t'), isShown(null)]).toEqual([true, false, false, false, false, false]);
  });

  it("uses Chrome's checkVisibility when there is one, asking about visibility too", () => {
    const asked: unknown[] = [];
    (Element.prototype as { checkVisibility?: unknown }).checkVisibility = function (this: Element, o: unknown) {
      asked.push(o);
      return this.id === 'v';
    };
    document.body.innerHTML = '<input id="v"><input id="x">';
    expect([isShown(document.getElementById('v')), isShown(document.getElementById('x'))]).toEqual([true, false]);
    expect(asked[0]).toEqual({ visibilityProperty: true });
  });
});
