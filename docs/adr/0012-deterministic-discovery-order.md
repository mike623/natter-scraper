# Output order follows discovery, not completion

Concurrent fetches complete in arbitrary order, so each URL carries its discovery index
and Result Entries are placed by that index: categories in navigation order, Products in
Category Page order, Storage Options ascending. Two runs of unchanged input produce
byte-identical output, so a diff between runs means something changed at the source.

## Considered Options

Sorting by name looks tidier but is not a stable key — 15 laptop names repeat across
different Products with different prices, so ties would resolve arbitrarily and
reintroduce the nondeterminism.
