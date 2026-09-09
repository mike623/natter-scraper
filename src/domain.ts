/**
 * The domain model: types and pure functions over them.
 *
 * This module imports nothing. Everything here is decidable from its arguments
 * alone, which is what lets the interesting rules be tested without HTML,
 * without a network, and without a mocking framework. See ADR-0008.
 */

/** One selectable storage capacity on a Product, e.g. 256 GB. */
export type StorageOption = {
  readonly sizeGb: number;
  /** False when the site presents the option but marks it unselectable. */
  readonly enabled: boolean;
};

/** A Product exactly as its Product Page states it, before any expansion. */
export type ScrapedProduct = {
  readonly name: string;
  readonly description: string;
  /** Integer cents. See ADR-0006. */
  readonly priceCents: number;
  /** Null when the Product offers no colour choice at all. See ADR-0004. */
  readonly colors: readonly string[] | null;
  /** Empty when the Product offers no storage choice. */
  readonly storageOptions: readonly StorageOption[];
};

const PRICE_PATTERN = /^\$?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a displayed price into integer cents.
 *
 * Deliberately string-based rather than `parseFloat(x) * 100`: the whole point
 * of ADR-0006 is that no value ever passes through a float, so summing hundreds
 * of prices cannot accumulate representation error.
 */
export function parsePriceToCents(displayed: string): number {
  const normalised = displayed.trim().replace(/,/g, "");
  const match = PRICE_PATTERN.exec(normalised);

  if (match === null) {
    throw new Error(`Unrecognised price: ${JSON.stringify(displayed)}`);
  }

  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");

  return Number(whole) * 100 + Number(fraction);
}

/**
 * One object in the output, before serialisation. A Product with Storage Options
 * yields one of these per option; a Product without them yields exactly one.
 */
export type ResultEntry = {
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly colors: readonly string[] | null;
  /** False for a Storage Option the site presents but refuses to sell (ADR-0003). */
  readonly enabled: boolean;
};

/**
 * What each Storage Option adds to the Product's stated Price, in cents.
 *
 * These are the site's own numbers, not ours: `app.js` adds 20, 40 or 60 to the
 * displayed price when the swatch is clicked, and its `switch` leaves every other
 * size at the base price. We mirror that default rather than rejecting an unknown
 * size, so a size the site itself prices at base is priced at base here too
 * (ADR-0016).
 */
const STORAGE_SURCHARGE_CENTS: Readonly<Record<number, number>> = { 256: 2_000, 512: 4_000, 1024: 6_000 };

/** The surcharge for one Storage Option; zero for any size the site does not uplift. */
export function storageSurchargeCents(sizeGb: number): number {
  return STORAGE_SURCHARGE_CENTS[sizeGb] ?? 0;
}

/**
 * Expands a Product into its Result Entries.
 *
 * Storage Options are emitted ascending rather than in document order, so the
 * output is stable even if the site reorders its swatches (ADR-0012). Each one
 * carries the Product's stated Price plus that option's surcharge, which is what
 * the site shows a user who selects it (ADR-0016).
 */
export function toResultEntries(product: ScrapedProduct): ResultEntry[] {
  const { name, description, priceCents, colors, storageOptions } = product;

  if (storageOptions.length === 0) {
    return [{ name, description, priceCents, colors, enabled: true }];
  }

  return [...storageOptions]
    .sort((left, right) => left.sizeGb - right.sizeGb)
    .map(({ sizeGb, enabled }) => ({
      name: `${name} ${sizeGb} GB`,
      description,
      priceCents: priceCents + storageSurchargeCents(sizeGb),
      colors,
      enabled,
    }));
}

/** The Catalogue Total: Price summed across Enabled entries only (ADR-0005). */
export function catalogueTotalCents(entries: readonly ResultEntry[]): number {
  return entries.reduce((total, entry) => (entry.enabled ? total + entry.priceCents : total), 0);
}

/**
 * Converts cents to the decimal number the output states.
 *
 * This is the single place a float appears, and it appears once per emitted
 * value — never in a sum, which is the point of ADR-0006.
 */
export function centsToNumber(cents: number): number {
  return cents / 100;
}
