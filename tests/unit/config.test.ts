import { describe, expect, it } from "vitest";
import { serverConfigSchema } from "@contracts/game.schemas";

/**
 * The schema is tested here; loadConfig (which maps PORT -> port etc.) arrives
 * in Step 4 and will reuse this schema rather than re-validating by hand.
 */
describe("serverConfigSchema", () => {
  it("applies the locked defaults when nothing is configured", () => {
    expect(serverConfigSchema.parse({})).toEqual({
      port: 3000,
      nodeEnv: "development",
      roundDurationMs: 90_000,
      countdownMs: 3_000,
      completedRoomTtlMs: 300_000,
      waitingRoomTtlMs: 1_800_000,
    });
  });

  it("coerces the string values that real environment variables provide", () => {
    const config = serverConfigSchema.parse({
      port: "8080",
      nodeEnv: "production",
      roundDurationMs: "60000",
      countdownMs: "5000",
    });
    expect(config.port).toBe(8080);
    expect(config.roundDurationMs).toBe(60_000);
    expect(config.nodeEnv).toBe("production");
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ["a port of zero", { port: "0" }],
    ["a port above the 16-bit range", { port: "70000" }],
    ["a non-numeric port", { port: "abc" }],
    ["an empty port string", { port: "" }],
    ["a fractional port", { port: "3000.5" }],
    ["an unknown NODE_ENV", { nodeEnv: "staging" }],
    ["a round shorter than 5s", { roundDurationMs: "4999" }],
    ["a round longer than 10min", { roundDurationMs: "600001" }],
    ["a countdown under 1s", { countdownMs: "999" }],
    ["a countdown over 30s", { countdownMs: "30001" }],
    ["a completed-room TTL under 10s", { completedRoomTtlMs: "9999" }],
    ["a waiting-room TTL under 1min", { waitingRoomTtlMs: "59999" }],
  ];

  it.each(invalid)("rejects %s", (_name, patch) => {
    expect(serverConfigSchema.safeParse(patch).success).toBe(false);
  });

  it("never produces NaN for a bad numeric value", () => {
    const result = serverConfigSchema.safeParse({ roundDurationMs: "not-a-number" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["roundDurationMs"]);
    }
  });
});
