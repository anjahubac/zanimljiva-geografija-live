import { describe, expect, it } from "vitest";
import { createFakeCoachAdapter, makeCoachSource } from "../fakes/fake-coach";

describe("scripted coach provider fake", () => {
  it("records the exact adapter calls while preserving usage and raw model text for validators", async () => {
    const scripted = createFakeCoachAdapter([{ ok: true, text: "{\"kind\":\"refusal\"}", usage: { totalTokens: 3 } }]);
    const call = { model: "gemini-test", systemInstruction: "trusted", userContent: "safe facts", responseJsonSchema: {}, temperature: 0, maxOutputTokens: 1024, thinkingLevel: null, signal: new AbortController().signal };
    await expect(scripted.adapter.generate(call)).resolves.toMatchObject({ ok: true, usage: { totalTokens: 3 } });
    expect(scripted.calls).toEqual([call]);
  });

  it("builds a source fixture with the canonical eight categories and no answer text", () => {
    const source = makeCoachSource();
    expect(source.cells).toHaveLength(8);
    expect(JSON.stringify(source)).not.toMatch(/answer|raw|normalized/i);
  });
});
