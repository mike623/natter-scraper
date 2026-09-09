# Every Result Entry has the same keys

The brief marks `colors` as "required only if multiple colour options are present". We
emit it on every Result Entry regardless, as `null` when the Product has no Colour
Options, alongside the always-present `enabled` from
[ADR-0003](./0003-include-disabled-storage-options.md).

## Consequences

Consumers can treat `results` as a homogeneous collection: `null` means "no colours
offered" rather than "field absent, meaning unknown". The cost is a small, deliberate
deviation from the letter of the brief, noted in the README.
