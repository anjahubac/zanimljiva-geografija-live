import { describe, expect, it } from "vitest";
import { serverConfigSchema } from "@contracts/game.schemas";
import { loadConfig } from "@server/config";

/**
 * The schema owns the bounds; loadConfig owns only the ENV_NAME -> field
 * mapping and the readable failure message. Neither re-validates by hand.
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

describe("loadConfig", () => {
  it("returns the locked defaults for an empty environment", () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      nodeEnv: "development",
      roundDurationMs: 90_000,
      countdownMs: 3_000,
      completedRoomTtlMs: 300_000,
      waitingRoomTtlMs: 1_800_000,
    });
  });

  it("maps every documented environment variable onto its config field", () => {
    expect(
      loadConfig({
        PORT: "8080",
        NODE_ENV: "production",
        ROUND_DURATION_MS: "60000",
        COUNTDOWN_MS: "5000",
        COMPLETED_ROOM_TTL_MS: "60000",
        WAITING_ROOM_TTL_MS: "120000",
      }),
    ).toEqual({
      port: 8080,
      nodeEnv: "production",
      roundDurationMs: 60_000,
      countdownMs: 5_000,
      completedRoomTtlMs: 60_000,
      waitingRoomTtlMs: 120_000,
    });
  });

  it("ignores environment variables it does not own", () => {
    const config = loadConfig({ PATH: "/usr/bin", SOME_SECRET: "hunter2", PORT: "4000" });
    expect(config.port).toBe(4000);
    expect(Object.keys(config).sort()).toEqual([
      "completedRoomTtlMs",
      "countdownMs",
      "nodeEnv",
      "port",
      "roundDurationMs",
      "waitingRoomTtlMs",
    ]);
  });

  const rejected: Array<[string, NodeJS.ProcessEnv, string]> = [
    ["an out-of-range port", { PORT: "70000" }, "PORT"],
    ["a non-numeric port", { PORT: "abc" }, "PORT"],
    ["a set-but-empty variable", { COUNTDOWN_MS: "" }, "COUNTDOWN_MS"],
    ["an unknown NODE_ENV", { NODE_ENV: "staging" }, "NODE_ENV"],
    ["a round below the floor", { ROUND_DURATION_MS: "4999" }, "ROUND_DURATION_MS"],
    ["a round above the ceiling", { ROUND_DURATION_MS: "600001" }, "ROUND_DURATION_MS"],
    ["a countdown above the ceiling", { COUNTDOWN_MS: "30001" }, "COUNTDOWN_MS"],
    ["a completed-room TTL below the floor", { COMPLETED_ROOM_TTL_MS: "9999" }, "COMPLETED_ROOM_TTL_MS"],
    ["a waiting-room TTL below the floor", { WAITING_ROOM_TTL_MS: "59999" }, "WAITING_ROOM_TTL_MS"],
  ];

  it.each(rejected)("throws on %s, naming the variable", (_name, env, variable) => {
    expect(() => loadConfig(env)).toThrow(new RegExp(`Invalid server configuration.*${variable}`));
  });

  it("does not echo the offending value into the error message", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    try {
      loadConfig({ NODE_ENV: "staging" });
    } catch (error) {
      expect(String(error)).not.toContain("staging");
    }
  });
});
