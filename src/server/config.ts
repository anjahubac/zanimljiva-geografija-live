import { serverConfigSchema } from "@contracts/game.schemas";
import type { ServerConfig } from "@contracts/game.schemas";
import type { ZodIssue } from "zod";

/** Environment variable name -> config field. The only mapping in the system. */
const ENV_KEYS = {
  PORT: "port",
  NODE_ENV: "nodeEnv",
  ROUND_DURATION_MS: "roundDurationMs",
  COUNTDOWN_MS: "countdownMs",
  COMPLETED_ROOM_TTL_MS: "completedRoomTtlMs",
  WAITING_ROOM_TTL_MS: "waitingRoomTtlMs",
} as const;

/**
 * Zod's default text for a bad enum quotes the received value back. A
 * mis-assigned variable could hold a credential, so the expectation is reported
 * without the offending value; every other issue message states bounds only.
 */
function safeMessage(issue: ZodIssue): string {
  if (issue.code === "invalid_enum_value") {
    return `expected one of ${issue.options.map((option) => String(option)).join(", ")}`;
  }
  return issue.message;
}

/**
 * Parses the environment once at startup. An out-of-range or unparsable value
 * fails loudly here rather than becoming a NaN timer later. The thrown message
 * names the offending fields but never echoes environment contents (module 05).
 */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const candidate: Record<string, unknown> = {};
  for (const [envKey, field] of Object.entries(ENV_KEYS)) {
    const value = env[envKey];
    // An unset variable falls through to the schema default; a set-but-empty
    // one is a deployment mistake and is reported, not silently defaulted.
    if (value !== undefined) {
      candidate[field] = value;
    }
  }

  const result = serverConfigSchema.safeParse(candidate);
  if (!result.success) {
    const fieldToEnv = new Map<string, string>(
      Object.entries(ENV_KEYS).map(([envKey, field]) => [field, envKey]),
    );
    const details = result.error.issues
      .map((issue) => {
        const field = String(issue.path[0] ?? "");
        return `${fieldToEnv.get(field) ?? field}: ${safeMessage(issue)}`;
      })
      .join("; ");
    throw new Error(`Invalid server configuration -> ${details}`);
  }

  return result.data;
}
