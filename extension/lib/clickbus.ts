// One capture-phase click listener on the document, with explicit phases,
// instead of a listener per feature whose order lived in comments:
//   trace  - the developer trace sees every press, even one stopped later;
//   guard  - checks that may stop a press (no choice picked, no comment to
//            the author): a guard stops it with stopImmediatePropagation(),
//            and then nothing in a later phase, nor MC, sees it;
//   record - notes what a press that went through means (the choice
//            submitted, one-button reject's AE Submit, a PDF opened);
//   act    - follow-ups (auto-advance, clicking a radio row).
// Within a phase, handlers run in the order they were added.

export type Phase = 'trace' | 'guard' | 'record' | 'act';
const ORDER: Phase[] = ['trace', 'guard', 'record', 'act'];

export type ClickHandler = (e: MouseEvent) => void;

export interface ClickBus {
  add(phase: Phase, handler: ClickHandler): () => void;
  stop(): void;
}

/** Install the one listener on `doc`. */
export function clickBus(doc: Document): ClickBus {
  const handlers: Record<Phase, ClickHandler[]> = { trace: [], guard: [], record: [], act: [] };
  const listener = (e: MouseEvent) => {
    for (const phase of ORDER) {
      for (const h of [...handlers[phase]]) {
        try {
          h(e);
        } catch (err) {
          console.warn('[electric-mc] click handler failed', phase, err);
        }
        // A guard stopped the press: nothing after it runs.
        if (e.cancelBubble) return;
      }
    }
  };
  doc.addEventListener('click', listener, true);
  return {
    add(phase, handler) {
      handlers[phase].push(handler);
      return () => {
        handlers[phase] = handlers[phase].filter((h) => h !== handler);
      };
    },
    stop: () => doc.removeEventListener('click', listener, true),
  };
}

/** Add `handler` to the bus in `phase`, or, with no bus, as its own capture listener on `doc`. */
export function onClick(doc: Document, bus: ClickBus | undefined, phase: Phase, handler: ClickHandler): () => void {
  if (bus) return bus.add(phase, handler);
  doc.addEventListener('click', handler, true);
  return () => doc.removeEventListener('click', handler, true);
}
