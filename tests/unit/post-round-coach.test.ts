import { describe, expect, it } from "vitest";
import { createPostRoundCoach } from "@server/features/post-round-coach";
import { makeCoachSource } from "../fakes/fake-coach";
import type { AdapterResult, ProviderAdapter } from "@server/ai/types";

const tool = JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "overview" } } });
const final = JSON.stringify({ kind: "final", final: { findingIds: ["cell:country"], recommendations: [{ code: "practice_recall", category: "country", evidenceIds: ["cell:country"] }], completed: true } });

function capability(script: AdapterResult[], lines: string[]) {
  let index = 0;
  const adapter: ProviderAdapter = { provider: "gemini", async generate() { return script[index++] ?? { ok: false, error: { code: "transport" } }; } };
  return createPostRoundCoach({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, writeTelemetry: (line) => lines.push(line) });
}

describe("post-round coach capability and sanitized telemetry", () => {
  it.each([
    ["success", [{ ok: true, text: tool, usage: { inputTokens: 4 } }, { ok: true, text: final, usage: { outputTokens: 2 } }] as AdapterResult[], "completed"],
    ["invalid JSON", [{ ok: true, text: "private answer text", usage: { totalTokens: 6 } }] as AdapterResult[], "stopped"],
    ["provider failure", [{ ok: false, error: { code: "auth_config" } }] as AdapterResult[], "failed"],
  ])("writes one sanitized run record for %s", async (_name, script, expectedStatus) => {
    const lines: string[] = [];
    const coach = capability(script, lines);
    const view = await coach.run({ roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "fixture-v1", authorizeAndCharge: () => true });
    expect(view.status).toBe(expectedStatus);
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record.runId).toBe(view.runId);
    expect(record.toolName).toBe(view.toolCallCount === 1 ? "analyze_round" : null);
    expect(record.attempts).toHaveLength(view.providerAttemptCount);
    if (_name === "success") {
      expect(record.validations).toEqual([
        { kind: "proposal", step: 1, shape: "tool_request", toolName: "analyze_round", outcome: "accepted" },
        { kind: "tool", toolName: "analyze_round", execution: "executed", resultValidation: "accepted" },
        { kind: "proposal", step: 2, shape: "final", outcome: "accepted" },
      ]);
    }
    expect(lines[0]).not.toMatch(/private answer text|prompt|reply|socket|address|secret/i);
  });

  it("logs an unknown proposal as rejected without recording the untrusted tool name", async () => {
    const unknown = JSON.stringify({ kind: "tool_request", toolRequest: { name: "read_private_file", arguments: { focus: "overview" } } });
    const lines: string[] = [];
    const view = await capability([{ ok: true, text: unknown }], lines).run({ roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "fixture-v1", authorizeAndCharge: () => true });
    expect(view.stopReason).toBe("unknown_tool");
    const record = JSON.parse(lines[0]!);
    expect(record.validations).toEqual([
      { kind: "proposal", step: 1, shape: "tool_request", toolName: "unknown", outcome: "rejected", reason: "unknown_tool" },
      { kind: "tool", toolName: "unknown", execution: "not_executed", resultValidation: "not_run", reason: "unknown_tool" },
    ]);
    expect(lines[0]).not.toContain("read_private_file");
  });

  it("keeps a successful result when the optional telemetry sink throws", async () => {
    const responses = [tool, final];
    let index = 0;
    const adapter: ProviderAdapter = { provider: "gemini", async generate() { return { ok: true, text: responses[index++]! }; } };
    const coach = createPostRoundCoach({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, writeTelemetry: () => { throw new Error("sink unavailable"); } });
    const view = await coach.run({ roundId: "69ecddaa-95fb-4dc5-a6f6-4e567c814823", source: makeCoachSource(), language: "en", sourceVersion: "fixture-v1", authorizeAndCharge: () => true });
    expect(view.status).toBe("completed");
    expect(view.providerAttemptCount).toBe(2);
  });
});
