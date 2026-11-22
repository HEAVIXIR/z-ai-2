/**
 * Shared normalizer for BrandAlias values.
 *
 * Persian-aware normalization:
 *  - trims + lowercases
 *  - converts Arabic YEH (ي) → Persian YEH (ی)
 *  - converts Arabic KAF (ك) → Persian KAF (ک)
 *  - strips ZWNJ / ZWJ (U+200C, U+200D)
 *  - collapses repeated whitespace
 *
 * The normalized value is stored on BrandAlias.normalizedValue and used for
 * uniqueness + lookup so that "کاترپیلار", "كاترپیلار", and "کاترپیلار " all
 * resolve to the same record.
 */
export function normalizeAliasValue(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    // Arabic/Persian digits are semantically identical for model/brand aliases.
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    // Ignore Arabic vowel marks and tatweel used in inconsistent spellings.
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u200c\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
