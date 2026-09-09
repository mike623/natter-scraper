# Normalise Colour Option names to lowercase

The site renders `Gold`, `White`, `Black`; we emit `["gold","white","black"]`, matching the
brief's worked example. The placeholder "Select color" option is dropped.

## Consequences

This sits in tension with [ADR-0002](./0002-capture-prices-literally.md), which insists on
reporting the page verbatim. The distinction we draw: that ADR forbids *computing* values
the page never states, while case-folding a closed vocabulary of three known tokens
invents nothing.
