import { describe, expect, it } from "vitest";
import {
  coachFinalProposalSchema,
  coachRequestSchema,
  coachRunViewSchema,
  coachSourceSchema,
  coachToolProposalEnvelopeSchema,
} from "@contracts/coach.schemas";

const roundId = "69ecddaa-95fb-4dc5-a6f6-4e567c814823";
const categories = ["country", "city", "river", "mountain", "sea", "animal", "plant", "thing"] as const;

describe("coach boundary schemas", () => {
  it("accepts only the fixed goal request shape and bounds its byte size", () => {
    expect(coachRequestSchema.parse({ roundId, goalId: "review_round", language: "sr" })).toEqual({ roundId, goalId: "review_round", language: "sr" });
    expect(coachRequestSchema.safeParse({ roundId, goalId: "other", language: "sr" }).success).toBe(false);
    expect(coachRequestSchema.safeParse({ roundId, goalId: "review_round", language: "sr", seat: 1 }).success).toBe(false);
  });

  it("rejects unknown structurally valid tools separately from malformed proposal JSON", () => {
    const unknown = { kind: "tool_request", toolRequest: { name: "delete_database", arguments: { focus: "overview" } } };
    expect(coachToolProposalEnvelopeSchema.safeParse(unknown).success).toBe(true);
    expect(coachToolProposalEnvelopeSchema.safeParse({ kind: "tool_request", toolRequest: { name: 7, arguments: {} } }).success).toBe(false);
  });

  it("requires all eight own category records with consistent points", () => {
    const source = {
      letter: "S", alphabet: "sr", verified: true, total: 0,
      cells: categories.map((category) => ({ category, blank: true, accepted: false, rejectReason: null, hinted: false, points: 0, scoringReason: "neither" })),
    };
    expect(coachSourceSchema.safeParse(source).success).toBe(true);
    expect(coachSourceSchema.safeParse({ ...source, cells: source.cells.slice(1) }).success).toBe(false);
    expect(coachSourceSchema.safeParse({ ...source, total: 10 }).success).toBe(false);
  });

  it("parses the canonical model final shape and terminal CoachRunView only", () => {
    const final = { kind: "final", final: { findingIds: ["totals"], recommendations: [{ code: "maintain_approach", category: null, evidenceIds: ["totals", "verification"] }], completed: true } };
    expect(coachFinalProposalSchema.safeParse(final).success).toBe(true);
    expect(coachFinalProposalSchema.safeParse({ ...final, narrative: "made up" }).success).toBe(false);
    const view = { runId: roundId, roundId, status: "stopped", stopReason: "unknown_tool", stepCount: 1, toolCallCount: 0, providerAttemptCount: 1, elapsedMs: 20, result: null };
    expect(coachRunViewSchema.safeParse(view).success).toBe(true);
    expect(coachRunViewSchema.safeParse({ ...view, result: {} }).success).toBe(false);
    expect(coachRunViewSchema.safeParse({ ...view, status: "completed", stopReason: "completed", result: {} }).success).toBe(false);
  });

  it("rejects contradictory cell flags and points in a completed ack", () => {
    const makeView = (countryOverride: Record<string, unknown> = {}) => {
      const cells = categories.map((category) => ({ id: `cell:${category}`, kind: "cell", category, blank: true, accepted: false, rejectReason: null, hinted: false, points: 0, scoringReason: "neither", ...(category === "country" ? countryOverride : {}) }));
      const evidence = [
        ...cells,
        { id: "totals", kind: "totals", blank: cells.filter((cell) => cell.blank).length, accepted: cells.filter((cell) => cell.accepted).length, rejectedNonblank: cells.filter((cell) => !cell.blank && !cell.accepted).length, hinted: 0, acceptedDuplicates: cells.filter((cell) => cell.accepted && cell.scoringReason === "same_answer").length, ownPoints: cells.reduce((sum, cell) => sum + cell.points, 0) },
        { id: "verification", kind: "verification", verified: false },
      ];
      const result = {
        summary: { findingIds: ["cell:city"] },
        recommendations: [{ code: "practice_recall", category: "city", evidenceIds: ["cell:city"] }],
        evidence,
        confidence: "low",
        limitations: ["single_round", "local_rule_only"],
        completed: true,
      };
      return { runId: roundId, roundId, status: "completed", stopReason: "completed", stepCount: 2, toolCallCount: 1, providerAttemptCount: 2, elapsedMs: 20, result };
    };
    expect(coachRunViewSchema.safeParse(makeView()).success).toBe(true);
    const contradictoryCells = [
      { blank: true, accepted: true, points: 10, scoringReason: "only_player_1" },
      { blank: false, accepted: true, points: 0, scoringReason: "only_player_1" },
      { blank: false, accepted: false, rejectReason: "wrong_letter", points: 5, scoringReason: "neither" },
      { blank: false, accepted: true, points: 10, scoringReason: "same_answer" },
    ];
    for (const cell of contradictoryCells) expect(coachRunViewSchema.safeParse(makeView(cell)).success).toBe(false);
  });
});
