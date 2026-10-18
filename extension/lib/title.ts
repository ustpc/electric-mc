// Page titles. Manuscript Central gives most pages the same <title>, so the
// history list and the long-press Back menu are a column of identical
// entries. We rewrite the title from the parse result so each entry says
// where it was.

import type { ParseResult } from '../parsers/types';
import { truncate } from './text';


export function titleFor(r: ParseResult): string | null {
  const parts: string[] = [];
  switch (r.pageType) {
    case 'login':
      parts.push('Log in');
      break;
    case 'main-menu':
      parts.push('Main menu');
      break;
    case 'role-center': {
      parts.push(shortCenter(r.heading ?? r.context ?? 'Center'));
      break;
    }
    case 'queue-list': {
      const ctx = r.context ? shortCenter(r.context) : null;
      const queue = r.breadcrumb[1] ?? (r.heading && r.heading !== r.context ? r.heading : null);
      if (ctx) parts.push(ctx);
      if (queue) parts.push(truncate(queue, 40));
      parts.push(`${r.rows?.length ?? 0} manuscripts`);
      break;
    }
    case 'manuscript':
    case 'popup': {
      const m = r.manuscript;
      if (!m) return r.pageType === 'popup' ? null : 'Manuscript';
      parts.push(m.id);
      if (m.title) parts.push(truncate(m.title, 50));
      if (r.pageType === 'popup' && r.heading) parts.push(truncate(r.heading, 30));
      break;
    }
    default:
      return null;
  }
  return parts.join(' · ');
}

function shortCenter(s: string): string {
  return s.replace(/\bAssociate Editor\b/i, 'AE').replace(/\bEditor-in-Chief\b/i, 'EiC').trim();
}

/**
 * Keep the title set. MC's own scripts sometimes reset document.title after
 * load, so a MutationObserver on <title> puts ours back.
 */
export class TitleKeeper {
  private wanted: string | null = null;
  private original: string;
  private observer: MutationObserver | null = null;

  constructor(private doc: Document, private onChange?: (from: string, to: string) => void) {
    this.original = doc.title;
  }

  set(title: string | null) {
    this.wanted = title;
    this.apply();
    if (!this.observer && title) {
      this.observer = new MutationObserver(() => this.apply());
      const head = this.doc.head ?? this.doc.documentElement;
      this.observer.observe(head, { subtree: true, childList: true, characterData: true });
    }
  }

  restore() {
    this.observer?.disconnect();
    this.observer = null;
    this.wanted = null;
    this.doc.title = this.original;
  }

  private apply() {
    if (this.wanted && this.doc.title !== this.wanted) {
      const from = this.doc.title;
      this.doc.title = this.wanted;
      this.onChange?.(from, this.wanted);
    }
  }
}
