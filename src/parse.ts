/**
 * HTML in, data out. The only module that knows what the target site's markup
 * looks like, and the only one that imports cheerio.
 *
 * Nothing here fetches, and nothing here interprets: values are extracted and
 * handed to `domain.ts` to be understood. That keeps this module a thin,
 * fixture-testable selector layer. The selectors themselves are documented in
 * ADR-0015 — when the site changes, that ADR and this file move together.
 */
import * as cheerio from "cheerio";
import { parsePriceToCents, toResultEntries, type ResultEntry, type StorageOption } from "./domain.ts";

/** Hrefs are returned exactly as the page states them; `crawl.ts` resolves them. */
function hrefsOf($: cheerio.CheerioAPI, selector: string): string[] {
  return $(selector)
    .toArray()
    .map((element) => $(element).attr("href"))
    .filter((href): href is string => href !== undefined);
}

function requiredText($: cheerio.CheerioAPI, selector: string, source: string): string {
  const text = $(selector).first().text().trim();

  if (text === "") {
    throw new Error(`Expected text at "${selector}" but found none (${source})`);
  }

  return text;
}

/**
 * Category links from the top nav, in document order.
 *
 * The entry page carries these and nothing else — the sidebar it renders is
 * empty — so this is the first hop of the walk (ADR-0015).
 */
export function parseCategoryLinks(html: string): string[] {
  return hrefsOf(cheerio.load(html), "a.category-link");
}

/**
 * Subcategory links from a sidebar, in document order.
 *
 * The sidebar is contextual: a category page lists only its own subcategories,
 * and the entry page lists none. Reaching all three subcategories therefore
 * means calling this once per category, not once (ADR-0015).
 */
export function parseSubcategoryLinks(html: string): string[] {
  return hrefsOf(cheerio.load(html), "a.subcategory-link");
}

/** Product Page links from a Category Page, in document order. */
export function parseProductLinks(html: string): string[] {
  return hrefsOf(cheerio.load(html), "a.title");
}

/**
 * The highest page number a Category Page links to.
 *
 * Page 1 always links the last page, so one request establishes the page count
 * — no probing until a 404. Returns 1 when the category has no pagination.
 */
export function parseLastPage(html: string): number {
  const pageNumbers = hrefsOf(cheerio.load(html), "a.page-link")
    .map((href) => /[?&]page=(\d+)/.exec(href)?.[1])
    .filter((page): page is string => page !== undefined)
    .map(Number);

  return Math.max(1, ...pageNumbers);
}

/**
 * A Product Page read into its Result Entries: one per Storage Option, or exactly
 * one when the Product offers none.
 *
 * The expansion and the pricing rule live in `domain.ts` — this function's job is
 * still only to get values out of the markup. `source` is used to make failures
 * diagnosable: with 147 pages in a run, "a price was missing" is useless without
 * knowing which page.
 */
export function parseProductPage(html: string, source: string): ResultEntry[] {
  const $ = cheerio.load(html);

  return toResultEntries({
    name: requiredText($, 'h4.title[itemprop="name"]', source),
    description: requiredText($, 'p.description[itemprop="description"]', source),
    priceCents: parsePriceToCents(requiredText($, '[itemprop="price"]', source)),
    colors: parseColors($),
    storageOptions: parseStorageOptions($, source),
  });
}

/**
 * Colour names, lowercased per ADR-0014, with the "Select color" placeholder
 * dropped. Null — not an empty array — when the Product offers no colours.
 */
function parseColors($: cheerio.CheerioAPI): readonly string[] | null {
  const dropdown = $('select[aria-label="color"]');

  if (dropdown.length === 0) {
    return null;
  }

  const colors = dropdown
    .find("option")
    .toArray()
    .map((option) => ($(option).attr("value") ?? "").trim().toLowerCase())
    .filter((color) => color !== "");

  return colors.length > 0 ? colors : null;
}

/**
 * Storage options in document order. Options the site marks `disabled` are kept
 * and flagged rather than dropped (ADR-0003); ordering is applied later, when
 * Result Entries are built.
 */
function parseStorageOptions($: cheerio.CheerioAPI, source: string): readonly StorageOption[] {
  return $(".swatches button.swatch")
    .toArray()
    .map((swatch): StorageOption => {
      const value = $(swatch).attr("value") ?? "";
      const sizeGb = Number(value);

      if (!Number.isInteger(sizeGb) || sizeGb <= 0) {
        throw new Error(`Unrecognised storage size ${JSON.stringify(value)} (${source})`);
      }

      return { sizeGb, enabled: $(swatch).attr("disabled") === undefined };
    });
}
