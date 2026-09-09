import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { crawlEntries, toOutputEntry } from './crawl.ts';
import { centsToNumber } from './domain.ts';
import type { FetchText } from './http.ts';

const USAGE = `Usage: node src/cli.ts [options]
  --concurrency <n>  Maximum in-flight HTTP requests (default: 8)
  --endpoint <url>   URL of the endpoint to crawl
  --help             Show this message
`;

export interface Options {
  concurrency: number;
  endpoint: string;
}

/** Parses CLI arguments. Throws on anything malformed; the caller decides how to report. */
export function parseOptions(argv: readonly string[]): Options {
  const { values } = parseArgs({
    args: argv as string[],
    options: {
      concurrency: { type: 'string', default: '8' },
      endpoint: { type: 'string', default: 'https://webscraper.io/test-sites/e-commerce/static' },
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

  return { concurrency, endpoint };
}

export class HelpRequested extends Error {}

/**
 * Writes the document as the crawl produces it, one entry at a time.
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
  options: Options,
  write: Write,
  fetchText?: FetchText,
): Promise<void> {
  let totalCents = 0;
  let empty = true;

  for await (const entry of crawlEntries(options, fetchText)) {
    if (entry.enabled) totalCents += entry.priceCents;

    const json = indented(JSON.stringify(toOutputEntry(entry), null, 2));
    await write(empty ? `{\n  "results": [\n${json}` : `,\n${json}`);
    empty = false;
  }

  const total = centsToNumber(totalCents);
  await write(empty ? `{\n  "results": [],\n  "total": ${total}\n}\n` : `\n  ],\n  "total": ${total}\n}\n`);
}

export type Write = (chunk: string) => Promise<void>;

/** One entry, indented to its place inside `results`. */
function indented(json: string): string {
  return json.replace(/^/gm, '    ');
}

/** Respects backpressure: a consumer slower than the crawl must not be buffered in memory. */
const writeStdout: Write = async (chunk) => {
  if (!process.stdout.write(chunk)) await once(process.stdout, 'drain');
};

// ponytail: no subcommands, no config file — one flag does not need a framework.
if (process.argv[1]?.endsWith('cli.ts')) {
  try {
    // Nothing else is written to stdout: the contract is one JSON document, and it
    // closes only if the run completed (ADR-0010, ADR-0017). Diagnostics go to stderr.
    await emitDocument(parseOptions(process.argv.slice(2)), writeStdout);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stderr.write(USAGE);
    } else {
      process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
      // Set rather than `process.exit`, which would discard whatever stdout has not
      // yet flushed — including the newline that ends a successful document.
      process.exitCode = 2;
    }
  }
}
