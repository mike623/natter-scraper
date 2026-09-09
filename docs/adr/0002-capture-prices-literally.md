# Capture prices literally

The site's own `app.js` adjusts the displayed price when a Storage Option is selected
(`256` adds 20, `512` adds 40, `1024` adds 60), so a 512 GB Result Entry arguably costs
40 more than the Product Page states. We deliberately do not apply those modifiers: the
scraper reports the Price the page states and nothing else.

## Considered Options

Replicating the modifiers was tempting because it is the site's real behaviour and makes
every Result Entry's Price distinct. We rejected it because it means emitting numbers
that appear nowhere in the fetched HTML, turning a scraper into a simulator of someone
else's client-side code — the moment that JavaScript changes, our output is silently
wrong with no way to detect it.

## Consequences

Every Result Entry derived from one Product carries the same Price. This is why
[ADR-0005](./0005-total-sums-enabled-entries.md) needs to say precisely what
Catalogue Total sums.
