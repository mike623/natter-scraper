# Bounded concurrency with retry

Requests run through a pool of 8 (overridable via `--concurrency`) with a 10s timeout and
three retries using exponential backoff with jitter, retrying network errors, 5xx and 429
while honouring `Retry-After`. 4xx responses other than 429 are not retried.

## Considered Options

Firing all ~180 requests concurrently is faster and is also how scrapers get blocked from
a free public test site. Running sequentially takes about 68 seconds and dies on the first
transient failure.
