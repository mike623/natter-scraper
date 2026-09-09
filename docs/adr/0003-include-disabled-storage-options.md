# Include disabled Storage Options, flagged rather than dropped

Every laptop and tablet presents a 1024 GB Storage Option that the site marks
unselectable. We emit a Result Entry for it anyway and carry an `enabled` boolean on
every Result Entry, rather than silently dropping 138 rows.

## Considered Options

Dropping them is defensible — the brief asks for "every available product". We kept them
because a scraper that silently discards a fifth of what the page shows gives its
consumer no way to know anything was discarded, whereas a flag lets each consumer decide.

## Consequences

`results` holds 561 entries where a filtering implementation would hold 423. The `enabled`
field is an addition to the output shape the brief specifies.
