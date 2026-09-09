# Catalogue Total sums Enabled entries only

The brief contradicts itself: its prose says "the sum of all unique product prices in the
results array" while its worked example comments "Sum of all prices in results". Because
[ADR-0002](./0002-capture-prices-literally.md) gives every Storage Option of a Product the
same Price, those readings diverge. We define Catalogue Total as the sum of Price across
Result Entries where `enabled` is true.

## Considered Options

Summing distinct price *values* was rejected outright — three separate iPhones cost
899.99 each, and collapsing them would erase real Products. Summing every entry including
disabled ones was rejected because it prices configurations the site refuses to sell.

## Consequences

Total covers 423 of the 561 entries. Changing the rule is a one-line change to a single
pure function.
