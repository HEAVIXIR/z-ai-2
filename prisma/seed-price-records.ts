/**
 * Fail-closed placeholder for the legacy PriceRecord backfill.
 *
 * The archived implementation was not idempotent and could create duplicate
 * PriceRecord rows. It is intentionally not restored or executed while the
 * separate backfill/migration gate remains unapproved.
 */
console.error(
  "BLOCKED: legacy PriceRecord backfill is disabled. Do not run a backfill until the dedicated data-migration gate is approved."
);
process.exitCode = 2;
