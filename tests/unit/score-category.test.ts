import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@contracts/game.schemas";
import type { Category, Letter } from "@contracts/game.schemas";
import { scoreCategory } from "@domain/score-category";
import { scoreRound } from "@domain/score-round";

const LETTER: Letter = "S";

/** Every row of the `Plan.md` §6 traditional scoring table. */
const cases = [
  { p1: "Srbija", p2: "Slovenija", points: [10, 10], reason: "both_different" },
  { p1: "Srbija", p2: " srbija ", points: [5, 5], reason: "same_answer" },
  { p1: "Srbija", p2: "SRBIJA", points: [5, 5], reason: "same_answer" },
  { p1: "Srbija", p2: "", points: [10, 0], reason: "only_player_1" },
  { p1: "Srbija", p2: "Beograd", points: [10, 0], reason: "only_player_1" },
  { p1: "", p2: "Srbija", points: [0, 10], reason: "only_player_2" },
  { p1: "Beograd", p2: "Srbija", points: [0, 10], reason: "only_player_2" },
  { p1: "Beograd", p2: "", points: [0, 0], reason: "neither" },
  { p1: "   ", p2: "x".repeat(41), points: [0, 0], reason: "neither" },
  { p1: "Beograd", p2: "Beograd", points: [0, 0], reason: "neither" },
] as const;

describe("scoreCategory", () => {
  it.each(cases)("scores '$p1' vs '$p2' as $reason", ({ p1, p2, points, reason }) => {
    expect(scoreCategory("city", p1, p2, LETTER)).toEqual({
      category: "city",
      player1Points: points[0],
      player2Points: points[1],
      reason,
    });
  });

  it("echoes back the category it was asked to score", () => {
    for (const category of CATEGORIES) {
      expect(scoreCategory(category, "Srbija", "Slovenija", LETTER).category).toBe(category);
    }
  });

  it("decides validity before comparison, so two identical invalid answers score zero", () => {
    // Same normalized string, but neither is valid: this is `neither`, not `same_answer`.
    const score = scoreCategory("river", "Morava", "morava", LETTER);
    expect(score.reason).toBe("neither");
    expect(score.player1Points).toBe(0);
    expect(score.player2Points).toBe(0);
  });
});

const blankAnswers = (): Record<Category, string> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, ""])) as Record<Category, string>;

const answersOf = (overrides: Partial<Record<Category, string>>): Record<Category, string> => ({
  ...blankAnswers(),
  ...overrides,
});

describe("scoreRound", () => {
  it("returns one score per category, in the locked category order", () => {
    const result = scoreRound(blankAnswers(), blankAnswers(), LETTER);
    expect(result.scores).toHaveLength(CATEGORIES.length);
    expect(result.scores.map((score) => score.category)).toEqual([...CATEGORIES]);
  });

  it("totals a full board of different valid answers as 60 each and a draw", () => {
    const answers1 = answersOf({
      country: "Srbija",
      city: "Subotica",
      river: "Sava",
      mountain: "Suvobor",
      plant: "Suncokret",
      animal: "Sova",
    });
    const answers2 = answersOf({
      country: "Slovenija",
      city: "Smederevo",
      river: "Studenica",
      mountain: "Stara planina",
      plant: "Salata",
      animal: "Slon",
    });

    const result = scoreRound(answers1, answers2, LETTER);
    expect(result.player1Total).toBe(60);
    expect(result.player2Total).toBe(60);
    expect(result.outcome).toBe("draw");
  });

  it("names player 1 the winner when player 1 has more points", () => {
    const result = scoreRound(
      answersOf({ country: "Srbija", city: "Subotica" }),
      answersOf({ country: "Slovenija" }),
      LETTER,
    );
    expect(result.player1Total).toBe(20);
    expect(result.player2Total).toBe(10);
    expect(result.outcome).toBe("player_1");
  });

  it("names player 2 the winner when player 2 has more points", () => {
    const result = scoreRound(
      answersOf({ country: "Beograd" }),
      answersOf({ country: "Slovenija", river: "Sava" }),
      LETTER,
    );
    expect(result.player1Total).toBe(0);
    expect(result.player2Total).toBe(20);
    expect(result.outcome).toBe("player_2");
  });

  it("scores an empty board as 0-0 and a draw", () => {
    const result = scoreRound(blankAnswers(), blankAnswers(), LETTER);
    expect(result.player1Total).toBe(0);
    expect(result.player2Total).toBe(0);
    expect(result.outcome).toBe("draw");
  });

  it("mixes reasons across categories in one round", () => {
    const result = scoreRound(
      answersOf({ country: "Srbija", city: "Subotica", river: "Beograd" }),
      answersOf({ country: " srbija ", city: "Smederevo" }),
      LETTER,
    );
    const byCategory = Object.fromEntries(result.scores.map((score) => [score.category, score]));
    expect(byCategory.country?.reason).toBe("same_answer");
    expect(byCategory.city?.reason).toBe("both_different");
    expect(byCategory.river?.reason).toBe("neither");
    expect(byCategory.plant?.reason).toBe("neither");
    expect(result.player1Total).toBe(15);
    expect(result.player2Total).toBe(15);
    expect(result.outcome).toBe("draw");
  });

  it("does not mutate the answer records it was given", () => {
    const answers1 = answersOf({ country: "Srbija" });
    const answers2 = answersOf({ country: "Slovenija" });
    scoreRound(answers1, answers2, LETTER);
    expect(answers1).toEqual(answersOf({ country: "Srbija" }));
    expect(answers2).toEqual(answersOf({ country: "Slovenija" }));
  });
});
