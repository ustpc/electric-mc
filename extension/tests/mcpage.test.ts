import { describe, expect, it } from 'vitest';
import { currentPage, pageTypeOf } from '../lib/mcpage';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('MC page names', () => {
  it('reads CURRENT_PAGE from the hidden field', () => {
    expect(currentPage(doc('<form><input type="hidden" name="CURRENT_PAGE" value="ASSOCIATE_EDITOR_DASHBOARD"></form>'))).toBe('ASSOCIATE_EDITOR_DASHBOARD');
    expect(currentPage(doc('<form><input type="hidden" name="CURRENT_PAGE" value="not a name"></form>'))).toBeNull();
    expect(currentPage(doc('<p>no form</p>'))).toBeNull();
  });
  it('maps names to page types', () => {
    expect(pageTypeOf('ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS')).toBe('manuscript');
    expect(pageTypeOf('ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS')).toBe('queue-list');
    expect(pageTypeOf('ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS_SR')).toBe('queue-list');
    expect(pageTypeOf('ASSOCIATE_EDITOR_DASHBOARD')).toBe('role-center');
    expect(pageTypeOf('REVIEWER_VIEW_MANUSCRIPT_DETAILS_POPUP_RECOMM')).toBe('popup');
    expect(pageTypeOf('COGNOS_POP_UP')).toBe('popup');
    expect(pageTypeOf('LOGIN')).toBe('login');
    expect(pageTypeOf('HOME')).toBeNull();
    expect(pageTypeOf('SOMETHING_ELSE')).toBeNull();
  });
});
