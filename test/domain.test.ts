import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogueTotalCents,
  centsToNumber,
  parsePriceToCents,
  storageSurchargeCents,
  toResultEntries,
  type ScrapedProduct,
} from "../src/domain.ts";

/**
 * The rules that decide what the output means live here, so they are provable
 * without HTML, a network or a mocking framework (ADR-0008).
 */

const laptop: ScrapedProduct = {
  name: "Dell Latitude 5580",
  description: "15.6\", i5",
  priceCents: 117819,
  colors: null,
  storageOptions: [
    { sizeGb: 128, enabled: true },
    { sizeGb: 256, enabled: true },
    { sizeGb: 1024, enabled: false },
  ],
};

const phone: ScrapedProduct = {
  name: "Samsung Galaxy",
  description: "5 mpx",
  priceCents: 9399,
  colors: ["gold", "white", "black"],
  storageOptions: [],
};

test("a displayed price becomes integer cents without passing through a float", () => {
  assert.equal(parsePriceToCents("$1178.19"), 117819);
  assert.equal(parsePriceToCents("1178.19"), 117819);
  assert.equal(parsePriceToCents("$1,178.19"), 117819);
  assert.equal(parsePriceToCents(" $1170.1 "), 117010, "one decimal place is tenths, not hundredths");
  assert.equal(parsePriceToCents("$93"), 9300);
});

test("an unrecognised price is refused rather than guessed at", () => {
  assert.throws(() => parsePriceToCents("free"), /Unrecognised price/);
  assert.throws(() => parsePriceToCents("$12.345"), /Unrecognised price/);
  assert.throws(() => parsePriceToCents(""), /Unrecognised price/);
});

test("the site's own storage uplift is applied, and nothing else is", () => {
  // The numbers in `app.js`: 256 adds 20, 512 adds 40, 1024 adds 60 (ADR-0016).
  assert.equal(storageSurchargeCents(256), 2_000);
  assert.equal(storageSurchargeCents(512), 4_000);
  assert.equal(storageSurchargeCents(1024), 6_000);
  assert.equal(storageSurchargeCents(128), 0, "the base size is the stated price");
  assert.equal(storageSurchargeCents(64), 0, "a size the site does not uplift stays at base, as its switch does");
});

test("a Product with Storage Options yields one Result Entry per option, each priced for its size", () => {
  assert.deepEqual(toResultEntries(laptop), [
    { name: "Dell Latitude 5580 128 GB", description: laptop.description, priceCents: 117819, colors: null, enabled: true },
    { name: "Dell Latitude 5580 256 GB", description: laptop.description, priceCents: 119819, colors: null, enabled: true },
    { name: "Dell Latitude 5580 1024 GB", description: laptop.description, priceCents: 123819, colors: null, enabled: false },
  ]);
});

test("Storage Options are emitted ascending regardless of document order", () => {
  const scrambled: ScrapedProduct = {
    ...laptop,
    storageOptions: [
      { sizeGb: 256, enabled: true },
      { sizeGb: 128, enabled: true },
    ],
  };

  assert.deepEqual(
    toResultEntries(scrambled).map((entry) => entry.name),
    ["Dell Latitude 5580 128 GB", "Dell Latitude 5580 256 GB"],
  );
});

test("a Product without Storage Options yields exactly one Result Entry, name unchanged", () => {
  assert.deepEqual(toResultEntries(phone), [
    { name: "Samsung Galaxy", description: phone.description, priceCents: 9399, colors: ["gold", "white", "black"], enabled: true },
  ]);
});

test("Catalogue Total sums Enabled entries only", () => {
  const entries = [...toResultEntries(laptop), ...toResultEntries(phone)];

  // The disabled 1024 GB entry is excluded (ADR-0005).
  assert.equal(catalogueTotalCents(entries), 117819 + 119819 + 9399);
});

test("Catalogue Total of nothing is zero", () => {
  assert.equal(catalogueTotalCents([]), 0);
});

test("cents reach the output as a decimal number, exactly", () => {
  assert.equal(centsToNumber(117819), 1178.19);
  assert.equal(centsToNumber(9300), 93);
  assert.equal(centsToNumber(0), 0);
});
