import { describe, expect, it } from "vitest";
import { createCoachTelemetry } from "@server/ai/coach-telemetry";

describe("bounded coach telemetry", () => {
  it("aggregates all available per-attempt usage and leaves missing usage unknown", () => {
    const lines: string[] = [];
    const telemetry = createCoachTelemetry("69ecddaa-95fb-4dc5-a6f6-4e567c814823", (line) => lines.push(line));
    telemetry.attempt({ step: 1, attempt: 1, kind: "initial", provider: "gemini", model: "gemini-test", status: "transport_success", latencyMs: 20, usage: { inputTokens: 7, outputTokens: 3 } });
    telemetry.attempt({ step: 1, attempt: 2, kind: "retry", provider: "gemini", model: "gemini-test", status: "invalid_output:schema", latencyMs: 25, usage: { inputTokens: 8, outputTokens: 2 } });
    telemetry.attempt({ step: 2, attempt: 3, kind: "fallback", provider: "groq", model: "openai/test", status: "timeout", latencyMs: 40 });
    telemetry.finish({ status: "stopped", stopReason: "invalid_final", stepCount: 2, toolCallCount: 1, providerAttemptCount: 3, elapsedMs: 100 });
    const record = JSON.parse(lines[0]!);
    expect(record.attempts).toHaveLength(3);
    expect(record.attemptUsage).toEqual({ usageReportedAttempts: 2, unknownAttempts: 1, returnedInputTokenSum: 15, returnedOutputTokenSum: 5 });
    expect(lines[0]).not.toMatch(/prompt|reply|answer|socket|room|secret/i);
    expect(new TextEncoder().encode(lines[0]!).byteLength).toBeLessThanOrEqual(16_384);
  });

  it("drops attempts with extra content-bearing fields and is exactly-once", () => {
    const lines: string[] = [];
    const telemetry = createCoachTelemetry("69ecddaa-95fb-4dc5-a6f6-4e567c814823", (line) => lines.push(line));
    telemetry.attempt({ step: 1, attempt: 1, kind: "initial", provider: "gemini", model: "gemini-test", status: "transport_success", latencyMs: 1, prompt: "private" } as never);
    const terminal = { status: "failed", stopReason: "provider_failed", stepCount: 1, toolCallCount: 0, providerAttemptCount: 1, elapsedMs: 10 };
    telemetry.finish(terminal);
    telemetry.finish(terminal);
    const record = JSON.parse(lines[0]!);
    expect(lines).toHaveLength(1);
    expect(record.attempts).toEqual([]);
    expect(lines[0]).not.toContain("private");
  });

  it("keeps attempt metadata when empty usage is returned and derives unknown count from actual calls", () => {
    const lines: string[] = [];
    const telemetry = createCoachTelemetry("69ecddaa-95fb-4dc5-a6f6-4e567c814823", (line) => lines.push(line));
    telemetry.attempt({ step: 1, attempt: 1, kind: "initial", provider: "gemini", model: "gemini-test", status: "transport_success", latencyMs: 1, usage: {} });
    telemetry.finish({ status: "failed", stopReason: "provider_failed", stepCount: 1, toolCallCount: 0, providerAttemptCount: 2, elapsedMs: 10 });
    const record = JSON.parse(lines[0]!);
    expect(record.attempts).toEqual([{ step: 1, attempt: 1, kind: "initial", provider: "gemini", model: "gemini-test", status: "transport_success", latencyMs: 1 }]);
    expect(record.attemptUsage).toEqual({ usageReportedAttempts: 0, unknownAttempts: 2 });
  });
});
