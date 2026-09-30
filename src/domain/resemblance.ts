import { compactFold } from "./fold-letters";

/* The domain avoids `Math` altogether (a lint rule keeps it deterministic). */
const smallest = (a: number, b: number, c: number): number => (a < b ? (a < c ? a : c) : b < c ? b : c);

/** Classic edit distance, two rows. Inputs are at most 60 characters. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = smallest(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length]!;
}

const MIN_PREFIX = 4;

/**
 * research R7 rule 4: the name the AI recognised must look like what the
 * player wrote, so the model cannot "correct" a garbled answer into some other
 * real term (Kxqwe → Kenija). Allowed: small typos, missing diacritics, a
 * plural ending, or a common short form of a longer name (Jadran → Jadransko more).
 */
export function resembles(written: string, recognised: string): boolean {
  const a = compactFold(written);
  const b = compactFold(recognised);
  if (a === "" || b === "") return false;
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= MIN_PREFIX && longer.startsWith(shorter)) return true;

  const quarter = (b.length - (b.length % 4)) / 4;
  return editDistance(a, b) <= (quarter > 2 ? quarter : 2);
}
