import { CATEGORIES, type Category } from "@contracts/game.schemas";
import {
  COACH_MAX_TOOL_ARGS_BYTES,
  COACH_MAX_TOOL_RESULT_BYTES,
  coachAnalyzeRoundArgsSchema,
  coachSourceSchema,
  coachToolResultSchema,
  type CoachSource,
  type CoachToolResult,
} from "@contracts/coach.schemas";

export type AnalyzeRoundArgs = import("@contracts/coach.schemas").CoachAnalyzeRoundArgs;

const encoder = new TextEncoder();
const cellId = (category: Category) => `cell:${category}` as const;

function recommendationsFor(source: CoachSource, totals: CoachToolResult["totals"]): CoachToolResult["eligibleRecommendations"] {
  const recommendations: CoachToolResult["eligibleRecommendations"] = [];
  for (const cell of source.cells) {
    const evidenceIds = [cellId(cell.category)];
    if (cell.blank) recommendations.push({ code: "practice_recall", category: cell.category, evidenceIds });
    if (!cell.blank && !cell.accepted) {
      switch (cell.rejectReason) {
        case "wrong_category": if (source.verified) recommendations.push({ code: "check_category", category: cell.category, evidenceIds }); break;
        case "wrong_letter": recommendations.push({ code: "check_letter", category: cell.category, evidenceIds }); break;
        case "too_short": recommendations.push({ code: "check_length", category: cell.category, evidenceIds }); break;
        case "not_real":
        case "historical":
        case "unrecognized": if (source.verified) recommendations.push({ code: "review_rejected_term", category: cell.category, evidenceIds }); break;
      }
    }
    if (cell.hinted) recommendations.push({ code: "practice_without_hint", category: cell.category, evidenceIds });
    if (cell.accepted && cell.points === 5 && cell.scoringReason === "same_answer") recommendations.push({ code: "vary_answers", category: cell.category, evidenceIds });
  }
  if (totals.accepted === CATEGORIES.length && totals.blank === 0 && totals.rejectedNonblank === 0) {
    recommendations.push({ code: "maintain_approach", category: null, evidenceIds: ["totals", "verification"] });
  }
  return recommendations;
}

function orderEvidence(source: CoachSource, focus: AnalyzeRoundArgs["focus"]): string[] {
  const rank = (category: Category): number => {
    const cell = source.cells.find((item) => item.category === category)!;
    if (!cell.blank && !cell.accepted) return 0;
    if (cell.blank) return 1;
    if (cell.hinted) return 2;
    if (cell.accepted && cell.scoringReason === "same_answer") return 3;
    return 4;
  };
  const categoryRank = (category: Category): number => {
    const base = rank(category);
    if (focus === "blank_categories" && base === 1) return -1;
    if (focus === "rejected_answers" && base === 0) return -1;
    return base;
  };
  const ordered = [...CATEGORIES].sort((a, b) => categoryRank(a) - categoryRank(b) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  return [...ordered.map(cellId), "totals", "verification"];
}

/** Strictly parse the model's only allowed arguments. */
export function parseAnalyzeRoundArgs(raw: unknown): AnalyzeRoundArgs {
  const encoded = JSON.stringify(raw);
  if (typeof encoded !== "string" || encoder.encode(encoded).byteLength > COACH_MAX_TOOL_ARGS_BYTES) throw new Error("invalid_tool_arguments");
  const parsed = coachAnalyzeRoundArgsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("invalid_tool_arguments");
  }
  return parsed.data;
}

/** Deterministic read-only analysis over the exact backend-bound completed source. */
export function analyzeRound(sourceInput: CoachSource, sourceVersion: string, argsInput: unknown): CoachToolResult {
  const source = coachSourceSchema.parse(sourceInput);
  const args = parseAnalyzeRoundArgs(argsInput);
  const cells: CoachToolResult["cells"] = source.cells.map((cell) => ({
    id: cellId(cell.category), kind: "cell", ...cell,
  }));
  const totals: CoachToolResult["totals"] = {
    id: "totals", kind: "totals",
    blank: cells.filter((cell) => cell.blank).length,
    accepted: cells.filter((cell) => cell.accepted).length,
    rejectedNonblank: cells.filter((cell) => !cell.blank && !cell.accepted).length,
    hinted: cells.filter((cell) => cell.hinted).length,
    acceptedDuplicates: cells.filter((cell) => cell.accepted && cell.scoringReason === "same_answer").length,
    ownPoints: source.total,
  };
  const evidence: CoachToolResult["evidence"] = [
    ...cells,
    totals,
    { id: "verification", kind: "verification", verified: source.verified },
  ];
  const result = coachToolResultSchema.parse({
    sourceVersion,
    focus: args.focus,
    letter: source.letter,
    alphabet: source.alphabet,
    verified: source.verified,
    totals,
    cells,
    evidence,
    eligibleRecommendations: recommendationsFor(source, totals),
    priorityEvidenceIds: orderEvidence(source, args.focus),
  });
  if (encoder.encode(JSON.stringify(result)).byteLength > COACH_MAX_TOOL_RESULT_BYTES) throw new Error("invalid_tool_result");
  return result;
}

/** Recompute and compare every typed fact before passing a tool result to step two. */
export function validateAnalyzeRoundResult(
  resultInput: unknown,
  source: CoachSource,
  sourceVersion: string,
  focus: AnalyzeRoundArgs["focus"],
): CoachToolResult | null {
  const parsed = coachToolResultSchema.safeParse(resultInput);
  if (!parsed.success) return null;
  if (parsed.data.sourceVersion !== sourceVersion || parsed.data.focus !== focus) return null;
  let expected: CoachToolResult;
  try {
    expected = analyzeRound(source, sourceVersion, { focus });
  } catch {
    return null;
  }
  if (JSON.stringify(parsed.data) !== JSON.stringify(expected)) return null;
  return encoder.encode(JSON.stringify(parsed.data)).byteLength <= COACH_MAX_TOOL_RESULT_BYTES ? parsed.data : null;
}
