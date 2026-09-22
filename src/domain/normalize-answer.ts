/**
 * The single normalization implementation for the whole system. Equality of two
 * normalized answers decides 5 points versus 10, so this pipeline is never
 * re-implemented inline, and never reordered: NFKC, trim, collapse internal
 * whitespace, then Serbian Latin lowercasing.
 *
 * Body is taken verbatim from `Plan.md` §7.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("sr-Latn");
}
