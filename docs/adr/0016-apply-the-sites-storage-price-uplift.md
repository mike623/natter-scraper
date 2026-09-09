# Apply the site's storage price uplift

Supersedes [ADR-0002](./0002-capture-prices-literally.md).

The served HTML states one Price per Product, but the site's `app.js` raises the displayed
price when a Storage Option is selected:

```js
switch (e) { case "256": r = 20; break; case "512": r = 40; break; case "1024": r = 60 }
n.text("$".concat(parseFloat(this.price) + r))
```

A user looking at a 512 GB configuration sees the base price plus 40. We emit that number,
so each Result Entry carries the Price of the configuration it names rather than the Price
of the Product's default configuration.

## Considered Options

ADR-0002 took the opposite position: report only what the fetched HTML states, because
replicating the modifiers emits numbers found nowhere in the response and turns a scraper
into a simulator of someone else's client-side code. That objection stands — the rule is
copied from a minified bundle, and if the site changes it our output is wrong with nothing
in the HTML to contradict it.

We accept that risk because the alternative is worse in the more likely direction: three
entries that differ in name and are identical in price look like a bug to every consumer of
the output, and understate the catalogue's value. The mitigation is that the rule lives in
one exported function with the site's numbers written next to it, so the day the uplift
changes, one table changes.

Running the page's JavaScript in a headless browser would read the real numbers rather than
reproduce them, but costs a browser dependency and roughly 150 page renders per run for a
rule that fits in three lines.

## Consequences

`storageSurchargeCents` mirrors the site's `switch`, including its default: a size the site
does not uplift is priced at base rather than rejected. Sizes the site does not offer today
(64, 2048) therefore pass through silently at base price.

Catalogue Total rises by 8280 — 138 Products with storage, each contributing 20 for its
256 GB entry and 40 for its 512 GB entry. The 1024 GB entries are all disabled, so their
60 never counts (ADR-0005).
