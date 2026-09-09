# Crawl the full category tree

The brief says to "fetch the main page and follow all available product links", which
could mean only the three Products linked from the home page. We crawl the whole
category tree instead — every subcategory, every page of pagination, all 147 Products —
because the colour and storage requirements only become meaningful across the full
catalogue, and a three-item output would not exercise them.

## Consequences

A run makes roughly 180 requests instead of 4, which is what makes
[ADR-0009](./0009-bounded-concurrency-with-retry.md) necessary.
