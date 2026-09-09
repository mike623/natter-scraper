import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HelpRequested, emitDocument, emitToFile, parseOptions } from '../src/cli.ts';
import { crawl } from '../src/crawl.ts';
import { ENTRY, ORIGIN, SITE, navPage, recordingFetcher } from './site.ts';

test('defaults concurrency to 8, the endpoint to the target site, and the output to a file', () => {
  assert.deepEqual(parseOptions([]), {
    concurrency: 8,
    endpoint: 'https://webscraper.io/test-sites/e-commerce/static',
    out: 'results.json',
  });
});

test('--stdout asks for the pipe, --out for a named file, and both together is refused', () => {
  assert.equal(parseOptions(['--stdout']).out, null);
  assert.equal(parseOptions(['--out', 'catalogue.json']).out, 'catalogue.json');
  assert.throws(() => parseOptions(['--stdout', '--out', 'catalogue.json']), TypeError);
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

/**
 * The document is written as the crawl produces it rather than assembled and
 * stringified (ADR-0017). What that must not change is a single byte of the
 * result, so the streamed document is compared against the assembled one.
 */
test('the streamed document is byte-identical to the assembled one', async () => {
  const { fetchText } = recordingFetcher();
  const options = { concurrency: 4, endpoint: ENTRY };

  let streamed = '';
  await emitDocument(options, async (chunk) => void (streamed += chunk), fetchText);

  assert.equal(streamed, `${JSON.stringify(await crawl(options, fetchText), null, 2)}\n`);
});

test('a catalogue with no Products still emits a complete document', async () => {
  const { fetchText } = recordingFetcher({ [ENTRY]: navPage({}) });

  let streamed = '';
  await emitDocument({ concurrency: 4, endpoint: ENTRY }, async (chunk) => void (streamed += chunk), fetchText);

  assert.deepEqual(JSON.parse(streamed), { results: [], total: 0 });
});

test('a run that fails part-way leaves output that cannot be parsed as a document', async () => {
  const broken = { ...SITE };
  delete broken[`${ORIGIN}/static/product/4`];
  const { fetchText } = recordingFetcher(broken);

  let streamed = '';
  await assert.rejects(
    emitDocument({ concurrency: 4, endpoint: ENTRY }, async (chunk) => void (streamed += chunk), fetchText),
    /product\/4/,
  );

  assert.ok(streamed.length > 0, 'entries found before the failure have already been written');
  assert.throws(() => JSON.parse(streamed), 'truncated mid-array, so it can never be mistaken for complete (ADR-0010)');
});

/**
 * The file destination can afford an atomicity a pipe cannot: the document is built
 * in a sibling `.partial` and renamed into place, so `out` is either absent or
 * complete (ADR-0017).
 */
test('the file destination writes the same document a pipe would', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'natter-'));
  const out = join(directory, 'results.json');
  const options = { concurrency: 4, endpoint: ENTRY };

  try {
    const written = await emitToFile(options, out, recordingFetcher().fetchText);

    let piped = '';
    await emitDocument(options, async (chunk) => void (piped += chunk), recordingFetcher().fetchText);

    assert.equal(written, 7);
    assert.equal(await readFile(out, 'utf8'), piped);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a run that fails part-way leaves no file at all', async () => {
  const broken = { ...SITE };
  delete broken[`${ORIGIN}/static/product/4`];
  const directory = await mkdtemp(join(tmpdir(), 'natter-'));
  const out = join(directory, 'results.json');

  try {
    await assert.rejects(
      emitToFile({ concurrency: 4, endpoint: ENTRY }, out, recordingFetcher(broken).fetchText),
      /product\/4/,
    );

    assert.deepEqual(
      await readFile(out, 'utf8').then(() => 'exists', () => 'absent'),
      'absent',
      'neither the document nor its half-written sibling survives (ADR-0010)',
    );
    assert.deepEqual(
      await readFile(`${out}.partial`, 'utf8').then(() => 'exists', () => 'absent'),
      'absent',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
