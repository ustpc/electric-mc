import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonName, textButtons } from '../lib/textbuttons';

const btns = () => Array.from(document.querySelectorAll<HTMLElement>('[data-electric-mc="textbtn"]'));

afterEach(() => {
  textButtons(document, false);
  document.body.innerHTML = '';
});

describe('text buttons', () => {
  it('reads the button name from the image src', () => {
    expect(buttonName('/images/en_US/buttons/commit_decision.gif')).toBe('commit_decision');
    expect(buttonName('https://mc.example/images/en_US/buttons/save.gif?x=1')).toBe('save');
    expect(buttonName('/images/en_US/icons/save.gif')).toBeNull();
    expect(buttonName(null)).toBeNull();
  });

  it('adds a labelled button beside known images and leaves unknown ones', () => {
    document.body.innerHTML = `
      <a href="#"><img src="/images/en_US/buttons/save.gif"></a>
      <a href="#"><img src="/images/en_US/buttons/commit_decision.gif"></a>
      <img src="/images/en_US/buttons/create_draft_email_done.gif">`;
    expect(textButtons(document, true).buttons).toBe(2);
    expect(btns().map((b) => b.textContent)).toEqual(['Save', 'Commit Decision']);
    expect(btns()[1]?.hasAttribute('data-primary')).toBe(true);
    expect(document.documentElement.hasAttribute('data-emc-textbtn-on')).toBe(true);
    // Running again adds nothing more.
    textButtons(document, true);
    expect(btns()).toHaveLength(2);
  });

  it('passes a click on the text button to the image', () => {
    document.body.innerHTML = '<a href="#"><img src="/images/en_US/buttons/print.gif"></a>';
    const img = document.querySelector('img')!;
    const onImg = vi.fn();
    img.addEventListener('click', onImg);
    textButtons(document, true);
    btns()[0]?.click();
    expect(onImg).toHaveBeenCalledTimes(1);
  });

  it('gives the picture back when the src turns into one it does not know', async () => {
    document.body.innerHTML = '<a><img src="/images/en_US/buttons/create_draft_email.gif"></a>';
    textButtons(document, true);
    expect(btns()).toHaveLength(1);
    document.querySelector('img')!.setAttribute('src', '/images/en_US/buttons/create_draft_email_done.gif');
    await Promise.resolve();
    expect(btns()).toHaveLength(0);
    expect(document.querySelector('img')!.hasAttribute('data-emc-textbtn')).toBe(false);
  });

  it('turning it off removes the buttons', () => {
    document.body.innerHTML = '<a href="#"><img src="/images/en_US/buttons/edit.gif"></a>';
    textButtons(document, true);
    textButtons(document, false);
    expect(btns()).toHaveLength(0);
    expect(document.documentElement.hasAttribute('data-emc-textbtn-on')).toBe(false);
  });
});
