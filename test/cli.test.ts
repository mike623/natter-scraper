import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HelpRequested, parseOptions } from '../src/cli.ts';

test('defaults concurrency to 8 and the endpoint to the target site', () => {
  assert.deepEqual(parseOptions([]), {
    concurrency: 8,
    endpoint: 'https://webscraper.io/test-sites/e-commerce/static',
  });
});

test('accepts both --concurrency 4 and --concurrency=4', () => {
  assert.equal(parseOptions(['--concurrency', '4']).concurrency, 4);
  assert.equal(parseOptions(['--concurrency=4']).concurrency, 4);
});

test('rejects non-positive, non-integer and unknown flags', () => {
  assert.throws(() => parseOptions(['--concurrency', '0']), TypeError);
  assert.throws(() => parseOptions(['--concurrency', '2.5']), TypeError);
  assert.throws(() => parseOptions(['--concurrency', 'lots']), TypeError);
  assert.throws(() => parseOptions(['--nope']));
});

test('--help is signalled, not silently ignored', () => {
  assert.throws(() => parseOptions(['--help']), HelpRequested);
});

test('rejects an endpoint that is not a URL', () => {
  assert.throws(() => parseOptions(['--endpoint', 'not a url']), TypeError);
});
