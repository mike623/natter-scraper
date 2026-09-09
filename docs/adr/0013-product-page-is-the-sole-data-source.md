# The Product Page is the sole data source

Category Pages carry name, description and price, but are used only to enumerate Product
URLs and pagination. Every field is read from the Product Page.

## Consequences

No request is saved by this — Colour and Storage Options exist only on Product Pages, so
all 147 are fetched regardless. What is avoided is owning a reconciliation rule for the
day the two sources disagree.
