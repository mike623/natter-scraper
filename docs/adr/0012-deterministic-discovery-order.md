# Output order follows discovery, not completion

Concurrent fetches complete in arbitrary order, so Result Entries are emitted in source
order rather than completion order: each stage of the walk keeps a window of outstanding
requests and yields the head of it before the items behind, however much quicker those
finished ([ADR-0017](./0017-stream-the-catalogue-rather-than-assemble-it.md)). That gives
categories in navigation order, Products in Category Page order, Storage Options
ascending. Two runs of unchanged input produce
byte-identical output, so a diff between runs means something changed at the source.

## Considered Options

Sorting by name looks tidier but is not a stable key — 15 laptop names repeat across
different Products with different prices, so ties would resolve arbitrarily and
reintroduce the nondeterminism.
