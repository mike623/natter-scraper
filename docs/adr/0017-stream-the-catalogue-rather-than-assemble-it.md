# Stream the catalogue rather than assemble it

The crawl is an async generator of Result Entries, and the CLI writes each one as it
arrives. No stage holds a list of everything the stage below it produced.

The previous shape was three phases of `await Promise.all(xs.map(fn))`, then a `map` into
output objects, then one `JSON.stringify` of the whole document. On the target site — 147
Products across ~180 pages — that is fine. On a catalogue of a thousand subcategories with
a thousand Category Pages each it is not, in four separate ways:

- **Fan-out is not concurrency.** `Promise.all` over a million pages builds a million
  promises and closures before the first response arrives. The pool in `http.ts` bounds
  requests *in flight*; it does nothing about the work items queued behind it, and its
  waiter queue degrades to O(n²) once that queue is long.
- **Phase barriers hold everything at once.** Every Category Page had to be fetched before
  any Product Page was, so peak memory was the whole crawl by construction.
- **The catalogue was resident three times.** Once as the link list, once as the deduping
  set, once as Result Entries, then again as output objects.
- **`JSON.stringify` has a ceiling.** V8 caps a string at about 512 MB, so a large enough
  catalogue fails at serialisation even if it fit in memory.

Resident state is now a window of `concurrency` items per stage, plus the set of Product
URLs already visited.

## Considered Options

**Yield on completion rather than in order** would remove head-of-line blocking, but
ADR-0012 requires two runs over unchanged input to produce byte-identical output, and
completion order is whichever request happened to be quickest. Ordering the window costs
nothing in fetching — the items behind a slow one are already in flight — only in when
their results are emitted.

**Keep assembling, and raise the memory limit** buys one order of magnitude for a `--max-old-space-size`
flag and an operational note. It does not survive the next order of magnitude, and it
leaves the `JSON.stringify` ceiling in place.

**Write to a temporary file and rename on success** would keep ADR-0010's "no output
unless the run completed" literally true. It also means the tool can no longer be piped,
which is most of what a CLI that emits JSON is for.

## Consequences

A failed run now writes a *truncated* document rather than nothing: entries found before
the failure have already gone to stdout. ADR-0010 asked for its own record before that
invariant changed, and this is it. What ADR-0010 exists to prevent is output that parses
cleanly and is silently wrong, and that is still impossible — the `results` array is never
closed and `total` is never written, so a partial document fails to parse. Consumers that
checked the exit code are unaffected; consumers that piped stdout into a parser still get
an error, just from the parser rather than from an empty input.

The deduping set is the one structure that still grows with the catalogue: full URLs, so
roughly 100 bytes per Product. Ten million Products would need about a gigabyte. Storing
64-bit fingerprints, or deduping within a subcategory only, would remove that ceiling —
neither is worth building before the set is what actually runs out.
