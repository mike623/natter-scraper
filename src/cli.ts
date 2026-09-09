import { parseArgs } from 'node:util';
import { crawl } from './crawl.ts';

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
  // validate endpoint by URL parse
  const parsed = new URL(endpoint);
  if(!parsed) throw new TypeError(`--endpoint must be a valid URL, got "${endpoint}"`);

  return { concurrency, endpoint };
}

export class HelpRequested extends Error {}

// ponytail: no subcommands, no config file — one flag does not need a framework.
if (process.argv[1]?.endsWith('cli.ts')) {
  try {
    const options = parseOptions(process.argv.slice(2));
    // Nothing else is written to stdout: the contract is one JSON document, and only
    // if the run completed (ADR-0010). Diagnostics go to stderr.
    process.stdout.write(`${JSON.stringify(await crawl(options), null, 2)}\n`);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stderr.write(USAGE);
      process.exit(0);
    }
    process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
}
