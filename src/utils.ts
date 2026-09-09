/**
 * Generic helpers with no knowledge of the site, the domain, or the network.
 *
 * Like `domain.ts`, this module imports nothing (ADR-0008).
 */

/**
 * `fn` applied across `source` with at most `limit` calls outstanding, flattening
 * each result and preserving source order.
 *
 * Order is preserved because ADR-0012 requires byte-identical output across runs,
 * and yielding on completion would order the document by which request happened to
 * be quickest. The cost is head-of-line blocking at the point of *emission* only:
 * a slow item delays its own results, while the items behind it are already in
 * flight.
 *
 * The window is what makes the walk streamable. `Promise.all(xs.map(fn))` builds
 * one pending promise per item up front — a million of them for a large catalogue,
 * all resident before the first response arrives, and all queued behind a
 * concurrency limiter that never sees more than a handful of them at a time
 * (ADR-0017).
 */
export async function* flatMapOrdered<T, R>(
  source: AsyncIterable<T> | Iterable<T>,
  limit: number,
  fn: (item: T) => Promise<readonly R[]>,
): AsyncGenerator<R> {
  const iterator =
    Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  const window: Promise<readonly R[]>[] = [];
  let exhausted = false;

  try {
    while (true) {
      while (!exhausted && window.length < limit) {
        const next = await iterator.next();
        if (next.done === true) {
          exhausted = true;
          break;
        }
        window.push(fn(next.value));
      }

      const head = window.shift();
      if (head === undefined) return;
      yield* await head;
    }
  } finally {
    // The head rejected, or the consumer stopped early. Either way the rest of the
    // window is still in flight and nobody is going to await it; an unobserved
    // rejection would take the process down with an error unrelated to the real one.
    for (const pending of window) pending.catch(() => {});
    await iterator.return?.();
  }
}
