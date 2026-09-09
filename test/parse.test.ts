import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseCategoryLinks,
  parseLastPage,
  parseProductLinks,
  parseProductPage,
  parseSubcategoryLinks,
} from "../src/parse.ts";

/**
 * Fixtures are real pages captured by `npm run capture-fixtures`. Between them
 * they cover every combination of colour dropdown and storage swatches the site
 * produces. See ADR-0011.
 */
function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

const laptop = fixture("product-laptop.html");
const tablet = fixture("product-tablet.html");
const phone = fixture("product-phone.html");
const listing = fixture("listing-laptops.html");

const LAPTOP_DESCRIPTION = '15.6", AMD E2-3800 1.3GHz, 4GB, 500GB, Windows 8.1';

test("the top nav yields every category", () => {
  assert.deepEqual(parseCategoryLinks(listing), [
    "/test-sites/e-commerce/static/computers",
    "/test-sites/e-commerce/static/phones",
  ]);
});

test("a page yields only the subcategories of the category it is in", () => {
  // Two, not three: touch phones live under /phones and are invisible from here.
  // This is the contextual sidebar that forces the two-hop walk (ADR-0015).
  assert.deepEqual(parseSubcategoryLinks(listing), [
    "/test-sites/e-commerce/static/computers/laptops",
    "/test-sites/e-commerce/static/computers/tablets",
  ]);
});

test("a Category Page yields its Product links in document order", () => {
  const links = parseProductLinks(listing);

  assert.equal(links.length, 6);
  assert.equal(links[0], "/test-sites/e-commerce/static/product/31");
  assert.ok(links.every((link) => link.includes("/product/")));
});

test("the last page is read from pagination rather than probed", () => {
  assert.equal(parseLastPage(listing), 20);
});

test("a page without pagination is a single page", () => {
  assert.equal(parseLastPage("<html><body>no pagination here</body></html>"), 1);
});

test("a laptop yields one entry per Storage Option, priced with the site's uplift", () => {
  const entries = parseProductPage(laptop, "product-laptop.html");

  assert.deepEqual(entries, [
    { name: "Packard 255 G2 128 GB", description: LAPTOP_DESCRIPTION, priceCents: 41699, colors: null, enabled: true },
    { name: "Packard 255 G2 256 GB", description: LAPTOP_DESCRIPTION, priceCents: 43699, colors: null, enabled: true },
    { name: "Packard 255 G2 512 GB", description: LAPTOP_DESCRIPTION, priceCents: 45699, colors: null, enabled: true },
    { name: "Packard 255 G2 1024 GB", description: LAPTOP_DESCRIPTION, priceCents: 47699, colors: null, enabled: false },
  ]);
});

test("a tablet carries its colours onto every Storage Option entry", () => {
  const entries = parseProductPage(tablet, "product-tablet.html");

  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((entry) => entry.priceCents),
    [13099, 15099, 17099, 19099],
  );
  assert.ok(entries.every((entry) => entry.name.startsWith("MeMO Pad 7 ")));
  assert.ok(entries.every((entry) => JSON.stringify(entry.colors) === JSON.stringify(["gold", "white", "black"])));
});

test("a phone without Storage Options yields exactly one entry, name and price untouched", () => {
  assert.deepEqual(parseProductPage(phone, "product-phone.html"), [
    {
      name: "Samsung Galaxy",
      description: "5 mpx. Android 5.0",
      priceCents: 9399,
      colors: ["gold", "white", "black"],
      enabled: true,
    },
  ]);
});

test("the colour placeholder option is never treated as a colour", () => {
  const colors = parseProductPage(phone, "product-phone.html")[0]?.colors ?? [];

  assert.ok(!colors.includes(""));
  assert.ok(!colors.some((color) => color.includes("select")));
});

test("a Product Page missing a required field fails loudly and names its source", () => {
  assert.throws(
    () => parseProductPage("<html><body></body></html>", "somewhere.html"),
    /somewhere\.html/,
  );
});

test("a storage swatch the parser cannot read fails loudly and names its source", () => {
  const html = '<div class="swatches"><button class="swatch" value="lots">x</button></div>';

  assert.throws(() => parseProductPage(laptop.replace("</body>", `${html}</body>`), "somewhere.html"), /somewhere\.html/);
});
