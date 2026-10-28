import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@contracts/game.schemas";
import { makeCoachSource } from "../fakes/fake-coach";
import { analyzeRound, parseAnalyzeRoundArgs, validateAnalyzeRoundResult } from "@server/features/analyze-round";

function mixedSource() {
  const source = makeCoachSource();
  source.verified = true;
  source.cells[0] = { category: "country", blank: false, accepted: true, rejectReason: null, hinted: false, points: 5, scoringReason: "same_answer" };
  source.cells[1] = { category: "city", blank: false, accepted: false, rejectReason: "wrong_category", hinted: false, points: 0, scoringReason: "only_player_2" };
  source.cells[2] = { category: "river", blank: true, accepted: false, rejectReason: null, hinted: true, points: 0, scoringReason: "neither" };
  source.cells[3] = { category: "mountain", blank: false, accepted: true, rejectReason: null, hinted: false, points: 10, scoringReason: "only_player_1" };
  source.total = 15;
  return source;
}

describe("analyze_round", () => {
  it("produces ten typed records, consistent totals and only eligible recommendations", () => {
    const source = mixedSource();
    const result = analyzeRound(source, "source-v1", { focus: "overview" });
    expect(result.cells).toHaveLength(8);
    expect(result.evidence).toHaveLength(10);
    expect(result.priorityEvidenceIds).toHaveLength(10);
    expect(result.totals).toMatchObject({ blank: 5, accepted: 2, rejectedNonblank: 1, hinted: 1, acceptedDuplicates: 1, ownPoints: 15 });
    expect(result.eligibleRecommendations).toContainEqual({ code: "vary_answers", category: "country", evidenceIds: ["cell:country"] });
    expect(result.eligibleRecommendations).toContainEqual({ code: "practice_recall", category: "river", evidenceIds: ["cell:river"] });
    expect(result.eligibleRecommendations).toContainEqual({ code: "check_category", category: "city", evidenceIds: ["cell:city"] });
    expect(result.priorityEvidenceIds[0]).toBe("cell:city");
    expect(validateAnalyzeRoundResult(result, source, "source-v1", "overview")).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/"raw"|"normalized"|Srbija|Slovenija/i);
  });

  it("orders requested focus first while keeping canonical order stable", () => {
    const source = mixedSource();
    source.cells[1] = { category: "city", blank: false, accepted: false, rejectReason: "wrong_category", hinted: false, points: 0, scoringReason: "only_player_2" };
    source.cells[2] = { category: "river", blank: true, accepted: false, rejectReason: null, hinted: true, points: 0, scoringReason: "neither" };
    expect(analyzeRound(source, "v1", { focus: "rejected_answers" }).priorityEvidenceIds[0]).toBe("cell:city");
    expect(analyzeRound(source, "v1", { focus: "blank_categories" }).priorityEvidenceIds[0]).toBe("cell:river");
  });

  it("rejects extra or invalid args and any tampered facts/evidence/source version", () => {
    expect(() => parseAnalyzeRoundArgs({ focus: "overview", sourceVersion: "forged" })).toThrow("invalid_tool_arguments");
    expect(() => parseAnalyzeRoundArgs({ focus: "answer" })).toThrow("invalid_tool_arguments");
    const source = mixedSource();
    const result = analyzeRound(source, "v1", { focus: "overview" });
    expect(validateAnalyzeRoundResult({ ...result, sourceVersion: "other" }, source, "v1", "overview")).toBeNull();
    expect(validateAnalyzeRoundResult({ ...result, totals: { ...result.totals, hinted: 0 } }, source, "v1", "overview")).toBeNull();
    expect(validateAnalyzeRoundResult({ ...result, evidence: result.evidence.map((entry, i) => i === 0 ? { ...entry, category: "city" } : entry) }, source, "v1", "overview")).toBeNull();
    expect(CATEGORIES).toHaveLength(8);
  });

  it("never offers geography/category correction on an unverified round", () => {
    const source = mixedSource();
    source.verified = false;
    source.cells[1] = { category: "city", blank: false, accepted: false, rejectReason: "wrong_category", hinted: false, points: 0, scoringReason: "only_player_2" };
    const result = analyzeRound(source, "v1", { focus: "rejected_answers" });
    expect(result.eligibleRecommendations.some((item) => item.category === "city" && item.code.startsWith("check_"))).toBe(false);
    expect(result.eligibleRecommendations.some((item) => item.code === "review_rejected_term")).toBe(false);
  });

  it.each([
    { letter: "Nj" as const, alphabet: "sr" as const, uiLanguage: "en" as const },
    { letter: "W" as const, alphabet: "en" as const, uiLanguage: "sr" as const },
  ])("preserves the captured $alphabet alphabet and $letter letter independent of UI language $uiLanguage", ({ letter, alphabet }) => {
    const source = makeCoachSource({ letter, alphabet, verified: false });
    const result = analyzeRound(source, "source-version", { focus: "overview" });
    expect(result).toMatchObject({ letter, alphabet, verified: false, sourceVersion: "source-version" });
    expect(validateAnalyzeRoundResult(result, source, "source-version", "overview")?.evidence).toEqual(result.evidence);
    expect(result.evidence).toHaveLength(10);
  });
});
