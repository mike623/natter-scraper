import assert from "node:assert/strict";
import { test } from "node:test";

import { crawl } from "../src/crawl.ts";
import type { FetchText } from "../src/http.ts";

/**
 * The walk itself, proved against a miniature site held in memory. The selectors
 * are `parse.ts`'s problem and the fixtures cover them; what is worth proving here
 * is the shape of the traversal: two hops to reach the subcategories, pagination
 * read rather than probed, Product Pages as the sole data source, and each URL
 * fetched exactly once (ADR-0015).
 */

const ORIGIN = "https://site.test";
const ENTRY = `${ORIGIN}/static`;

function link(className: string, href: string): string {
  return `<a class="${className}" href="${href}">x</a>`;
}

function navPage(options: { categories?: string[]; subcategories?: string[]; products?: string[]; lastPage?: number }): string {
  const { categories = [], subcategories = [], products = [], lastPage = 1 } = options;
  const pageLinks = Array.from({ length: lastPage }, (_, index) => link("page-link", `?page=${index + 1}`));

  return `<html><body>
    ${categories.map((href) => link("category-link", href)).join("")}
    ${subcategories.map((href) => link("subcategory-link", href)).join("")}
    ${products.map((href) => link("title", href)).join("")}
    ${lastPage > 1 ? pageLinks.join("") : ""}
  </body></html>`;
}

function productPage(options: { name: string; price: string; storage?: [number, boolean][]; colors?: string[] }): string {
  const { name, price, storage = [], colors = [] } = options;
  const swatches = storage
    .map(([sizeGb, enabled]) => `<button class="swatch" value="${sizeGb}"${enabled ? "" : " disabled"}>x</button>`)
    .join("");
  const colorOptions = ['<option value="">Select color</option>', ...colors.map((c) => `<option value="${c}">${c}</option>`)].join("");

  return `<html><body>
    <h4 class="title" itemprop="name">${name}</h4>
    <p class="description" itemprop="description">${name} description</p>
    <h4 itemprop="price">${price}</h4>
    ${colors.length > 0 ? `<select aria-label="color">${colorOptions}</select>` : ""}
    ${storage.length > 0 ? `<div class="swatches">${swatches}</div>` : ""}
  </body></html>`;
}

const SITE: Record<string, string> = {
  // The entry page carries categories and randomly-featured Product cards, but no
  // subcategories — the sidebar there is empty. Reading Products from it would be
  // nondeterministic, so `/static/product/99` must never be fetched.
  [ENTRY]: navPage({ categories: ["/static/computers", "/static/phones"], products: ["/static/product/99"] }),
  [`${ORIGIN}/static/computers`]: navPage({
    categories: ["/static/computers", "/static/phones"],
    subcategories: ["/static/computers/laptops", "/static/computers/tablets"],
  }),
  [`${ORIGIN}/static/phones`]: navPage({
    categories: ["/static/computers", "/static/phones"],
    subcategories: ["/static/phones/touch"],
  }),
  [`${ORIGIN}/static/computers/laptops`]: navPage({
    subcategories: ["/static/computers/laptops", "/static/computers/tablets"],
    products: ["/static/product/1", "/static/product/2"],
    lastPage: 2,
  }),
  [`${ORIGIN}/static/computers/laptops?page=2`]: navPage({ products: ["/static/product/3"], lastPage: 2 }),
  // Links product/3 again: the same Product is reachable from two Category Pages.
  [`${ORIGIN}/static/computers/tablets`]: navPage({ products: ["/static/product/3", "/static/product/4"] }),
  [`${ORIGIN}/static/phones/touch`]: navPage({ products: ["/static/product/5"] }),

  [`${ORIGIN}/static/product/1`]: productPage({
    name: "Laptop",
    price: "$100.00",
    storage: [
      [128, true],
      [256, true],
      [1024, false],
    ],
  }),
  [`${ORIGIN}/static/product/2`]: productPage({ name: "Ultrabook", price: "$10.50", colors: ["Gold", "White"] }),
  [`${ORIGIN}/static/product/3`]: productPage({ name: "Tablet", price: "$5.00", storage: [[64, true]] }),
  [`${ORIGIN}/static/product/4`]: productPage({ name: "Slate", price: "$1.00" }),
  [`${ORIGIN}/static/product/5`]: productPage({ name: "Phone", price: "$2.00", colors: ["Black"] }),
  [`${ORIGIN}/static/product/99`]: productPage({ name: "Featured", price: "$999.00" }),
};

