// @vitest-environment jsdom
// MC's Prophy "Add as reviewer (create account)" button: marked, and a press
// asks first. Synthetic markup shaped like the Prophy suggestions widget and
// MC's own Web of Science "+Add" link; no real MC data.
import { afterEach, describe, expect, it } from 'vitest';
import { clickBus } from '../lib/clickbus';
import { markProphyAdd, prophyAddButton, PROPHY_WARNING, watchProphyAdd } from '../lib/prophy';

const PAGE = `<div id="prophy">
  <button type="button" aria-label="Collapse Prophy section">-</button>
  <ul><li>Test User One
    <button type="button" id="add1" aria-label="Add as reviewer (create account)"><span id="plus">+</span>Add</button>
  </li><li>Test User Two
    <button type="button" id="add2" aria-label="Add as reviewer (create account)">+Add</button>
  </li></ul>
</div>
<div id="wos"><a href="#" id="wosadd">+Add</a></div>
<a href="#" id="newrev">+ Add New Reviewer</a>`;

const press = (id: string) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  document.getElementById(id)!.dispatchEvent(e);
  return e;
};

let stops: Array<() => void> = [];
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  document.head.innerHTML = '';
});

describe('prophyAddButton', () => {
  it('finds the Prophy create-account button from a press inside it', () => {
    document.body.innerHTML = PAGE;
    expect(prophyAddButton(document.getElementById('plus'))?.id).toBe('add1');
    expect(prophyAddButton(document.getElementById('add2'))?.id).toBe('add2');
  });

  it('leaves the Web of Science +Add, + Add New Reviewer and other buttons alone', () => {
    document.body.innerHTML = PAGE;
    expect(prophyAddButton(document.getElementById('wosadd'))).toBeNull();
    expect(prophyAddButton(document.getElementById('newrev'))).toBeNull();
    expect(prophyAddButton(document.querySelector('[aria-label="Collapse Prophy section"]'))).toBeNull();
    expect(prophyAddButton(null)).toBeNull();
  });

  it('also knows the button by its text when it has no label', () => {
    document.body.innerHTML = '<button id="b">Add as reviewer (create account)</button>';
    expect(prophyAddButton(document.getElementById('b'))?.id).toBe('b');
  });
});

describe('markProphyAdd', () => {
  it('marks each Prophy button once, with one style, and unmarks them', () => {
    document.body.innerHTML = PAGE;
    expect(markProphyAdd(document, true)).toBe(2);
    expect(document.querySelectorAll('[data-emc-prophy-add]')).toHaveLength(2);
    expect(document.getElementById('add1')!.title).toMatch(/^MC bug/);
    expect(markProphyAdd(document, true)).toBe(2);
    expect(document.querySelectorAll('#emc-prophy-style')).toHaveLength(1);
    expect(document.getElementById('wosadd')!.hasAttribute('data-emc-prophy-add')).toBe(false);
    expect(markProphyAdd(document, false)).toBe(0);
    expect(document.querySelectorAll('[data-emc-prophy-add]')).toHaveLength(0);
    expect(document.getElementById('add1')!.hasAttribute('title')).toBe(false);
    expect(document.getElementById('emc-prophy-style')).toBeNull();
  });

  it('keeps a title MC set and adds no style when there is no Prophy button', () => {
    document.body.innerHTML = '<button id="b" aria-label="Add as reviewer (create account)" title="MC title">+Add</button>';
    markProphyAdd(document, true);
    expect(document.getElementById('b')!.title).toBe('MC title');
    markProphyAdd(document, false);
    expect(document.getElementById('b')!.title).toBe('MC title');
    document.body.innerHTML = '<a href="#">+Add</a>';
    document.head.innerHTML = '';
    expect(markProphyAdd(document, true)).toBe(0);
    expect(document.getElementById('emc-prophy-style')).toBeNull();
  });
});

describe('watchProphyAdd', () => {
  it('asks before a Prophy press, and a No stops it before MC sees it', () => {
    document.body.innerHTML = PAGE;
    const asked: string[] = [];
    const logged: unknown[] = [];
    let answer = false;
    const bus = clickBus(document);
    stops.push(() => bus.stop());
    stops.push(watchProphyAdd(document, () => true, (m) => (asked.push(m), answer), (d) => logged.push(d), bus));
    let mcSaw = 0;
    document.getElementById('add1')!.addEventListener('click', () => mcSaw++);

    const no = press('plus');
    expect(asked).toEqual([PROPHY_WARNING]);
    expect(no.defaultPrevented).toBe(true);
    expect(mcSaw).toBe(0);

    answer = true;
    const yes = press('add1');
    expect(yes.defaultPrevented).toBe(false);
    expect(mcSaw).toBe(1);
    expect(logged).toEqual([{ go: false }, { go: true }]);
  });

  it('never asks for the Web of Science +Add or + Add New Reviewer, or when off', () => {
    document.body.innerHTML = PAGE;
    let asked = 0;
    let on = true;
    stops.push(watchProphyAdd(document, () => on, () => (asked++, false)));
    press('wosadd');
    press('newrev');
    expect(asked).toBe(0);
    on = false;
    expect(press('add1').defaultPrevented).toBe(false);
    expect(asked).toBe(0);
  });
});
