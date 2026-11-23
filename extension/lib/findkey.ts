// Cmd-F (Ctrl-F off a Mac) on our own pages that have a search box goes to
// that box instead of Chrome's find bar: it is focused and its text
// selected, so typing replaces the search. Pressed again while in the box,
// Chrome's own find bar opens as usual.

/** Whether a key press is the find shortcut: Cmd-F or Ctrl-F, no other modifier. */
export function isFindKey(e: KeyboardEvent): boolean {
  return e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/** Send the find shortcut to `box()`. Returns a function that stops. */
export function trapFind(doc: Document, box: () => HTMLInputElement | null | undefined): () => void {
  const onKey = (e: KeyboardEvent) => {
    const input = box();
    if (!input || !isFindKey(e) || doc.activeElement === input) return;
    e.preventDefault();
    input.focus();
    input.select();
  };
  doc.addEventListener('keydown', onKey, true);
  return () => doc.removeEventListener('keydown', onKey, true);
}
