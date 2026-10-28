/*
 * W08 before/after probe. Runs the same synthetic inputs against whatever
 * commit is checked out, through the public server interface only, so the
 * identical script measures the baseline and the hardened build.
 *
 *   npx tsx scripts/w08-before-after.ts before   (on the W05 checkpoint)
 *   npx tsx scripts/w08-before-after.ts after    (on the W08 branch)
 *
 * Fake provider only; no key is read and no network call leaves the machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CLIENT_EVENTS } from "../src/contracts/socket.schemas";
import { createPostRoundCoach } from "../src/server/features/post-round-coach";
import type { ModelCall, ProviderAdapter } from "../src/server/ai/types";
import { emitAck } from "../tests/helpers/socket-client";
import { startTestServer } from "../tests/helpers/test-server";
import { coachRequestFor, playRoundToResults } from "../tests/helpers/coach-round";

const label = process.argv[2] === "after" ? "after" : "before";
const toolRequest = JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "overview" } } });
const final = JSON.stringify({ kind: "final", final: { findingIds: ["cell:city"], recommendations: [{ code: "practice_recall", category: "city", evidenceIds: ["cell:city"] }], completed: true } });

/** Holds every call open until `release()`, counting how many are in flight at once. */
function gatedAdapter() {
  const calls: ModelCall[] = [];
  let active = 0;
  let maxActive = 0;
  let open = false;
  const waiters: Array<() => void> = [];
  const adapter: ProviderAdapter = {
    provider: "gemini",
    async generate(call) {
      calls.push(call);
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (!open) {
          await new Promise<void>((resolve) => {
            waiters.push(resolve);
            call.signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
        if (call.signal.aborted) return { ok: false, error: { code: "cancelled" } };
        return { ok: true, text: call.userContent.includes("evidence") ? final : toolRequest };
      } finally {
        active -= 1;
      }
    },
  };
  return {
    adapter, calls,
    stats: () => ({ adapterCalls: calls.length, active, maxActive }),
    release: () => { open = true; for (const wake of waiters.splice(0)) wake(); },
  };
}

/** Captures what the server writes to its operational log during `run`. */
async function captureLogs<T>(run: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const original = { info: console.info, error: console.error, warn: console.warn };
  console.info = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    return { value: await run(), lines };
  } finally {
    Object.assign(console, original);
  }
}

function ackOrDisconnect(socket: import("socket.io-client").Socket, payload: unknown, timeoutMs = 1_500) {
  return new Promise<{ ack?: unknown; disconnected?: string; timedOut?: true }>((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    socket.once("disconnect", (reason) => { clearTimeout(timer); resolve({ disconnected: reason }); });
    socket.emit(CLIENT_EVENTS.review, payload, (ack: unknown) => { clearTimeout(timer); resolve({ ack }); });
  });
}

async function scenarioOversized() {
  const gate = gatedAdapter();
  gate.release();
  const coach = createPostRoundCoach({ adapter: gate.adapter, modelChain: ["fake"], thinkingLevel: null, writeTelemetry: () => {} });
  const ctx = await startTestServer({ coach });
  try {
    const played = await playRoundToResults(ctx);
    const payload = { ...coachRequestFor(played.roundId), padding: "x".repeat(64 * 1024) };
    const outcome = await ackOrDisconnect(played.p1, payload);
    const stats = gate.stats();
    played.p1.disconnect(); played.p2.disconnect();
    return { input: "valid coach request + 64 KiB extra field", outcome, adapterCalls: stats.adapterCalls };
  } finally {
    await ctx.close();
  }
}

async function scenarioConcurrency() {
  const gate = gatedAdapter();
  const coach = createPostRoundCoach({ adapter: gate.adapter, modelChain: ["fake"], thinkingLevel: null, writeTelemetry: () => {} });
  const ctx = await startTestServer({ coach });
  try {
    const rounds = [];
    for (let index = 0; index < 4; index += 1) rounds.push(await playRoundToResults(ctx, { names: [`A${index}`, `B${index}`] }));
    const pending = rounds.slice(0, 3).map((round) => emitAck(round.p1, CLIENT_EVENTS.review, coachRequestFor(round.roundId)));
    const early = await Promise.race([
      Promise.allSettled(pending.map((each) => Promise.race([each, new Promise((resolve) => setTimeout(() => resolve("pending"), 300))]))),
    ]);
    const whileHeld = gate.stats();
    gate.release();
    const settled = await Promise.all(pending);
    const after = await emitAck(rounds[3]!.p1, CLIENT_EVENTS.review, coachRequestFor(rounds[3]!.roundId));
    for (const round of rounds) { round.p1.disconnect(); round.p2.disconnect(); }
    const summarize = (ack: unknown) => {
      const value = ack as { ok: boolean; data?: { status: string; providerAttemptCount: number }; error?: { code: string } };
      return value.ok ? { ok: true, status: value.data?.status, providerAttemptCount: value.data?.providerAttemptCount } : { ok: false, code: value.error?.code };
    };
    return {
      input: "3 simultaneous coach requests (3 rooms) while the fake provider holds every call open",
      firstResponsesWithin300ms: early.map((entry) => entry.status === "fulfilled" && entry.value === "pending" ? "pending" : summarize((entry as PromiseFulfilledResult<unknown>).value)),
      maxConcurrentProviderCalls: whileHeld.maxActive,
      finalAcks: settled.map(summarize),
      nextLegitimateRequestAfterRelease: summarize(after),
      totalAdapterCalls: gate.stats().adapterCalls,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioHeaders() {
  const ctx = await startTestServer();
  try {
    const response = await fetch(`http://localhost:${ctx.port}/`);
    await response.arrayBuffer();
    const pick = (name: string) => response.headers.get(name);
    return {
      input: "GET / from the production static server",
      status: response.status,
      contentSecurityPolicy: pick("content-security-policy"),
      xContentTypeOptions: pick("x-content-type-options"),
      referrerPolicy: pick("referrer-policy"),
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioSecurityEvent() {
  const gate = gatedAdapter();
  gate.release();
  const coach = createPostRoundCoach({ adapter: gate.adapter, modelChain: ["fake"], thinkingLevel: null, writeTelemetry: () => {} });
  const ctx = await startTestServer({ coach, writeSecurityEvent: (line: string) => console.info(line) });
  try {
    const played = await playRoundToResults(ctx);
    const { value: ack, lines } = await captureLogs(async () => {
      const result = await emitAck(played.p1, CLIENT_EVENTS.review, { ...coachRequestFor(played.roundId), role: "admin", maxSteps: 999 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return result;
    });
    played.p1.disconnect(); played.p2.disconnect();
    const events = lines.flatMap((line) => { try { const parsed = JSON.parse(line) as { event?: string }; return parsed.event ? [parsed] : []; } catch { return []; } });
    return { input: "coach request with role=admin and maxSteps=999", ack, adapterCalls: gate.stats().adapterCalls, securityEvents: events };
  } finally {
    await ctx.close();
  }
}

const report = {
  label,
  recordedAt: new Date().toISOString(),
  oversizedPayload: await scenarioOversized(),
  concurrency: await scenarioConcurrency(),
  headers: await scenarioHeaders(),
  rejectedRequestEvent: await scenarioSecurityEvent(),
};
mkdirSync("docs/runs/w08", { recursive: true });
writeFileSync(`docs/runs/w08/before-after-${label}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.info(JSON.stringify(report, null, 2));
process.exit(0);