function recordingFetcher(site: Record<string, string> = SITE) {
  const fetched: string[] = [];

  const fetchText: FetchText = async (url) => {
    fetched.push(url);
    const body = site[url];
    if (body === undefined) throw new Error(`GET ${url} returned 404 Not Found`);
    return body;
  };

  return { fetchText, fetched };
}

const OPTIONS = { concurrency: 4, endpoint: ENTRY };

test("the walk reaches every Product through the subcategories", async () => {
  const { fetchText, fetched } = recordingFetcher();

  const output = await crawl(OPTIONS, fetchText);

  assert.deepEqual(
    output.results.map((entry) => entry.name),
    [
      "Laptop 128 GB",
      "Laptop 256 GB",
      "Laptop 1024 GB",
      "Ultrabook",
      "Tablet 64 GB",
      "Slate",
      "Phone",
    ],
    "categories in navigation order, Products in Category Page order, storage ascending (ADR-0012)",
  );
  assert.ok(fetched.includes(`${ORIGIN}/static/phones/touch`), "the second hop reads each category's own sidebar");
});

test("pagination is followed, and read from page 1 rather than probed", async () => {
  const { fetchText, fetched } = recordingFetcher();

  await crawl(OPTIONS, fetchText);

  assert.ok(fetched.includes(`${ORIGIN}/static/computers/laptops?page=2`));
  assert.ok(!fetched.some((url) => url.includes("page=3")), "page 3 does not exist and is never asked for");
});

test("Products featured on navigation pages are ignored", async () => {
  const { fetchText, fetched } = recordingFetcher();

  const output = await crawl(OPTIONS, fetchText);

  assert.ok(!fetched.includes(`${ORIGIN}/static/product/99`), "the cards there are random, so reading them breaks determinism");
  assert.ok(!output.results.some((entry) => entry.name === "Featured"));
});

test("a URL reachable twice is fetched once", async () => {
  const { fetchText, fetched } = recordingFetcher();

  await crawl(OPTIONS, fetchText);

  const productThree = fetched.filter((url) => url === `${ORIGIN}/static/product/3`);
  assert.equal(productThree.length, 1, "product/3 is linked from both laptops and tablets");
  assert.equal(new Set(fetched).size, fetched.length, "no URL is fetched twice");
});

test("the total sums Enabled entries and prices are decimal numbers", async () => {
  const { fetchText } = recordingFetcher();

  const output = await crawl(OPTIONS, fetchText);

  // 100 + 120 (the disabled 1024 GB at 160 is excluded) + 10.50 + 5 + 1 + 2
  assert.equal(output.total, 238.5);
  assert.equal(output.results[0]?.price, 100, "128 GB is the stated price");
  assert.equal(output.results[1]?.price, 120, "256 GB adds the site's 20 (ADR-0016)");
  assert.equal(output.results[3]?.price, 10.5);
});

test("every Result Entry carries the same keys", async () => {
  const { fetchText } = recordingFetcher();

  const output = await crawl(OPTIONS, fetchText);

  for (const entry of output.results) {
    assert.deepEqual(Object.keys(entry).sort(), ["colors", "description", "enabled", "name", "price"]);
  }
  assert.equal(output.results[0]?.colors, null, "no colours offered is null, not a missing field (ADR-0004)");
  assert.deepEqual(output.results[3]?.colors, ["gold", "white"]);
});

test("a page that cannot be fetched aborts the run rather than emitting a partial document", async () => {
  const broken = { ...SITE };
  delete broken[`${ORIGIN}/static/product/4`];
  const { fetchText } = recordingFetcher(broken);

  await assert.rejects(crawl(OPTIONS, fetchText), /product\/4/, "partial results plus a total is silently wrong (ADR-0010)");
});
