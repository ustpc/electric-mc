// Serial queues for the background worker's storage writes. Each
// read-modify-write runs only after the previous one in its queue has
// finished, so concurrent tabs can't drop each other's entries. A task must
// never wait for another task in its own queue: it would wait forever. That
// happened in 0.0.33–0.0.35, when writing "roles learned" to the log from
// inside the data queue hung every later write; while the live log kept
// the worker awake, nothing cleared it. The log now has a queue of its own.

export type Queue = <T>(fn: () => Promise<T>) => Promise<T>;

export function makeQueue(): Queue {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
}
