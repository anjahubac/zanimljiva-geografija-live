import { describe, expect, it } from "vitest";
import { runCoachEngine } from "@server/features/coach-engine";
import { makeCoachSource } from "../fakes/fake-coach";

const toolProposal = JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "overview" } } });
const finalProposal = JSON.stringify({ kind: "final", final: { findingIds: ["cell:country"], recommendations: [{ code: "practice_recall", category: "country", evidenceIds: ["cell:country"] }], completed: true } });

describe("post-round coach engine", () => {
  it("runs exactly two model decisions and one real deterministic tool, returning inspectable checked evidence", async () => {
    let attempts = 0;
    const responses = [toolProposal, finalProposal];
    const base = makeCoachSource();
    const mixedSource = {
      ...base,
      total: 15,
      cells: base.cells.map((cell) => cell.category === "country"
        ? cell
        : cell.category === "city"
          ? { ...cell, blank: false, rejectReason: "wrong_category" as const }
          : cell.category === "river"
            ? { ...cell, blank: false, accepted: true, hinted: true, points: 10 as const, scoringReason: "only_player_1" as const }
            : cell.category === "mountain"
              ? { ...cell, blank: false, accepted: true, points: 5 as const, scoringReason: "same_answer" as const }
              : cell),
    };
    const result = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: mixedSource, language: "en", sourceVersion: "test-v1",
      authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { attempts += 1; onAttempt(); return { ok: true, text: responses[attempts - 1]!, model: "fake" }; },
    });
    expect(result.status).toBe("completed");
    expect(result.stepCount).toBe(2);
    expect(result.toolCallCount).toBe(1);
    expect(result.providerAttemptCount).toBe(2);
    expect(result.result?.evidence).toHaveLength(10);
    expect(result.result?.evidence).toContainEqual(expect.objectContaining({ id: "cell:river", accepted: true, hinted: true, points: 10 }));
    expect(result.result?.evidence).toContainEqual(expect.objectContaining({ id: "cell:mountain", accepted: true, points: 5, scoringReason: "same_answer" }));
    expect(result.result?.evidence).toContainEqual(expect.objectContaining({ id: "cell:city", rejectReason: "wrong_category" }));
  });

  it("rejects an unknown tool before executing any tool", async () => {
    const result = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "sr", sourceVersion: "test-v1",
      authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: JSON.stringify({ kind: "tool_request", toolRequest: { name: "read_file", arguments: { focus: "overview" } } }), model: "fake" }; },
    });
    expect(result.status).toBe("stopped");
    expect(result.stopReason).toBe("unknown_tool");
    expect(result.toolCallCount).toBe(0);
  });

  it("does not accept another tool request after the first tool", async () => {
    const result = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "sr", sourceVersion: "test-v1",
      authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : toolProposal, model: "fake" }; },
    });
    expect(result.status).toBe("stopped");
    expect(result.stopReason).toBe("repeated_action");
    expect(result.toolCallCount).toBe(1);
  });

  it("classifies refusal at either model decision and never fabricates a result", async () => {
    const first = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "sr", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: JSON.stringify({ kind: "refusal" }), model: "fake" }; },
    });
    expect(first).toMatchObject({ status: "stopped", stopReason: "provider_refusal", stepCount: 1, toolCallCount: 0, result: null });

    const second = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "sr", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : JSON.stringify({ kind: "refusal" }), model: "fake" }; },
    });
    expect(second).toMatchObject({ status: "stopped", stopReason: "provider_refusal", stepCount: 2, toolCallCount: 1, result: null });
  });

  it.each([true, false])("returns a qualified maintenance result for eight accepted cells (verified=%s)", async (verified) => {
    const base = makeCoachSource();
    const source = { ...base, verified, total: 80, cells: base.cells.map((cell) => ({ ...cell, blank: false, accepted: true, rejectReason: null, points: 10 as const, scoringReason: "both_different" as const })) };
    const maintain = JSON.stringify({ kind: "final", final: { findingIds: ["totals", "verification"], recommendations: [{ code: "maintain_approach", category: null, evidenceIds: ["totals", "verification"] }], completed: true } });
    const result = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source, language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : maintain, model: "fake" }; },
    });
    expect(result.status).toBe("completed");
    expect(result.result).toMatchObject({ confidence: verified ? "medium" : "low", limitations: verified ? ["single_round", "checker_can_be_wrong"] : ["single_round", "local_rule_only"], recommendations: [{ code: "maintain_approach", category: null }] });
    expect(result.result?.evidence.find((entry) => entry.kind === "totals")).toMatchObject({ blank: 0, accepted: 8, rejectedNonblank: 0, ownPoints: 80 });
  });

  it("rejects duplicate and ineligible final recommendations and records final validation failure", async () => {
    const cases = [
      JSON.stringify({ kind: "final", final: { findingIds: ["cell:country"], recommendations: [
        { code: "practice_recall", category: "country", evidenceIds: ["cell:country"] },
        { code: "practice_recall", category: "country", evidenceIds: ["cell:country"] },
      ], completed: true } }),
      JSON.stringify({ kind: "final", final: { findingIds: ["cell:country"], recommendations: [{ code: "check_category", category: "country", evidenceIds: ["cell:country"] }], completed: true } }),
    ];
    for (const final of cases) {
      const records: unknown[] = [];
      const result = await runCoachEngine({
        roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true, onValidation: (record) => records.push(record),
        model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : final, model: "fake" }; },
      });
      expect(result).toMatchObject({ status: "stopped", stopReason: "invalid_final", result: null });
      expect(records).toContainEqual({ kind: "proposal", step: 2, shape: "final", outcome: "rejected", reason: "invalid_final" });
    }
  });

  it("returns pre-tool failures with zero tool work for oversized proposals and refused physical quotas", async () => {
    const tooLarge = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: " ".repeat(8193), model: "fake" }; },
    });
    expect(tooLarge.stopReason).toBe("invalid_model_proposal");
    expect(tooLarge.providerAttemptCount).toBe(1);
    expect(tooLarge.toolCallCount).toBe(0);

    const denied = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => false,
      model: async ({ onAttempt }) => { expect(onAttempt()).toBe(false); return { ok: false, reason: "quota_exhausted" }; },
    });
    expect(denied.stopReason).toBe("quota_exhausted");
    expect(denied.providerAttemptCount).toBe(0);
  });

  it("fails closed on a bad tool result, tool exception and unsupported final choice", async () => {
    const badTool = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : finalProposal, model: "fake" }; },
      analyze: () => ({ bad: true }),
    });
    expect(badTool.stopReason).toBe("invalid_tool_result");
    expect(badTool.stepCount).toBe(1);
    expect(badTool.toolCallCount).toBe(1);

    const toolThrow = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: toolProposal, model: "fake" }; },
      analyze: () => { throw new Error("private tool details"); },
    });
    expect(toolThrow.status).toBe("failed");
    expect(toolThrow.stopReason).toBe("tool_failed");

    const invalidFinal = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : JSON.stringify({ kind: "final", final: { findingIds: ["verification"], recommendations: [{ code: "check_category", category: "country", evidenceIds: ["cell:country"] }], completed: true } }), model: "fake" }; },
    });
    expect(invalidFinal.stopReason).toBe("invalid_final");
  });

  it("cancels an admitted run when its bound source becomes unavailable", async () => {
    let current = true;
    const result = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true, isCurrent: () => current,
      model: async ({ onAttempt }) => { onAttempt(); current = false; return { ok: true, text: toolProposal, model: "fake" }; },
    });
    expect(result.stopReason).toBe("cancelled");
    expect(result.toolCallCount).toBe(0);
  });

  it("classifies invalid arguments, a second different analysis, and tool timeout without extra calls", async () => {
    const invalidArgs = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "overview", extra: "bad" } } }), model: "fake" }; },
    });
    expect(invalidArgs.stopReason).toBe("invalid_tool_arguments");
    expect(invalidArgs.toolCallCount).toBe(0);

    const differentTool = await runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true,
      model: async ({ step, onAttempt }) => { onAttempt(); return { ok: true, text: step === 1 ? toolProposal : JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "blank_categories" } } }), model: "fake" }; },
    });
    expect(differentTool.stopReason).toBe("tool_call_limit");
    expect(differentTool.toolCallCount).toBe(1);

    const timers: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];
    const schedule = (at: number, fn: () => void) => { const item = { at, fire: fn, cancelled: false }; timers.push(item); return () => { item.cancelled = true; }; };
    let toolStarted = false;
    const toolTimeout = runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true, schedule,
      model: async ({ onAttempt }) => { onAttempt(); return { ok: true, text: toolProposal, model: "fake" }; },
      analyze: () => { toolStarted = true; return new Promise(() => {}); },
    });
    for (let i = 0; i < 10 && !toolStarted; i += 1) await Promise.resolve();
    expect(toolStarted).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
      const next = timers.filter((timer) => !timer.cancelled).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.fire();
      await Promise.resolve();
      await Promise.resolve();
      if (i > 2) break;
    }
    const timedOut = await toolTimeout;
    expect(timedOut.stopReason).toBe("tool_timeout");
    expect(timedOut.status).toBe("failed");
    expect(timers.every((timer) => timer.cancelled)).toBe(true);
  });

  it("terminates a dependency that ignores abort at the shared 30 second deadline and clears timers", async () => {
    const timers: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];
    const schedule = (at: number, fn: () => void) => { const item = { at, fire: fn, cancelled: false }; timers.push(item); return () => { item.cancelled = true; }; };
    let currentTime = 100;
    const pending = runCoachEngine({
      roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "test-v1", authorizeAndCharge: () => true, schedule, now: () => currentTime,
      model: async ({ onAttempt }) => { onAttempt(); return new Promise(() => {}); },
    });
    for (let i = 0; i < 10 && !timers.some((item) => !item.cancelled); i += 1) await Promise.resolve();
    const deadline = timers.filter((item) => !item.cancelled).sort((a, b) => b.at - a.at)[0]!;
    currentTime = deadline.at;
    deadline.fire();
    const result = await pending;
    expect(result.stopReason).toBe("deadline");
    expect(result.providerAttemptCount).toBe(1);
    expect(timers.every((item) => item.cancelled)).toBe(true);
  });
});
