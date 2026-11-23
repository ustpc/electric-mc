// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { boxAudience, commentBoxes, isSubmitWithChoice, pickedLabel, recommendsRole, submitControl } from '../lib/recommendform';

const FORM = (heading: string, boxes: string) => `<table><tr><td><b>${heading}</b></td></tr>
  <tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr>
  <tr><td><input type="radio" name="r" id="rej"></td><td>Reject</td></tr>
  <tr><td>${boxes}</td></tr>
  <tr><td><a href="#" id="submit">Submit</a> <a href="#" id="draft">Save as Draft</a></td></tr></table>`;

afterEach(() => (document.body.innerHTML = ''));

describe('the recommendation form', () => {
  it("knows whose form it is", () => {
    document.body.innerHTML = FORM('Co-Chair Recommends', '');
    expect(recommendsRole(document)).toBe('cc');
    document.body.innerHTML = FORM('Associate Editor Recommends', '');
    expect(recommendsRole(document)).toBe('other');
    document.body.innerHTML = '<p>Nothing here</p>';
    expect(recommendsRole(document)).toBeNull();
  });

  it('finds Submit only under a matching heading, and the picked choice', () => {
    document.body.innerHTML = FORM('Associate Editor Recommends', '');
    const submit = document.getElementById('submit')!;
    expect(submitControl(submit)).toBe(submit);
    expect(submitControl(document.getElementById('draft'))).toBeNull();
    expect(isSubmitWithChoice(submit)).toBe(false);
    expect(pickedLabel(document)).toBe('');
    (document.getElementById('rej') as HTMLInputElement).checked = true;
    expect(isSubmitWithChoice(submit)).toBe(true);
    expect(pickedLabel(document)).toBe('Reject');
    document.body.innerHTML = '<a href="#" id="s">Submit</a>';
    expect(submitControl(document.getElementById('s'))).toBeNull();
  });

  it("finds the comment boxes by MC's names, or by their labels", () => {
    document.body.innerHTML = FORM('Co-Chair Recommends', '<textarea name="T1_COMMENTS_TO_EDITOR"></textarea><textarea name="T1_COMMENTS_TO_AUTHOR"></textarea>');
    let b = commentBoxes(document);
    expect(b.toAuthor?.name).toBe('T1_COMMENTS_TO_AUTHOR');
    expect(b.toEditor?.name).toBe('T1_COMMENTS_TO_EDITOR');
    document.body.innerHTML = FORM('Co-Chair Recommends', 'Confidential comments to the editor <textarea name="a1"></textarea> Comments to the author <textarea name="a2"></textarea>');
    b = commentBoxes(document);
    expect(b.toAuthor?.name).toBe('a2');
    expect(b.toEditor?.name).toBe('a1');
    expect(boxAudience(document.createElement('textarea'))).toBeNull();
  });
});
