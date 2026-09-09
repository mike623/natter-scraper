import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { crawlEntries, toOutputEntry, type CrawlOptions } from './crawl.ts';
import { centsToNumber } from './domain.ts';
import type { FetchText } from './http.ts';

const DEFAULT_OUT = 'results.json';

const USAGE = `Usage: node src/cli.ts [options]
  --concurrency <n>  Maximum in-flight HTTP requests (default: 8)
  --endpoint <url>   URL of the endpoint to crawl
  --out <path>       File to write the JSON document to (default: ${DEFAULT_OUT})
  --stdout           Write to stdout instead of a file, for piping
  --help             Show this message
`;

export interface Options extends CrawlOptions {
  /** Where the document goes; null means stdout. */
  out: string | null;
}

/** Parses CLI arguments. Throws on anything malformed; the caller decides how to report. */
export function parseOptions(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: argv as string[],
    options: {
      concurrency: { type: 'string', default: '8' },
      endpoint: { type: 'string', default: 'https://webscraper.io/test-sites/e-commerce/static' },
      out: { type: 'string' },
      stdout: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) throw new HelpRequested();

  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError(`--concurrency must be a positive integer, got "${values.concurrency}"`);
  }

  const endpoint = values.endpoint;
  // `new URL` throws a TypeError of its own on anything unparseable, which is the
  // error this function promises.
  new URL(endpoint);

  // Naming a file and asking for stdout are two different intentions, and guessing
  // which one was meant is worse than saying so.
  if (values.stdout && values.out !== undefined) {
    throw new TypeError('--out and --stdout ask for different destinations; pass one');
  }

  return { concurrency, endpoint, out: values.stdout ? null : (values.out ?? DEFAULT_OUT) };
}

export class HelpRequested extends Error {}

/**
 * Writes the document as the crawl produces it, one entry at a time, and returns
 * how many entries it wrote.
 *
 * The catalogue is never assembled: `results` is opened, each entry is appended as
 * it arrives, and the Catalogue Total — a running sum of integer cents, so no total
 * passes through a float (ADR-0006) — closes it. That is what lets a catalogue
 * larger than memory be emitted at all (ADR-0017).
 *
 * A run that fails part-way leaves the array unclosed and the total unwritten, so
 * the truncated output cannot be parsed and mistaken for a complete document — the
 * invariant ADR-0010 exists to hold.
 *
 * `fetchText` is a parameter for the same reason it is one on the crawl: the
 * document this writes is proved byte-identical to the assembled one against a site
 * held in memory.
 */
export async function emitDocument(
  options: CrawlOptions,
  write: Write,
  fetchText?: FetchText,
): Promise<number> {
  let totalCents = 0;
  let written = 0;

  for await (const entry of crawlEntries(options, fetchText)) {
    if (entry.enabled) totalCents += entry.priceCents;

    const json = indented(JSON.stringify(toOutputEntry(entry), null, 2));
    await write(written === 0 ? `{\n  "results": [\n${json}` : `,\n${json}`);
    written++;
  }

  const total = centsToNumber(totalCents);
  await write(
    written === 0 ? `{\n  "results": [],\n  "total": ${total}\n}\n` : `\n  ],\n  "total": ${total}\n}\n`,
  );

  return written;
}

export type Write = (chunk: string) => Promise<void>;

/** One entry, indented to its place inside `results`. */
function indented(json: string): string {
  return json.replace(/^/gm, '    ');
}

/**
 * Respects backpressure: a destination slower than the crawl must not be buffered in
 * memory, which would give back the resident catalogue ADR-0017 exists to avoid.
 */
function writeTo(stream: NodeJS.WritableStream): Write {
  return async (chunk) => {
    if (!stream.write(chunk)) await once(stream, 'drain');
  };
}

/**
 * The document, written to a sibling `.partial` file and renamed into place once the
 * run has completed.
 *
 * A file destination can afford what a pipe cannot: the rename is atomic, so `out`
 * either does not exist or is a complete document, and a failed run leaves nothing
 * behind to be mistaken for a good one. That is ADR-0010's original invariant — "if
 * JSON was emitted, it is complete" — restored for the default destination
 * (ADR-0017).
 */
export async function emitToFile(
  options: CrawlOptions,
  out: string,
  fetchText?: FetchText,
): Promise<number> {
  const partial = `${out}.partial`;
  const file = createWriteStream(partial);

  try {
    const written = await emitDocument(options, writeTo(file), fetchText);
    file.end();
    await finished(file);
    await rename(partial, out);
    return written;
  } catch (error) {
    file.destroy();
    await rm(partial, { force: true });
    throw error;
  }
}

/**
 * A reader that closed the pipe — `| head`, or a shell job killed mid-run. Normal
 * termination, not a failure to report: the usage text this would otherwise print is
 * noise, and the exit code would say the crawl broke when it did not.
 */
function isBrokenPipe(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EPIPE';
}

// ponytail: no subcommands, no config file — four flags do not need a framework.
if (process.argv[1]?.endsWith('cli.ts')) {
  try {
    const options = parseOptions(process.argv.slice(2));

    if (options.out === null) {
      // Nothing else is written to stdout: the contract is one JSON document, and it
      // closes only if the run completed (ADR-0010, ADR-0017). Diagnostics go to stderr.
      // A write that fails while nothing is awaiting `drain` surfaces here instead of
      // as a rejection. Only a broken pipe is benign — a full disk on a redirect must
      // still be loud, or stdout is silently truncated.
      process.stdout.on('error', (error) => {
        if (!isBrokenPipe(error)) throw error;
      });
      await emitDocument(options, writeTo(process.stdout));
    } else {
      const written = await emitToFile(options, options.out);
      process.stderr.write(`Wrote ${written} entries to ${options.out}\n`);
    }
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stderr.write(USAGE);
    } else if (!isBrokenPipe(error)) {
      process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
      // Set rather than `process.exit`, which would discard whatever stdout has not
      // yet flushed — including the newline that ends a successful document.
      process.exitCode = 2;
    }
  }
}
