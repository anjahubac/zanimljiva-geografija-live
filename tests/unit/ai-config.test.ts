import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_CHAIN, loadAiConfig } from "@server/ai/config";

const KEY = "AIzaSy-test-key-not-real-0000000000000";

describe("loadAiConfig", () => {
  it("is not configured without a key, and does not throw (W04: missing key must not crash)", () => {
    expect(loadAiConfig({})).toEqual({ configured: false, reason: "missing_key" });
    expect(loadAiConfig({ GEMINI_API_KEY: "   " })).toEqual({ configured: false, reason: "missing_key" });
  });

  it("needs only the key; the chain defaults to plan A (lite first, Flash as last resort)", () => {
    const config = loadAiConfig({ GEMINI_API_KEY: KEY });
    expect(config).toMatchObject({ configured: true, modelChain: DEFAULT_MODEL_CHAIN, thinkingLevel: null });
    // gemini-3.5-flash is held back until its live capability check passes.
    expect(DEFAULT_MODEL_CHAIN).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"]);
  });

  it("parses, trims and de-duplicates an overriding chain", () => {
    const config = loadAiConfig({
      GEMINI_API_KEY: KEY,
      GEMINI_MODEL_CHAIN: " gemini-3.5-flash-lite , gemini-3.5-flash-lite,gemini-3.6-flash ,",
    });
    expect(config).toMatchObject({ modelChain: ["gemini-3.5-flash-lite", "gemini-3.6-flash"] });
  });

  it.each([
    "gemini-3.1-pro-preview",
    "gemini-flash-latest",
    "gpt-5",
    "../../etc/passwd",
    "gemini-3.5-flash lite",
  ])("refuses a model id outside the allowlist pattern: %s", (model) => {
    expect(loadAiConfig({ GEMINI_API_KEY: KEY, GEMINI_MODEL_CHAIN: model })).toEqual({
      configured: false,
      reason: "invalid_model_chain",
    });
  });

  it("accepts only known thinking levels", () => {
    expect(loadAiConfig({ GEMINI_API_KEY: KEY, GEMINI_THINKING_LEVEL: "low" })).toMatchObject({ thinkingLevel: "low" });
    expect(loadAiConfig({ GEMINI_API_KEY: KEY, GEMINI_THINKING_LEVEL: "" })).toMatchObject({ thinkingLevel: null });
    expect(loadAiConfig({ GEMINI_API_KEY: KEY, GEMINI_THINKING_LEVEL: "ultra" })).toEqual({
      configured: false,
      reason: "invalid_thinking_level",
    });
  });

  it("never puts the key into anything but the apiKey field", () => {
    const config = loadAiConfig({ GEMINI_API_KEY: KEY, GEMINI_MODEL_CHAIN: "bad model" });
    expect(JSON.stringify(config)).not.toContain(KEY);
  });
});
