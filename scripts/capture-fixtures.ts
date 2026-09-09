/**
 * Re-captures the HTML fixtures used by the parser tests.
 *
 * Fixtures are committed so the test suite never touches the network. When the
 * target site changes its markup, run `npm run capture-fixtures`, inspect the
 * diff, and update the parser and its expectations together.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://webscraper.io/test-sites/e-commerce/static";

/**
 * One fixture per distinct page shape the parser must handle. Between them
 * these cover every combination of colour dropdown and storage swatches.
 */
const FIXTURES = [
  {
    file: "product-laptop.html",
    path: "/product/31",
    covers: "storage swatches, no colour dropdown",
  },
  {
    file: "product-tablet.html",
    path: "/product/20",
    covers: "storage swatches and colour dropdown",
  },
  {
    file: "product-phone.html",
    path: "/product/3",
    covers: "colour dropdown, no storage swatches",
  },
  {
    file: "listing-laptops.html",
    path: "/computers/laptops",
    covers: "product links and pagination links",
  },
] as const;

const FIXTURE_DIR = fileURLToPath(new URL("../test/fixtures/", import.meta.url));

async function capture(): Promise<void> {
  for (const fixture of FIXTURES) {
    const url = `${BASE_URL}${fixture.path}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status} ${response.statusText}`);
    }

    await writeFile(FIXTURE_DIR + fixture.file, await response.text(), "utf8");
    console.log(`captured ${fixture.file.padEnd(22)} ${url}  (${fixture.covers})`);
  }
}

await capture();
