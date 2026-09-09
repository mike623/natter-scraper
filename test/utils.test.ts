import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flatMapOrdered } from '../src/utils.ts';

/**
 * The helper the whole crawl streams through. What matters is the window: bounded
 * outstanding calls, source order preserved regardless of completion order, and
 * nothing left unobserved when the consumer or the source stops early (ADR-0017).
 */

/** Resolves after `n` turns of the microtask queue, so completion order can be inverted. */
async function afterTurns<T>(turns: number, value: T): Promise<T> {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
  return value;
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}

test('results follow source order, not completion order', async () => {
  const slowestFirst = [30, 20, 10];

  const values = await collect(flatMapOrdered(slowestFirst, 3, (turns) => afterTurns(turns, [turns])));

  assert.deepEqual(values, [30, 20, 10]);
});

test('each result is flattened into the stream, and empties vanish', async () => {
  const values = await collect(flatMapOrdered([1, 0, 2], 2, async (n) => Array.from({ length: n }, () => n)));

  assert.deepEqual(values, [1, 2, 2]);
});

test('no more than `limit` calls are ever outstanding', async () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  let outstanding = 0;
  let peak = 0;

  await collect(
    flatMapOrdered(items, 4, async (item) => {
      peak = Math.max(peak, ++outstanding);
      // Long enough that nothing settles while the window is still filling, so the
      // peak observed is the bound itself rather than whatever happened to be quick.
      await afterTurns(20 + (item % 5), null);
      outstanding--;
      return [item];
    }),
  );

  assert.equal(peak, 4);
});

test('the source is not drained ahead of the consumer', async () => {
  let pulled = 0;
  function* endless() {
    while (true) yield pulled++;
  }

  for await (const _value of flatMapOrdered(endless(), 4, async (n) => [n])) break;

  // ponytail: the exact number is the window depth plus the item in hand — the point
  // is that an infinite source terminates at all, which `Promise.all` cannot do.
  assert.ok(pulled <= 5, `pulled ${pulled} items from an endless source`);
});

test('a rejection propagates, and the rest of the window is not left unobserved', async () => {
  const settled: number[] = [];
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => void unhandled.push(reason);
  process.on('unhandledRejection', record);

  try {
    await assert.rejects(
      collect(
        flatMapOrdered([0, 1, 2, 3], 4, async (item) => {
          if (item === 0) throw new Error('head failed');
          await afterTurns(3, null);
          settled.push(item);
          throw new Error(`sibling ${item} failed too`);
        }),
      ),
      /head failed/,
      'the first failure is the one reported, not whichever rejected last',
    );

    await afterTurns(10, null);
    assert.deepEqual(settled, [1, 2, 3], 'siblings were already in flight and still settle');
    assert.deepEqual(unhandled, [], 'their rejections are adopted rather than crashing the process');
  } finally {
    process.off('unhandledRejection', record);
  }
});
