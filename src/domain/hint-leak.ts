import { wordsFold } from "./fold-letters";

const RUN = 4;

/**
 * GAME_SPEC §7: a hint must never contain the term — in either script, in
 * Serbian or in English — nor any four or more consecutive letters of it.
 * Everything is compared normalized, transliterated and folded, so "Дунав",
 * "Dunav" and "DUNAV" are the same word here.
 */
export function leaksTerm(clue: string, terms: readonly string[]): boolean {
  const text = wordsFold(clue);
  const clueWords = new Set(text.split(" "));

  for (const term of terms) {
    for (const word of wordsFold(term).split(" ")) {
      if (word === "") continue;
      if (word.length < RUN) {
        // Too short for a run: the whole word may not appear as a word.
        if (clueWords.has(word)) return true;
        continue;
      }
      for (let start = 0; start + RUN <= word.length; start++) {
        if (text.includes(word.slice(start, start + RUN))) return true;
      }
    }
  }
  return false;
}
