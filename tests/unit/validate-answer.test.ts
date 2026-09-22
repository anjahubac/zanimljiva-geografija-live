import { describe, expect, it } from "vitest";
import { MAX_ANSWER_LENGTH, answerValueSchema } from "@contracts/game.schemas";
import { isValidAnswer } from "@domain/validate-answer";

describe("isValidAnswer", () => {
  it("accepts a non-empty answer that starts with the round letter", () => {
    expect(isValidAnswer("Srbija", "S")).toBe(true);
    expect(isValidAnswer(" Srbija ", "S")).toBe(true);
  });

  it("ignores case on both the answer and the letter", () => {
    expect(isValidAnswer("srbija", "S")).toBe(true);
    expect(isValidAnswer("SRBIJA", "s")).toBe(true);
  });

  it("rejects an answer that does not start with the round letter", () => {
    expect(isValidAnswer("Beograd", "S")).toBe(false);
    expect(isValidAnswer("Morava", "K")).toBe(false);
  });

  it("rejects blank and whitespace-only answers", () => {
    expect(isValidAnswer("", "S")).toBe(false);
    expect(isValidAnswer("   ", "S")).toBe(false);
    expect(isValidAnswer("\t\n", "S")).toBe(false);
  });

  it("does not treat a diacritic as its plain letter", () => {
    expect(isValidAnswer("Šabac", "S")).toBe(false);
  });

  it("checks only the starting letter, never semantic correctness", () => {
    expect(isValidAnswer("Sasvim izmisljeno", "S")).toBe(true);
  });

  it("bounds answer length at the boundary schema, where that rule is owned", () => {
    // `isValidAnswer` deliberately does not re-check length; an over-length raw
    // value is rejected by `answerValueSchema` before it reaches the domain.
    const overLength = "S".repeat(MAX_ANSWER_LENGTH + 1);
    expect(answerValueSchema.safeParse(overLength).success).toBe(false);
    expect(answerValueSchema.safeParse("S".repeat(MAX_ANSWER_LENGTH)).success).toBe(true);
  });
});
