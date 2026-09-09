# TypeScript on Node 22, with no build step

Node 22.18+ strips TypeScript types natively, so `node src/cli.ts` runs the source
directly. There is no bundler, no `tsx`, and no `ts-node`; `typescript` is a dev
dependency used solely for `tsc --noEmit` checking, and `cheerio` is the only runtime
dependency.

## Consequences

`engines` requires Node >= 22.18 — on an older runtime the entrypoint fails to parse.
`tsconfig.json` sets `erasableSyntaxOnly`, so enums, namespaces and parameter properties
are compile errors rather than runtime surprises.
