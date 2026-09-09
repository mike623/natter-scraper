import assert from "node:assert/strict";
import { test } from "node:test";

import { crawl, crawlEntries } from "../src/crawl.ts";
import { ENTRY, ORIGIN, SITE, navPage, productPage, recordingFetcher } from "./site.ts";

/**
 * The walk itself, proved against a miniature site held in memory. The selectors
 * are `parse.ts`'s problem and the fixtures cover them; what is worth proving here
 * is the shape of the traversal: two hops to reach the subcategories, pagination
 * read rather than probed, Product Pages as the sole data source, each URL fetched
 * exactly once (ADR-0015), and the whole thing streamed rather than assembled
 * (ADR-0017).
 */

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

/**
 * A site far larger than the real one, to prove the walk is a stream. Twenty
 * subcategories of ten pages, five Products each: 1,000 Products across 1,202
 * pages, none of which has to be resident at once.
 */
function largeSite(subcategoryCount: number, pagesEach: number, productsPerPage: number) {
  const site: Record<string, string> = {};
  const subcategories = Array.from({ length: subcategoryCount }, (_, index) => `/static/c/s${index}`);

  site[ENTRY] = navPage({ categories: ["/static/c"] });
  site[`${ORIGIN}/static/c`] = navPage({ subcategories });

  for (const [index, subcategory] of subcategories.entries()) {
    for (let page = 1; page <= pagesEach; page++) {
      const products = Array.from({ length: productsPerPage }, (_, n) => `/static/p/${index}-${page}-${n}`);
      const url = page === 1 ? `${ORIGIN}${subcategory}` : `${ORIGIN}${subcategory}?page=${page}`;

      site[url] = navPage({ products, lastPage: pagesEach });
      for (const product of products) {
        site[`${ORIGIN}${product}`] = productPage({ name: `Product ${product}`, price: "$1.00" });
      }
    }
  }

  return site;
}

test("the first entry arrives without the catalogue being fetched first", async () => {
  const site = largeSite(20, 10, 5);
  const { fetchText, fetched } = recordingFetcher(site);

  for await (const entry of crawlEntries(OPTIONS, fetchText)) {
    assert.ok(entry.name.startsWith("Product"));
    break;
  }

  // The bound is a handful of windows deep, not a function of the catalogue: an
  // implementation that built `Promise.all` over every page would have fetched all
  // 1,202 of them before yielding anything (ADR-0017).
  assert.ok(
    fetched.length < 60,
    `expected a bounded prefix of the site, fetched ${fetched.length} of ${Object.keys(site).length} pages`,
  );
});

test("abandoning the stream stops the crawl", async () => {
  const site = largeSite(20, 10, 5);
  const { fetchText, fetched } = recordingFetcher(site);

  for await (const _entry of crawlEntries(OPTIONS, fetchText)) break;
  const atBreak = fetched.length;
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(fetched.length - atBreak < 20, "work already in flight settles; nothing new is scheduled");
});

test("the stream reaches every Product of a large catalogue", async () => {
  const { fetchText } = recordingFetcher(largeSite(20, 10, 5));

  let count = 0;
  for await (const _entry of crawlEntries(OPTIONS, fetchText)) count++;

  assert.equal(count, 1_000);
});
