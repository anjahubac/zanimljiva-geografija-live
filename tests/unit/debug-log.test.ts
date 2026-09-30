import { describe, expect, it } from "vitest";
import { createDebugSink, formatDebugEntry, isDebugLogEnabled } from "@server/ai/debug-log";

describe("AI_DEBUG_LOG — local raw logging (constitution 1.1.0 exception)", () => {
  it("is on only when asked for, and never on Vercel or in production", () => {
    expect(isDebugLogEnabled({})).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "true" })).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1" })).toBe(true);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1", VERCEL: "1" })).toBe(false);
    expect(isDebugLogEnabled({ AI_DEBUG_LOG: "1", NODE_ENV: "production" })).toBe(false);
    expect(createDebugSink({})).toBeUndefined();
  });

  it("formats what was sent and the model's reply, pretty-printing JSON", () => {
    const text = formatDebugEntry({
      operation: "check-round",
      promptVersion: "check-round.v2",
      n: 1,
      model: "gemini-3.5-flash-lite",
      kind: "initial",
      latencyMs: 812,
      sent: '{"letter":"N"}',
      reply: '{"items":[]}',
      result: "ok",
    });
    expect(text).toContain("[ai.debug] check-round (check-round.v2) attempt 1 initial gemini-3.5-flash-lite → ok in 812 ms");
    expect(text).toContain('sent:  {"letter":"N"}');
    expect(text).toContain('"items": []');
  });
});
