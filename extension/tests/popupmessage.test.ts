import { describe, expect, it } from 'vitest';
import { popupMessage } from '../lib/features/look';

describe('popup message', () => {
  it('counts the text in MC\'s instructions and error areas and says when E-MC hides it', () => {
    // Shaped like MC's Create Account On The Fly popup; text is made up.
    document.body.innerHTML = `<table><tr data-emc-hide="header" style="display:none">
        <td><img src="/images/en_US/page_headers/create_account_on_the_fly.gif"></td>
        <td class="instructions">This is a test!</td></tr></table>
      <div class="error" id="MAIN_ERROR_DISPLAY_DIV" style="display: none"></div>`;
    expect(popupMessage(document)).toEqual({ instructionsChars: 15, errorChars: 0, errorShown: false, hidden: true });
    document.querySelector('tr')!.removeAttribute('style');
    const err = document.getElementById('MAIN_ERROR_DISPLAY_DIV')!;
    err.textContent = 'Test error';
    err.style.display = 'block';
    expect(popupMessage(document)).toEqual({ instructionsChars: 15, errorChars: 10, errorShown: true, hidden: false });
  });
});
