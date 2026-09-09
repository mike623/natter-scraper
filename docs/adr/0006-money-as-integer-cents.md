# Represent money as integer cents internally

Prices are parsed straight to integer cents, summed as integers, and divided by 100 only
when serialising. Summing 423 IEEE-754 floats accumulates representation error, and the
one field most likely to be compared against a reviewer's own run is the one where it
would surface.

## Consequences

Anyone "simplifying" the parse step to `parseFloat` reintroduces the artefact. The unit
tests on the pure functions are what catch it.
