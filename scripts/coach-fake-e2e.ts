import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { coachSourceSchema } from "../src/contracts/coach.schemas";
import { createPostRoundCoach } from "../src/server/features/post-round-coach";
import { coachFailure, coachJson, createFakeCoachAdapter } from "../tests/fakes/fake-coach";

const roundId = "11111111-2222-4333-8444-555555555555";
const toolRequest = JSON.stringify({ kind: "tool_request", toolRequest: { name: "analyze_round", arguments: { focus: "overview" } } });
const final = JSON.stringify({ kind: "final", final: { findingIds: ["cell:country"], recommendations: [{ code: "practice_recall", category: "country", evidenceIds: ["cell:country"] }], completed: true } });
const source = coachSourceSchema.parse({
  letter: "S", alphabet: "sr", verified: true, total: 0,
  cells: ["country", "city", "river", "mountain", "sea", "animal", "plant", "thing"].map((category) => ({ category, blank: true, accepted: false, rejectReason: null, hinted: false, points: 0, scoringReason: "neither" })),
});

async function observe(name: string, adapter: Parameters<typeof createPostRoundCoach>[0]["adapter"], getAdapterCalls: () => number, schedule?: (at: number, fn: () => void) => () => void) {
  const traceLines: string[] = [];
  const coach = createPostRoundCoach({ adapter, modelChain: ["fake-model"], thinkingLevel: null, writeTelemetry: (line) => traceLines.push(line) });
  const view = await coach.run({
    runId: randomUUID(), roundId, source, language: "en", sourceVersion: `fake-${name}`,
    authorizeAndCharge: () => true,
    ...(schedule ? { schedule, now: () => now } : {}),
  });
  return {
    scenario: name, status: view.status, stopReason: view.stopReason, stepCount: view.stepCount,
    toolCallCount: view.toolCallCount, providerAttemptCount: view.providerAttemptCount,
    adapterCallCount: getAdapterCalls(), elapsedMs: view.elapsedMs,
    trace: traceLines.map((line) => JSON.parse(line)), result: view.result,
    usageKind: "scripted fake-provider usage, not live billing usage",
  };
}

let now = 1_000;
const deadlineSchedule = (at: number, fn: () => void) => {
  const delay = at - 1_000 >= 30_000 ? 0 : 20;
  const timer = setTimeout(() => { now = Math.max(now, at); fn(); }, delay);
  return () => clearTimeout(timer);
};

const success = createFakeCoachAdapter([coachJson(toolRequest), coachJson(final)]);
const unknown = createFakeCoachAdapter([coachJson(JSON.stringify({ kind: "tool_request", toolRequest: { name: "lookup_answer", arguments: {} } }))]);
const failed = createFakeCoachAdapter([coachFailure("auth_config")]);
let hangingCalls = 0;
const hangingAdapter = { provider: "gemini" as const, async generate() { hangingCalls += 1; return await new Promise<never>(() => {}); } };
const observations = [
  await observe("success", success.adapter, () => success.calls.length),
  await observe("unknown_tool", unknown.adapter, () => unknown.calls.length),
  await observe("provider_failure", failed.adapter, () => failed.calls.length),
  await observe("deadline", hangingAdapter, () => hangingCalls, deadlineSchedule),
];

if (observations[0]?.stopReason !== "completed" || observations[1]?.stopReason !== "unknown_tool" || observations[2]?.stopReason !== "provider_failed" || observations[3]?.stopReason !== "deadline") {
  throw new Error("coach fake end-to-end scenario did not match its expected terminal state");
}
if (observations.some((run) => run.adapterCallCount !== run.providerAttemptCount) || observations[0]?.toolCallCount !== 1 || observations[0].stepCount !== 2 || observations[1]?.toolCallCount !== 0) {
  throw new Error("coach fake end-to-end counters do not match actual adapter/tool work");
}

const outputDir = new URL("../docs/runs/w05/", import.meta.url);
mkdirSync(outputDir, { recursive: true });
for (const observation of observations) {
  writeFileSync(new URL(`${observation.scenario}.json`, outputDir), `${JSON.stringify({ observedAt: new Date().toISOString(), ...observation }, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(observations, null, 2)}\n`);
