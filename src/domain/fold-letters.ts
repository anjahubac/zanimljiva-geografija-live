import { normalizeAnswer } from "./normalize-answer";

/**
 * GAME_SPEC §5.1 folding: the way people write Serbian without diacritics
 * (č, ć → c; š → s; ž → z; đ → dj; so dž → dz). Applied to normalized text.
 */
export function foldDiacritics(normalized: string): string {
  return normalized.replace(/đ/gu, "dj").replace(/[čć]/gu, "c").replace(/š/gu, "s").replace(/ž/gu, "z");
}

/** Normalized, folded, letters and digits only — for comparing two spellings. */
export function compactFold(raw: string): string {
  return foldDiacritics(normalizeAnswer(raw)).replace(/[^\p{L}\p{N}]/gu, "");
}

/** Normalized and folded, with every run of non-letters turned into one space. */
export function wordsFold(raw: string): string {
  return foldDiacritics(normalizeAnswer(raw)).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
