# Test against committed fixtures, never the network

Four real HTML pages are committed under `test/fixtures/` — covering storage-only,
storage-and-colour, colour-only, and a paginated Category Page — and the parser tests run
against those. CI never contacts webscraper.io.

## Consequences

Fixtures go stale when the site changes its markup. `npm run capture-fixtures` re-captures
them so the diff is reviewable, which is the intended maintenance path rather than a
live-network test that would make CI depend on a third party's uptime.
