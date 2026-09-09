# Pure core, I/O at the edge

Parsing and domain logic are pure functions over strings and data; only `http.ts` and
`cli.ts` touch the network or the process. This is the seam that lets
[ADR-0011](./0011-fixture-based-tests.md) test the risky half of the program — the
selectors and the arithmetic — with no network and no mocking framework.
