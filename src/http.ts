/**
 * The only module that touches the network (ADR-0008).
 *
 * Every request goes through a single client so the in-flight bound holds across the whole
 * crawl rather than per call site: a caller cannot accidentally exceed it by forgetting to
 * pool (ADR-0009).
 */
import { setTimeout as sleep } from 'node:timers/promises';

const TIMEOUT_MS = 10_000;
/** One attempt plus three retries (ADR-0009). */
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 8_000;
/**
 * A `Retry-After` longer than this ends the run. Honouring it would mean hanging for
 * minutes; failing is the honest outcome (ADR-0010).
 */
const MAX_RETRY_AFTER_MS = 30_000;
const USER_AGENT = 'ecommerce-scraper/1.0';

/** Fetches one URL and returns its body, or throws once the URL is beyond retrying. */
export type FetchText = (url: string) => Promise<string>;

/** Builds a client whose requests never exceed `concurrency` in flight. */
export function createClient(concurrency: number): FetchText {
  const limit = createLimiter(concurrency);
  return (url) => limit(() => fetchWithRetry(url));
}

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const lastAttempt = attempt === MAX_ATTEMPTS;
    let response: Response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      });
    } catch (cause) {
      // A network failure or timeout leaves no response to inspect, so it is always
      // worth one more attempt.
      if (lastAttempt) {
        throw new Error(`GET ${url} failed after ${MAX_ATTEMPTS} attempts`, { cause });
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) return await response.text();

    // Release the socket: nothing below reads this body.
    await response.body?.cancel();

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || lastAttempt) {
      throw new Error(`GET ${url} returned ${response.status} ${response.statusText}`);
    }

    const wait = retryAfterMs(response) ?? backoffMs(attempt);
    if (wait > MAX_RETRY_AFTER_MS) {
      throw new Error(
        `GET ${url} returned ${response.status} asking for ${Math.round(wait / 1000)}s, ` +
          `longer than this run will wait`,
      );
    }
    await sleep(wait);
  }
}

/** Exponential backoff with full jitter — spreads a thundering herd instead of aligning it. */
function backoffMs(attempt: number): number {
  return Math.random() * Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
}

/** `Retry-After` is either a delay in seconds or an HTTP date; both are in the wild. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) return undefined;

  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

/**
 * Counting semaphore. Node runs one thread, so the counter needs no lock — but a released
 * slot is handed straight to the next waiter rather than returned to the pool, because a
 * caller arriving between the release and the waiter resuming would otherwise take the
 * same slot twice.
 */
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < limit) active++;
    else await new Promise<void>((resume) => waiting.push(resume));

    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
