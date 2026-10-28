import type { AiOperation, AttemptKind } from "./types";

/*
 * Local debugging aid — a bounded exception to constitution VIII (amendment 1.1.0).
 *
 * With AI_DEBUG_LOG=1 in a *local* environment, every attempt prints to the
 * server terminal what we sent (the user content: letter and answers) and what
 * the model replied. It never prints the key, headers or the system prompt,
 * never reaches the browser, and is forced off on Vercel and in production even
 * if the variable is set there.
 */

export type DebugEntry = {
  operation: AiOperation;
  promptVersion: string;
  n: number;
  model: string;
  kind: AttemptKind;
  latencyMs: number;
  sent: string;
  /** The model's raw text, or null when the attempt failed before a reply. */
  reply: string | null;
  /** "ok", a validation failure code, or the provider error class. */
  result: string;
};

export type DebugSink = (entry: DebugEntry) => void;

export type DebugEnv = Partial<Record<"AI_DEBUG_LOG" | "VERCEL" | "NODE_ENV", string>>;

const MAX_PRINTED = 6_000;

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text.length > MAX_PRINTED ? `${text.slice(0, MAX_PRINTED)}… [${text.length - MAX_PRINTED} more characters]` : text;
  }
}

export function isDebugLogEnabled(env: DebugEnv): boolean {
  return env.AI_DEBUG_LOG === "1" && !env.VERCEL && env.NODE_ENV !== "production";
}

export function formatDebugEntry(entry: DebugEntry): string {
  return [
    `[ai.debug] ${entry.operation} (${entry.promptVersion}) attempt ${entry.n} ${entry.kind} ` +
      `${entry.model} → ${entry.result} in ${entry.latencyMs} ms`,
    `  sent:  ${entry.sent}`,
    `  reply: ${entry.reply === null ? "(none)" : pretty(entry.reply).replace(/\n/g, "\n         ")}`,
  ].join("\n");
}

/** Returns a sink only when debugging is allowed here; otherwise undefined (nothing is printed). */
export function createDebugSink(env: DebugEnv, write: (line: string) => void = (line) => console.info(line)): DebugSink | undefined {
  if (!isDebugLogEnabled(env)) return undefined;
  return (entry) => {
    if (entry.operation === "post-round-coach") return;
    write(formatDebugEntry(entry));
  };
}
