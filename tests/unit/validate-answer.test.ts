import { describe, expect, it } from "vitest";
import {
  MAX_ANSWER_LENGTH,
  MIN_ANSWER_LENGTH,
  answerValueSchema,
} from "@contracts/game.schemas";
import { isValidAnswer } from "@domain/validate-answer";

describe("isValidAnswer", () => {
  it("accepts a non-empty answer that starts with the round letter", () => {
    expect(isValidAnswer("Srbija", "S", "sr")).toBe(true);
    expect(isValidAnswer(" Srbija ", "S", "sr")).toBe(true);
  });

  it("ignores case on both the answer and the letter", () => {
    expect(isValidAnswer("srbija", "S", "sr")).toBe(true);
    // A letter can no longer arrive in lower case (the schema refuses it); the
    // mixed-case digraph is where folding the letter's case still matters.
    expect(isValidAnswer("LJUBLJANA", "Lj", "sr")).toBe(true);
  });

  it("rejects an answer that does not start with the round letter", () => {
    expect(isValidAnswer("Beograd", "S", "sr")).toBe(false);
    expect(isValidAnswer("Morava", "K", "sr")).toBe(false);
  });

  it("rejects the round letter typed back on its own", () => {
    // The cheapest way to farm points before this rule existed.
    expect(isValidAnswer("S", "S", "sr")).toBe(false);
    expect(isValidAnswer("s", "S", "sr")).toBe(false);
    expect(isValidAnswer(" S ", "S", "sr")).toBe(false);
  });

  it("rejects any single character, matching letter or not", () => {
    expect(isValidAnswer("B", "S", "sr")).toBe(false);
    expect(isValidAnswer("7", "S", "sr")).toBe(false);
  });

  it("accepts the shortest real answer at the floor", () => {
    expect(MIN_ANSWER_LENGTH).toBe(2);
    // "Sa" is two characters: at the floor, so valid.
    expect(isValidAnswer("Sa", "S", "sr")).toBe(true);
    expect(isValidAnswer("Sava", "S", "sr")).toBe(true);
  });

  it("counts length after normalization, not before", () => {
    // Padding does not buy length.
    expect(isValidAnswer("  S  ", "S", "sr")).toBe(false);
    // Collapsed internal whitespace still leaves two characters.
    expect(isValidAnswer("S    a", "S", "sr")).toBe(true);
  });

  it("rejects blank and whitespace-only answers", () => {
    expect(isValidAnswer("", "S", "sr")).toBe(false);
    expect(isValidAnswer("   ", "S", "sr")).toBe(false);
    expect(isValidAnswer("\t\n", "S", "sr")).toBe(false);
  });

  it("does not treat a diacritic as its plain letter", () => {
    expect(isValidAnswer("Šabac", "S", "sr")).toBe(false);
  });

  it("treats Lj, Nj and Dž as letters of their own in a Serbian room", () => {
    expect(isValidAnswer("Ljubljana", "Lj", "sr")).toBe(true);
    expect(isValidAnswer("Ljubljana", "L", "sr")).toBe(false);
    expect(isValidAnswer("London", "L", "sr")).toBe(true);
    expect(isValidAnswer("Njemačka", "Nj", "sr")).toBe(true);
    expect(isValidAnswer("Njemačka", "N", "sr")).toBe(false);
    expect(isValidAnswer("Norveška", "N", "sr")).toBe(true);
    expect(isValidAnswer("Džakarta", "Dž", "sr")).toBe(true);
    expect(isValidAnswer("Džakarta", "D", "sr")).toBe(false);
    expect(isValidAnswer("Danska", "D", "sr")).toBe(true);
    // Without the caron it is a plain D word, as with "Sabac" and S.
    expect(isValidAnswer("Dzakarta", "D", "sr")).toBe(true);
    expect(isValidAnswer("Dzakarta", "Dž", "sr")).toBe(false);
  });

  it("folds the single-character digraphs to their two letters", () => {
    // U+01C8 ǈ, U+01CB ǋ, U+01C5 ǅ: NFKC splits them.
    expect(isValidAnswer("\u01C8ubljana", "Lj", "sr")).toBe(true);
    expect(isValidAnswer("\u01C8ubljana", "L", "sr")).toBe(false);
    expect(isValidAnswer("\u01CBemačka", "Nj", "sr")).toBe(true);
    expect(isValidAnswer("\u01C5akarta", "D", "sr")).toBe(false);
  });

  it("respects diacritics for the new Serbian letters", () => {
    expect(isValidAnswer("Šabac", "Š", "sr")).toBe(true);
    expect(isValidAnswer("Sabac", "Š", "sr")).toBe(false);
    expect(isValidAnswer("Čačak", "Č", "sr")).toBe(true);
    expect(isValidAnswer("Ćuprija", "Č", "sr")).toBe(false);
    expect(isValidAnswer("Đakovica", "Đ", "sr")).toBe(true);
    expect(isValidAnswer("Đakovica", "D", "sr")).toBe(false);
  });

  it("has no digraph rule in an English room", () => {
    expect(isValidAnswer("Ljubljana", "L", "en")).toBe(true);
    expect(isValidAnswer("Njemačka", "N", "en")).toBe(true);
    expect(isValidAnswer("Džakarta", "D", "en")).toBe(true);
    expect(isValidAnswer("Washington", "W", "en")).toBe(true);
    expect(isValidAnswer("Quito", "Q", "en")).toBe(true);
  });

  it("still respects diacritics in an English room", () => {
    expect(isValidAnswer("Čačak", "C", "en")).toBe(false);
    expect(isValidAnswer("Cairo", "C", "en")).toBe(true);
    expect(isValidAnswer("Šabac", "S", "en")).toBe(false);
  });

  it("checks only the starting letter, never semantic correctness", () => {
    expect(isValidAnswer("Sasvim izmisljeno", "S", "sr")).toBe(true);
  });

  it("bounds answer length at the boundary schema, where that rule is owned", () => {
    // `isValidAnswer` deliberately does not re-check length; an over-length raw
    // value is rejected by `answerValueSchema` before it reaches the domain.
    const overLength = "S".repeat(MAX_ANSWER_LENGTH + 1);
    expect(answerValueSchema.safeParse(overLength).success).toBe(false);
    expect(answerValueSchema.safeParse("S".repeat(MAX_ANSWER_LENGTH)).success).toBe(true);
  });
});
