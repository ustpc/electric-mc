// @vitest-environment jsdom
// Going on to the next manuscript after a recommendation. Synthetic markup
// shaped like MC's details-page navigator ("7 / 8") and queue grid.
import { beforeEach, describe, expect, it } from 'vitest';
import { directionAt, findNavBar, isRecommendationSubmit, nextInGrid, onPageLoad, watchRecommendations } from '../lib/advance';

const NAV = (k: number, n: number) => `<div><a href="#" id="prev"><img src="/images/en_US/icons/prev_mss.gif" alt="Previous Document"></a> ${k} / ${n}
  <a href="#" id="next"><img src="/images/en_US/icons/next_mss.gif" alt="Next Document"></a></div>`;
const RECOMMENDS = `<div><b>Co-Chair Recommends</b></div>
  <table><tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr><tr><td><input type="radio" name="r" id="rej"></td><td>Reject</td></tr></table>
  <a href="#" id="submit"><img src="submit.gif" alt="">Submit</a> <a href="#" id="draft">Save as Draft</a>`;
const GRID = (ids: string[]) => `<table><tr><th>Manuscript ID</th><th>Status</th><th>Take Action</th></tr>
  ${ids.map((id) => `<tr><td>${id}</td><td>AE: Not Assigned</td><td><a href="#" class="go" data-id="${id}"><img src="check.gif"></a></td></tr>`).join('')}</table>`;

const clicks: string[] = [];
function track() {
  clicks.length = 0;
  document.querySelectorAll<HTMLElement>('a').forEach((a) =>
    a.addEventListener('click', (e) => { e.preventDefault(); clicks.push(a.id || a.dataset.id || '?'); }),
  );
}

beforeEach(() => sessionStorage.clear());

describe('navigator', () => {
  it('reads "k / N" and both arrows', () => {
    document.body.innerHTML = NAV(7, 8);
    const bar = findNavBar(document)!;
    expect([bar.position, bar.total, bar.prev?.id, bar.next?.id]).toEqual([7, 8, 'prev', 'next']);
  });
  it('moves forward from the first, backward from the last, and otherwise keeps going', () => {
    expect(directionAt(1, 8, -1)).toBe(1);
    expect(directionAt(8, 8, 1)).toBe(-1);
    expect(directionAt(4, 8, -1)).toBe(-1);
    expect(directionAt(1, 1, -1)).toBe(-1);
  });
});

describe('Submit on a recommendation', () => {
  it('counts only Submit, and only with a choice made', () => {
    document.body.innerHTML = RECOMMENDS;
    const submit = document.getElementById('submit')!;
    expect(isRecommendationSubmit(submit)).toBe(false);
    (document.getElementById('rej') as HTMLInputElement).checked = true;
    expect(isRecommendationSubmit(submit)).toBe(true);
    expect(isRecommendationSubmit(document.getElementById('draft'))).toBe(false);
  });

  it('counts Commit Decision in a Co-Chair Immediate Decision box', () => {
    document.body.innerHTML = `<table><tr><td><b>Co-Chair Immediate Decision</b></td></tr><tr><td>Make a Decision</td></tr>
      <tr><td><input type="radio" name="d" id="ir"> Immediate Reject</td></tr></table>
      <a href="#" id="save"><img src="save.gif" alt="">Save</a> <a href="#" id="commit"><img src="commit.gif" alt="">Commit Decision</a>`;
    const commit = document.getElementById('commit')!;
    expect(isRecommendationSubmit(commit)).toBe(false);
    (document.getElementById('ir') as HTMLInputElement).checked = true;
    expect(isRecommendationSubmit(commit)).toBe(true);
    expect(isRecommendationSubmit(document.getElementById('save'))).toBe(false);
  });

  it('does not count Commit Decision without a Decision heading', () => {
    document.body.innerHTML = `<input type="radio" checked> <a href="#" id="commit">Commit Decision</a>`;
    expect(isRecommendationSubmit(document.getElementById('commit'))).toBe(false);
  });
});

describe('nextInGrid', () => {
  it('takes the neighbour, or the old neighbour if the manuscript left the list', () => {
    expect(nextInGrid(['A', 'B', 'C'], 'B', 1, [])).toBe('C');
    expect(nextInGrid(['A', 'B', 'C'], 'B', -1, [])).toBe('A');
    expect(nextInGrid(['A', 'C'], 'B', 1, ['A', 'B', 'C'])).toBe('C');
    expect(nextInGrid(['A', 'C'], 'B', -1, ['A', 'B', 'C'])).toBe('A');
    expect(nextInGrid(['A', 'B'], 'B', 1, [])).toBeNull();
  });
});

