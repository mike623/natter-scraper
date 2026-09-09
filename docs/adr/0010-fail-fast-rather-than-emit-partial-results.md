# Fail fast rather than emit partial results

If any page cannot be fetched after retries, the run aborts with a non-zero exit code and
writes nothing to stdout. The output carries Catalogue Total, an aggregate — partial
results with an aggregate produce JSON that parses cleanly and is silently wrong, which is
worse than no output at all.

## Consequences

The invariant is: **if JSON was emitted, it is complete.** A future best-effort mode would
have to break that invariant, so it would need its own ADR rather than being added
quietly.
