/**
 * The walk: entry page to categories to subcategories to Category Pages to
 * Product Pages, then expansion into the output document. Documented, with the
 * reasoning for each hop, in ADR-0015.
 */
import type { Options } from './cli.ts';
import { catalogueTotalCents, centsToNumber, type ResultEntry } from './domain.ts';
import { createClient, type FetchText } from './http.ts';
import {
  parseCategoryLinks,
  parseLastPage,
  parseProductLinks,
  parseProductPage,
  parseSubcategoryLinks,
} from './parse.ts';

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
 * `fetchText` is a parameter so the walk can be tested against a site held in
 * memory. Callers that do not care get the real, concurrency-bounded client.
 */
export async function crawl(
  options: Options,
  fetchText: FetchText = createClient(options.concurrency),
): Promise<CrawlOutput> {
  // Invalid endpoints are rejected by `parseOptions`; if one reaches here, throwing is
  // the only honest outcome — an empty document would parse cleanly and be wrong.
  new URL(options.endpoint);

  const categories = await categoryLinksOf(fetchText, options.endpoint);

  // The second hop: each category page carries only its own subcategories, so the
  // sidebar has to be read once per category rather than once at the entry page.
  const subcategoriesPromise = categories.map((page) => subcategoryLinksOf(fetchText, page));
  const subcategories = (await Promise.all(subcategoriesPromise)).flat();

  const productLinksPromise = subcategories.map((page) => productLinksIn(fetchText, page));
  const productLinks = unique((await Promise.all(productLinksPromise)).flat());

  const entries = (await Promise.all(productLinks.map((link) => productAt(fetchText, link)))).flat();

  return {
    results: entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      price: centsToNumber(entry.priceCents),
      colors: entry.colors,
      enabled: entry.enabled,
    })),
    total: centsToNumber(catalogueTotalCents(entries)),
  };
}

async function categoryLinksOf(fetchText: FetchText, page: string): Promise<string[]> {
  return parseCategoryLinks(await fetchText(page)).map(resolvedAgainst(page));
}

async function subcategoryLinksOf(fetchText: FetchText, category: string): Promise<string[]> {
  return parseSubcategoryLinks(await fetchText(category)).map(resolvedAgainst(category));
}

/**
 * Every Product link in one subcategory, its pages in order. Page 1 links the last
 * page, so the page count is known after one request rather than by fetching until
 * a 404 — and page 1 is not fetched a second time as `?page=1`.
 */
async function productLinksIn(fetchText: FetchText, subcategory: string): Promise<string[]> {
  const firstPage = await fetchText(subcategory);
  const laterUrls = pagesAfterFirst(subcategory, parseLastPage(firstPage));
  const pages = [
    { url: subcategory, html: firstPage },
    ...(await Promise.all(laterUrls.map(async (url) => ({ url, html: await fetchText(url) })))),
  ];

  return pages.flatMap(({ url, html }) => parseProductLinks(html).map(resolvedAgainst(url)));
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

/**
 * A Product reachable from two Category Pages, or listed on two pages because the
 * site reordered between requests, would otherwise be fetched twice and counted
 * twice in the Catalogue Total — a wrong number in valid JSON (ADR-0010). First
 * occurrence wins, so discovery order survives (ADR-0012).
 */
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
