# E-Commerce Scraper

Scrapes the webscraper.io e-commerce test site into a single JSON document describing
every purchasable configuration and their combined value.

## Language

### Source pages

**Category Page**:
A paginated page that enumerates Products in one category.
_Avoid_: listing page, index page

**Product Page**:
The page describing a single Product at its own URL.
_Avoid_: detail page, PDP, item page

### Catalogue

**Product**:
A single item the site sells, identified by its Product Page URL. Two Products may share
a name and differ in price.
_Avoid_: item, SKU, listing

**Storage Option**:
One selectable storage capacity offered on a Product, such as 256 GB. A Product either
offers several or offers none at all.
_Avoid_: HDD, swatch, memory, variant

**Colour Option**:
One selectable colour offered on a Product. Colour never distinguishes one Result Entry
from another.
_Avoid_: color variant, colour swatch

**Enabled**:
Whether the site offers a given Storage Option for purchase. A Storage Option the site
presents but marks unselectable is not Enabled.
_Avoid_: available, in stock, active

**Price**:
The amount the Product Page states for a Product.
_Avoid_: cost, amount, value

### Output

**Result Entry**:
One object in the output. A Product that has Storage Options yields one Result Entry per
Storage Option; a Product without them yields exactly one.
_Avoid_: row, record, variant, result

**Catalogue Total**:
The combined Price of every Enabled Result Entry.
_Avoid_: total price, grand total, sum