describe('after Submit', () => {
  it('presses the next arrow when MC comes back to the same manuscript', () => {
    document.body.innerHTML = NAV(1, 3) + RECOMMENDS;
    onPageLoad(document, 'XYZJ-26-01-9101', true); // first of 3: forward
    const stop = watchRecommendations(document, () => 'XYZJ-26-01-9101', () => true);
    (document.getElementById('acc') as HTMLInputElement).checked = true;
    document.getElementById('submit')!.click();
    stop();
    // The page reloads; MC shows the same manuscript again.
    document.body.innerHTML = NAV(1, 3);
    track();
    expect(onPageLoad(document, 'XYZJ-26-01-9101', true)).toEqual({ from: 'XYZJ-26-01-9101', to: '2 / 3', how: 'arrow' });
    expect(clicks).toEqual(['next']);
  });

  it('goes backward when we started at the last one', () => {
    document.body.innerHTML = NAV(3, 3) + RECOMMENDS;
    onPageLoad(document, 'XYZJ-26-01-9103', true);
    const stop = watchRecommendations(document, () => 'XYZJ-26-01-9103', () => true);
    (document.getElementById('rej') as HTMLInputElement).checked = true;
    document.getElementById('submit')!.click();
    stop();
    document.body.innerHTML = NAV(3, 3);
    track();
    expect(onPageLoad(document, 'XYZJ-26-01-9103', true)?.how).toBe('arrow');
    expect(clicks).toEqual(['prev']);
  });

  it('opens the next manuscript when MC goes back to the grid, even if this one left it', () => {
    document.body.innerHTML = GRID(['XYZJ-26-01-9101', 'XYZJ-26-01-9102', 'XYZJ-26-01-9103']);
    onPageLoad(document, undefined, true); // remembers the order
    document.body.innerHTML = NAV(2, 3) + RECOMMENDS;
    onPageLoad(document, 'XYZJ-26-01-9102', true);
    const stop = watchRecommendations(document, () => 'XYZJ-26-01-9102', () => true);
    (document.getElementById('rej') as HTMLInputElement).checked = true;
    document.getElementById('submit')!.click();
    stop();
    document.body.innerHTML = GRID(['XYZJ-26-01-9101', 'XYZJ-26-01-9103']);
    track();
    expect(onPageLoad(document, undefined, true)).toEqual({ from: 'XYZJ-26-01-9102', to: 'XYZJ-26-01-9103', how: 'grid' });
    expect(clicks).toEqual(['XYZJ-26-01-9103']);
  });

  it('does nothing when the setting is off, and only once', () => {
    document.body.innerHTML = NAV(1, 3) + RECOMMENDS;
    onPageLoad(document, 'XYZJ-26-01-9101', true);
    const stop = watchRecommendations(document, () => 'XYZJ-26-01-9101', () => true);
    (document.getElementById('acc') as HTMLInputElement).checked = true;
    document.getElementById('submit')!.click();
    stop();
    document.body.innerHTML = NAV(1, 3);
    track();
    expect(onPageLoad(document, 'XYZJ-26-01-9101', false)).toBeNull();
    expect(onPageLoad(document, 'XYZJ-26-01-9101', true)).toBeNull();
    expect(clicks).toEqual([]);
  });
});

describe('same task on the next manuscript', () => {
  const PAGE = (task: string) => `${NAV(1, 3)}
    <ul><li><a href="#" id="t-imm">Make Immediate Decision</a></li><li><a href="#" id="t-rec">Make Recommendation</a> (Due 25-Oct-2026)</li>
    <li><a href="#" id="t-dec">Make Decision</a> (Due 13-Nov-2026)</li></ul>
    <div class="tab">${task}</div><table><tr><td><b>Co-Chair ${task.replace('Make Immediate', 'Immediate')}</b></td></tr></table>
    <div><b>Recommendations</b></div>`;

  it('finds the task on screen, most specific first', async () => {
    const { currentTask, taskName } = await import('../lib/advance');
    expect(taskName('Make Recommendation (Due 25-Oct-2026)')).toBe('make recommendation');
    expect(taskName('View Full Abstract')).toBeNull();
    document.body.innerHTML = PAGE('Make Recommendation');
    expect(currentTask(document)).toBe('make recommendation');
    document.body.innerHTML = PAGE('Make Immediate Decision');
    expect(currentTask(document)).toBe('make immediate decision');
    document.body.innerHTML = NAV(1, 3) + '<a href="#">Make Recommendation</a><div>Manuscript Information</div>';
    expect(currentTask(document)).toBeNull();
  });

  it('opens Make Recommendation on the next manuscript after an arrow press', async () => {
    const { carryTask } = await import('../lib/advance');
    document.body.innerHTML = PAGE('Make Recommendation');
    const stop = watchRecommendations(document, () => 'XYZJ-26-01-9101', () => true);
    track();
    document.getElementById('next')!.click();
    stop();
    // The next manuscript opens on its default view.
    document.body.innerHTML = NAV(2, 3) + '<ul><li><a href="#" id="t-imm">Make Immediate Decision</a></li><li><a href="#" id="t-rec">Make Recommendation</a></li></ul><div>Manuscript Information</div>';
    track();
    expect(carryTask(document, 'XYZJ-26-01-9101')).toBeNull(); // same manuscript: wait
    expect(carryTask(document, 'XYZJ-26-01-9102')).toBe('make recommendation');
    expect(clicks).toEqual(['t-rec']);
    // Once per move.
    expect(carryTask(document, 'XYZJ-26-01-9102')).toBeNull();
  });

  it('leaves a manuscript alone that already shows the task, or lacks it', async () => {
    const { carryTask } = await import('../lib/advance');
    document.body.innerHTML = PAGE('Make Recommendation');
    let stop = watchRecommendations(document, () => 'XYZJ-26-01-9101', () => true);
    document.getElementById('next')!.click();
    stop();
    document.body.innerHTML = PAGE('Make Recommendation');
    track();
    expect(carryTask(document, 'XYZJ-26-01-9102')).toBeNull();
    expect(clicks).toEqual([]);
    document.body.innerHTML = PAGE('Make Recommendation');
    stop = watchRecommendations(document, () => 'XYZJ-26-01-9102', () => true);
    document.getElementById('next')!.click();
    stop();
    document.body.innerHTML = NAV(3, 3) + '<a href="#" id="t-imm">Make Immediate Decision</a>';
    track();
    expect(carryTask(document, 'XYZJ-26-01-9103')).toBeNull();
    expect(clicks).toEqual([]);
  });
});
