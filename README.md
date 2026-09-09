# E-Commerce Scraper

Crawls the [webscraper.io e-commerce test site](https://webscraper.io/test-sites/e-commerce/static)
and emits a single JSON document describing every purchasable configuration in the
catalogue, plus their combined value.

One runtime dependency, no build step, no network access in the test suite.

> [!NOTE]
> The design, fixtures, CI and decision records are in place; the modules under `src/`
> are still being implemented, so the commands below describe the intended entrypoint
> rather than a working binary today.

## Features

- **Full catalogue crawl** — walks all three subcategories and every page of pagination
  (147 Products, ~180 requests), not just the three Products linked from the home page.
- **Storage expansion** — a Product offering 128/256/512/1024 GB becomes four entries,
  each named for its configuration.
- **Polite by default** — bounded concurrency, timeouts, and retry with exponential
  backoff and jitter that honours `Retry-After`.
- **Deterministic output** — two runs over unchanged input produce byte-identical JSON,
  so a diff between runs means the source changed.
- **Complete or nothing** — if any page fails after retries, the run exits non-zero and
  writes nothing. Emitted JSON is always whole.
- **Offline tests** — the parser is verified against committed HTML fixtures; CI never
  contacts a third-party site.

## Requirements

Node.js >= 22.18. Nothing else — the entrypoint is TypeScript executed directly by
Node's native type stripping, so there is no compile step.

```bash
node --version   # v22.18.0 or later
npm ci
```

## Usage

```bash
npm start > out.json
```

Or with options:

```bash
node src/cli.ts --concurrency 4 > out.json
```

| Flag | Default | Description |
|---|---|---|
| `--concurrency <n>` | `8` | Maximum in-flight HTTP requests. |

The JSON document goes to stdout, written entry by entry as the crawl finds them;
diagnostics go to stderr, so redirecting stdout to a file is always safe. A non-zero exit
code means the document was left truncated and will not parse — never that it is complete
but wrong ([ADR-0017](docs/adr/0017-stream-the-catalogue-rather-than-assemble-it.md)).

## Output

Illustrative — entries abridged, drawn from the committed fixtures:

```json
{
  "results": [
    {
      "name": "MeMO Pad 7 128 GB",
      "description": "White, 7\", Atom 1.2GHz, 8GB, Android 4.4",
      "price": 130.99,
      "colors": ["gold", "white", "black"],
      "enabled": true
    },
    {
      "name": "MeMO Pad 7 1024 GB",
      "description": "White, 7\", Atom 1.2GHz, 8GB, Android 4.4",
      "price": 190.99,
      "colors": ["gold", "white", "black"],
      "enabled": false
    },
    {
      "name": "Samsung Galaxy",
      "description": "5 mpx. Android 5.0",
      "price": 93.99,
      "colors": ["gold", "white", "black"],
      "enabled": true
    }
  ],
  "total": 224.98
}
```

| Field | Type | Notes |
|---|---|---|
| `results[].name` | string | Product name, suffixed with the storage capacity when the Product offers one. |
| `results[].description` | string | Verbatim from the Product Page. |
| `results[].price` | number | The price of that configuration: the Product Page's stated price plus the site's storage uplift (256 adds 20, 512 adds 40, 1024 adds 60). |
| `results[].colors` | string[] \| null | Lowercased colour names, or `null` when the Product offers no colours. |
| `results[].enabled` | boolean | `false` for a storage option the site marks unselectable. |
| `total` | number | Sum of `price` across entries where `enabled` is `true`. |

A full run yields 561 entries, 423 of which are enabled and contribute to `total` (345701.52
at the time of writing).

### Deliberate deviations from the brief

Two additions, both to make the output honest rather than tidy:

- **`colors` is always present**, `null` when there are none, instead of being omitted.
  A consumer can then treat `results` as a homogeneous collection — `null` means "offers
  no colours", not "field missing, meaning unknown".
- **`enabled` exists at all.** The site presents a 1024 GB option on every laptop and
  tablet and marks it unselectable. Silently dropping 138 rows would leave a consumer no
  way to know anything was dropped; a flag lets each consumer decide.

The brief also contradicts itself on `total` — its prose says "the sum of all unique
product prices" while its example comments "sum of all prices". We sum enabled entries;
the reasoning is in [ADR-0005](docs/adr/0005-total-sums-enabled-entries.md).

## How it works

```
entry page → category links → category pages → subcategory links
                                                        │
                                     paginated Category Pages → Product URLs
                                                        │
                          parse name, description, price, colours, storage
                                                        │
                    one Result Entry per Storage Option, emitted in
                    discovery order → running total → JSON to stdout
```

Every arrow is a stream. Each stage keeps at most `--concurrency` items in flight and
hands its results downstream as they land, so a catalogue is never assembled in memory —
what is resident is a window per stage plus the set of Product URLs already visited. The
document is written the same way: `results` is opened, entries are appended as they
arrive, and a running total in integer cents closes it. The reasoning, and what it costs,
is in [ADR-0017](docs/adr/0017-stream-the-catalogue-rather-than-assemble-it.md).

The two hops to reach the subcategories are not redundant: the sidebar is contextual, so
`a.subcategory-link` matches nothing on the entry page and lists only the current
category's subcategories elsewhere. The category pages are fetched for that sidebar alone.
Their Product cards — three chosen at random per request — are deliberately *not* scraped,
since reading them would make the output nondeterministic. All 147 Products are reachable
through the three subcategories, so nothing is lost.

Pagination is read rather than probed — page 1 links the last page, so the page count is
known after one request instead of by fetching until a 404.

The selectors the scraper depends on are documented in
[ADR-0015](docs/adr/0015-crawl-methodology-and-selectors.md). They are the program's
entire contract with a site we do not control; when the scrape breaks, that page says
what we assumed.

## Design notes

| Decision | Why |
|---|---|
| [Pure core, I/O at the edge](docs/adr/0008-pure-core-io-at-the-edge.md) | Only `http.ts` and `cli.ts` touch the network or process. That seam is what lets the risky half — selectors and arithmetic — be tested without a mocking framework. |
| [Money as integer cents](docs/adr/0006-money-as-integer-cents.md) | Summing 423 floats accumulates representation error in the one field a reviewer is most likely to compare against their own run. |
| [Storage uplift applied](docs/adr/0016-apply-the-sites-storage-price-uplift.md) | The site's own JavaScript adds 20/40/60 for larger capacities, so that is what a user sees. Emitting one price for every capacity would look like a bug and understate the catalogue. The rule is copied from the site's minified bundle, which is the accepted risk — it lives in one function so one table changes when the site does. Supersedes [ADR-0002](docs/adr/0002-capture-prices-literally.md). |
| [Fail fast](docs/adr/0010-fail-fast-rather-than-emit-partial-results.md) | Partial results carrying an aggregate parse cleanly and are wrong. Output that will not parse beats output that is quietly wrong. |
| [Stream, do not assemble](docs/adr/0017-stream-the-catalogue-rather-than-assemble-it.md) | `Promise.all` over every page builds one promise per page before the first response lands, and bounding *requests* does not bound *work items*. A thousand subcategories a thousand pages deep never has to fit in memory — and `JSON.stringify` of a document that large would hit V8's string ceiling anyway. |
| [Deterministic order](docs/adr/0012-deterministic-discovery-order.md) | Sorting by name looks tidier but is not a stable key — 15 laptop names repeat across Products with different prices. |

All seventeen records live in [`docs/adr/`](docs/adr/); the vocabulary they use is defined
in [`CONTEXT.md`](CONTEXT.md).

## Development

```bash
npm test                 # node:test against committed HTML fixtures
npm run typecheck        # tsc --noEmit
npm run capture-fixtures # re-download fixtures when the site's markup changes
```

Four fixtures cover every page shape the parser handles: a laptop (storage, no colours),
a tablet (both), a phone (colours, no storage), and a paginated Category Page. When the
target site changes, `npm run capture-fixtures` re-downloads them so the markup change
lands as a reviewable diff, and the parser and its expectations are updated together.

CI runs typecheck and tests on every push and pull request. Because tests read fixtures
rather than the network, CI never depends on a third party's uptime.

## Trade-offs and future work

Scoped to fit a short exercise. Deliberately left out:

- **No caching layer.** Every run re-fetches all ~180 pages. A conditional-request cache
  keyed on `ETag` would make iteration faster and the site happier, but adds a cache
  invalidation story this exercise does not need.
- **No `robots.txt` parser.** Compliance was verified by inspection — the disallowed
  paths do not prefix ours. Pointing the crawler anywhere else requires re-checking by
  hand, which is exactly the kind of manual step a parser would remove.
- **No best-effort mode.** Fail-fast holds the invariant "if JSON parses, it is
  complete". A `--partial` flag that closed the array and wrote a total for the entries it
  did reach would break that, so it needs its own decision record rather than a quiet
  addition.
- **Deduplication still grows with the catalogue.** The streamed walk is bounded except
  for the set of Product URLs already visited — about 100 bytes each, so a gigabyte at ten
  million Products. 64-bit fingerprints, or deduping within a subcategory only, would fix
  it; neither is worth building before that set is the thing that runs out.
- **Selectors are unversioned.** A markup change surfaces as a parse failure, not as a
  wrong number, but there is no alerting — a scheduled run of the fixture capture that
  opened a PR on any diff would close that gap.
- **Single target site.** The crawl strategy is specific to this site's structure. Making
  it configurable before there is a second site would be speculative.
