/**
 * The walk: entry page to categories to subcategories to Category Pages to
 * Product Pages, then expansion into Result Entries. Documented, with the
 * reasoning for each hop, in ADR-0015.
 *
 * The walk is a stream, not a list. A catalogue of a thousand subcategories a
 * thousand pages deep does not fit in memory, and holding one is not necessary:
 * every stage hands its results downstream as they land, so resident state is a
 * window of `concurrency` items per stage plus the set of Product URLs already
 * visited (ADR-0017).
 */
import { centsToNumber, type ResultEntry } from './domain.ts';
import { createClient, type FetchText } from './http.ts';
import {
  parseCategoryLinks,
  parseLastPage,
  parseProductLinks,
  parseProductPage,
  parseSubcategoryLinks,
} from './parse.ts';
import { flatMapOrdered } from './utils.ts';

/** What the walk needs to know. The CLI's `Options` adds to this; nothing here reads those. */
export type CrawlOptions = {
  concurrency: number;
  endpoint: string;
};

/** One object in the `results` array, as it appears in the emitted JSON. */
export type OutputEntry = {
  name: string;
  description: string;
  /** Decimal, e.g. 1178.19. */
  price: number;
  /** Null when the Product offers no colours, never absent (ADR-0004). */
  colors: readonly string[] | null;
  enabled: boolean;
};

/** The whole output document: entries in discovery order plus the Catalogue Total. */
export type CrawlOutput = {
  /** Discovery order, never sorted — names are not a stable key (ADR-0012). */
  results: OutputEntry[];
  /** Price summed across entries where `enabled` is true (ADR-0005). */
  total: number;
};

/**
 * Every Result Entry the catalogue yields, in discovery order, as it is found.
 *
 * Entries carry integer cents: the caller sums them and converts once per emitted
 * value, so no total is ever accumulated in a float (ADR-0006).
 *
 * `fetchText` is a parameter so the walk can be tested against a site held in
 * memory. Callers that do not care get the real, concurrency-bounded client.
 */
export async function* crawlEntries(
  options: CrawlOptions,
  fetchText: FetchText = createClient(options.concurrency),
): AsyncGenerator<ResultEntry> {
  // Invalid endpoints are rejected by `parseOptions`; if one reaches here, throwing is
  // the only honest outcome — an empty document would parse cleanly and be wrong.
  new URL(options.endpoint);

  const { concurrency } = options;

  const categories = await categoryLinksOf(fetchText, options.endpoint);

  // The second hop: each category page carries only its own subcategories, so the
  // sidebar has to be read once per category rather than once at the entry page.
  const subcategories = flatMapOrdered(categories, concurrency, (category) =>
    subcategoryLinksOf(fetchText, category),
  );

  const categoryPages = flatMapOrdered(subcategories, concurrency, (subcategory) =>
    pagesOf(fetchText, subcategory),
  );

  const productLinks = flatMapOrdered(categoryPages, concurrency, (page) =>
    productLinksOn(fetchText, page),
  );

  /**
   * A Product reachable from two Category Pages, or listed on two pages because the
   * site reordered between requests, would otherwise be fetched twice and counted
   * twice in the Catalogue Total — a wrong number in valid JSON (ADR-0010). The
   * check runs when a link is scheduled, which happens in discovery order, so the
   * first occurrence is the one that wins (ADR-0012).
   *
   * ponytail: full URLs, so this is the one structure that grows with the catalogue —
   * roughly 100 bytes per Product. At ten million Products that is a gigabyte; store
   * 64-bit fingerprints, or dedupe per subcategory only, if it ever becomes the limit.
   */
  const seen = new Set<string>();

  yield* flatMapOrdered(productLinks, concurrency, async (link) => {
    if (seen.has(link)) return [];
    seen.add(link);
    return productAt(fetchText, link);
  });
}

/**
 * The whole catalogue as one document.
 *
 * Convenient for tests and for catalogues that comfortably fit in memory. The CLI
 * does not use it: it consumes `crawlEntries` and writes each entry as it arrives,
 * which is what keeps a large catalogue from having to fit at all (ADR-0017).
 */
export async function crawl(
  options: CrawlOptions,
  fetchText: FetchText = createClient(options.concurrency),
): Promise<CrawlOutput> {
  const results: OutputEntry[] = [];
  let totalCents = 0;

  for await (const entry of crawlEntries(options, fetchText)) {
    results.push(toOutputEntry(entry));
    if (entry.enabled) totalCents += entry.priceCents;
  }

  return { results, total: centsToNumber(totalCents) };
}

/** A Result Entry in the shape the JSON states it, with cents rendered as a decimal. */
export function toOutputEntry(entry: ResultEntry): OutputEntry {
  return {
    name: entry.name,
    description: entry.description,
    price: centsToNumber(entry.priceCents),
    colors: entry.colors,
    enabled: entry.enabled,
  };
}

async function categoryLinksOf(fetchText: FetchText, page: string): Promise<string[]> {
  return parseCategoryLinks(await fetchText(page)).map(resolvedAgainst(page));
}

async function subcategoryLinksOf(fetchText: FetchText, category: string): Promise<string[]> {
  return parseSubcategoryLinks(await fetchText(category)).map(resolvedAgainst(category));
}

/**
 * One Category Page of a subcategory. Page 1 arrives with the body that was read to
 * count the pages, so establishing the page count does not cost a second fetch of it.
 */
type CategoryPage = { url: string; html: string | null };

/**
 * Every Category Page of one subcategory, in order. Page 1 links the last page, so
 * the page count is known after one request rather than by fetching until a 404.
 *
 * ponytail: the page list for one subcategory is materialised — a thousand short
 * URLs, and only `concurrency` subcategories are ever in flight. Make it lazy if a
 * subcategory ever paginates far enough for that to matter.
 */
async function pagesOf(fetchText: FetchText, subcategory: string): Promise<CategoryPage[]> {
  const html = await fetchText(subcategory);

  return [
    { url: subcategory, html },
    ...pagesAfterFirst(subcategory, parseLastPage(html)).map((url) => ({ url, html: null })),
  ];
}

/** Every Product link on one Category Page, resolved against it. */
async function productLinksOn(fetchText: FetchText, page: CategoryPage): Promise<string[]> {
  const html = page.html ?? (await fetchText(page.url));
  return parseProductLinks(html).map(resolvedAgainst(page.url));
}

/** One Product Page, already expanded into its Result Entries. */
async function productAt(fetchText: FetchText, link: string): Promise<ResultEntry[]> {
  return parseProductPage(await fetchText(link), link);
}

function pagesAfterFirst(subcategory: string, lastPage: number): string[] {
  return Array.from({ length: Math.max(0, lastPage - 1) }, (_, index) => {
    const url = new URL(subcategory);
    url.searchParams.set('page', String(index + 2));
    return url.href;
  });
}

/** Hrefs are relative to the page they were found on, not to the entry point. */
function resolvedAgainst(page: string) {
  return (href: string) => new URL(href, page).href;
}
